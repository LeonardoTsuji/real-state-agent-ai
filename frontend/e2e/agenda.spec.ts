import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
const apiURL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000/api";
const email = process.env.E2E_BROKER_EMAIL ?? "marina@copilot.demo";
const password = process.env.E2E_PASSWORD ?? "DemoCopilot2026!";
type Fixture = {
  token: string;
  leadId: string;
  propertyId: string;
  name: string;
};
const testLeads = new Map<string, string>();
test.afterEach(async ({ request }) => {
  for (const [leadId, token] of testLeads) {
    await send(request, token, `/leads/${leadId}`, undefined, "DELETE");
    testLeads.delete(leadId);
  }
});
async function send(
  request: APIRequestContext,
  token: string,
  path: string,
  data?: unknown,
  method = "POST",
) {
  const result = await request.fetch(`${apiURL}${path}`, {
    method,
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  expect(result.ok(), `${method} ${path}: ${await result.text()}`).toBeTruthy();
  return result.status() === 204 ? null : result.json();
}
async function fixture(request: APIRequestContext): Promise<Fixture> {
  const response = await request.post(`${apiURL}/auth/login`, {
    data: { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const token = (await response.json()).accessToken;
  const properties = await send(
    request,
    token,
    "/properties?limit=100",
    undefined,
    "GET",
  );
  expect(properties.items.length).toBeGreaterThan(0);
  const name = `QA Visita ${Date.now()}`;
  const lead = await send(request, token, "/leads", {
    name,
    email: `agenda-${Date.now()}@example.test`,
  });
  testLeads.set(lead.id, token);
  await send(
    request,
    token,
    `/leads/${lead.id}/stage`,
    { stage: "CONTACTED" },
    "PATCH",
  );
  await send(
    request,
    token,
    `/leads/${lead.id}/stage`,
    { stage: "QUALIFIED" },
    "PATCH",
  );
  return { token, leadId: lead.id, propertyId: properties.items[0].id, name };
}
async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail profissional").fill(email);
  await page.getByLabel("Senha de acesso").fill(password);
  await page
    .getByRole("button", { name: "Entrar no Corretor Copilot" })
    .click();
  await expect(page).toHaveURL(/\/leads$/);
}
async function navigate(page: Page, path: string) {
  await page.evaluate((path) => {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
function localFuture(days: number, hour: number) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() + days * 86400000));
  return `${parts}T${String(hour).padStart(2, "0")}:00`;
}
const utc = (value: string) => new Date(`${value}-03:00`).toISOString();
test("visita registra chegada, recupera rascunho e conclui feedback com estágio e tarefa", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const startAt = utc(localFuture(47, 14)),
    endAt = utc(localFuture(47, 15));
  let visitId: string | undefined;
  try {
    const v = await send(request, f.token, "/visits", {
      leadId: f.leadId,
      propertyId: f.propertyId,
      startAt,
      endAt,
    });
    visitId = v.id;
    await login(page);
    await navigate(page, `/visitas/${v.id}`);
    await expect(page.getByText(f.name).first()).toBeVisible();
    await page
      .getByRole("button", { name: "Confirmar chegada", exact: true })
      .click();
    await expect(page.getByText(/Presença registrada/)).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Conhecer ambientes e iluminação" })
      .check();
    await expect(
      page.getByRole("checkbox", { name: "Conhecer ambientes e iluminação" }),
    ).toBeChecked();
    await page
      .getByLabel("Rascunho de feedback")
      .fill("Cliente gostou da iluminação e quer negociar.");
    await page
      .getByRole("button", { name: "Salvar rascunho", exact: true })
      .click();
    await expect(
      page.getByText(/Rascunho salvo: Cliente gostou/),
    ).toBeVisible();
    await navigate(page, "/agenda");
    await expect(
      page.getByRole("heading", { name: "Agenda de visitas", exact: true }),
    ).toBeVisible();
    await navigate(page, `/visitas/${v.id}`);
    await expect(page.getByLabel("Rascunho de feedback")).toHaveValue(
      "Cliente gostou da iluminação e quer negociar.",
    );
    await page
      .getByRole("button", { name: "Concluir visita e avaliar" })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Concluir visita · Feedback",
    });
    await dialog.getByRole("button", { name: "5 estrelas" }).click();
    await dialog
      .getByLabel("Pontos positivos")
      .fill("Luz natural e localização");
    await dialog
      .getByLabel("Atualizar estágio (opcional)")
      .selectOption("NEGOTIATION");
    await dialog
      .getByLabel("Próxima tarefa (opcional)")
      .fill("Preparar proposta QA");
    await dialog
      .getByLabel("Prazo da tarefa (São Paulo)")
      .fill(localFuture(48, 10));
    await dialog
      .getByRole("button", { name: "Concluir e registrar feedback" })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Visita concluída", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("5 / 5 estrelas")).toBeVisible();
    const persisted = await send(
      request,
      f.token,
      `/visits/${v.id}`,
      undefined,
      "GET",
    );
    expect(persisted.status).toBe("COMPLETED");
    expect(persisted.feedback.rating).toBe(5);
    expect(persisted.feedback.notes).toContain("iluminação");
    expect(persisted.feedbackDraft).toBeNull();
    expect(persisted.checklist["0"]).toBe(true);
    const lead = await send(
      request,
      f.token,
      `/leads/${f.leadId}`,
      undefined,
      "GET",
    );
    expect(lead.stage).toBe("NEGOTIATION");
    const tasks = await send(
      request,
      f.token,
      `/tasks?leadId=${f.leadId}`,
      undefined,
      "GET",
    );
    expect(
      tasks.items.some(
        (task: { title: string }) => task.title === "Preparar proposta QA",
      ),
    ).toBe(true);
  } finally {
    if (visitId) {
      const state = await send(
        request,
        f.token,
        `/visits/${visitId}`,
        undefined,
        "GET",
      );
      if (state.status === "SCHEDULED")
        await send(request, f.token, `/visits/${visitId}/cancel`, {
          reason: "Limpeza do teste de visita",
        });
    }
  }
});
test("pré-reserva mostra falha simulada, expira sem resposta e libera o mesmo horário", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const start = localFuture(2, 16),
    end = localFuture(2, 17);
  let reservationId: string | undefined;
  let visitId: string | undefined;
  try {
    await login(page);
    await navigate(
      page,
      `/agenda?leadId=${f.leadId}&propertyId=${f.propertyId}`,
    );
    for (let day = 0; day < 2; day++)
      await page.getByRole("button", { name: "→", exact: true }).click();
    await page
      .getByRole("button", { name: "Propor encaixe", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Propor encaixe inteligente",
    });
    await dialog.getByLabel("Cliente", { exact: true }).selectOption(f.leadId);
    await dialog
      .getByLabel("Imóvel", { exact: true })
      .selectOption(f.propertyId);
    await dialog.getByLabel("Início (São Paulo)").fill(start);
    await dialog.getByLabel("Término (São Paulo)").fill(end);
    const registered = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/scheduling/reservations") &&
        r.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Confirmar envio simulado" })
      .click();
    const response = await registered;
    expect(response.ok()).toBeTruthy();
    const reservation = await response.json();
    reservationId = reservation.id;
    await expect(dialog).not.toBeVisible();
    const card = page.locator(".agenda-event").filter({ hasText: f.name });
    await expect(card).toBeVisible();
    await card
      .getByRole("button", { name: "Simular falha no envio", exact: true })
      .click();
    await expect(
      card.getByText("Falha no envio simulado", { exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", {
        name: "Simular ausência de resposta",
        exact: true,
      })
      .click();
    await expect(card.getByText("Expirada", { exact: true })).toBeVisible();
    const reservations = await send(
      request,
      f.token,
      "/scheduling/reservations",
      undefined,
      "GET",
    );
    expect(
      reservations.find((r: { id: string }) => r.id === reservation.id).status,
    ).toBe("EXPIRED");
    const v = await send(request, f.token, "/visits", {
      leadId: f.leadId,
      propertyId: f.propertyId,
      startAt: utc(start),
      endAt: utc(end),
    });
    visitId = v.id;
    expect(v.status).toBe("SCHEDULED");
    const lead = await send(
      request,
      f.token,
      `/leads/${f.leadId}`,
      undefined,
      "GET",
    );
    expect(lead.stage).toBe("QUALIFIED");
  } finally {
    if (visitId)
      await send(request, f.token, `/visits/${visitId}/cancel`, {
        reason: "Limpeza do teste de reserva",
      });
    if (reservationId) {
      const list = await send(
        request,
        f.token,
        "/scheduling/reservations",
        undefined,
        "GET",
      );
      if (
        list.find((r: { id: string }) => r.id === reservationId)?.status ===
        "PENDING"
      )
        await send(
          request,
          f.token,
          `/scheduling/reservations/${reservationId}/decision`,
          { confirmed: false },
        );
    }
  }
});

test("associação solicita avaliação manual e preserva a compatibilidade pelas preferências", async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const before = await send(
    request,
    f.token,
    `/properties/${f.propertyId}/compatibility?leadId=${f.leadId}`,
    undefined,
    "GET",
  );
  await login(page);
  await navigate(page, `/imoveis?leadId=${f.leadId}`);
  await expect(
    page.getByRole("heading", { name: "Catálogo de imóveis", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Associar lead", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Associar imóvel ao lead" });
  await dialog.getByLabel("Lead", { exact: true }).selectOption(f.leadId);
  await dialog.getByLabel("Afinidade manual (0 a 100)").fill("37");
  const registered = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/leads/${f.leadId}/matches`) &&
      r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Confirmar associação" }).click();
  const response = await registered;
  expect(response.ok()).toBeTruthy();
  const match = await response.json();
  expect(match.score).toBe(37);
  await expect(dialog).not.toBeVisible();
  const saved = await send(
    request,
    f.token,
    `/leads/${f.leadId}/matches`,
    undefined,
    "GET",
  );
  expect(
    saved.items.find(
      (item: { propertyId: string }) => item.propertyId === match.propertyId,
    ).score,
  ).toBe(37);
  const after = await send(
    request,
    f.token,
    `/properties/${f.propertyId}/compatibility?leadId=${f.leadId}`,
    undefined,
    "GET",
  );
  expect(after).toEqual(before);
});
