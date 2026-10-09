import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
const apiURL = process.env.E2E_API_URL ?? "http://127.0.0.1:3000/api";
const password = process.env.E2E_PASSWORD ?? "DemoCopilot2026!";
const marina = process.env.E2E_BROKER_EMAIL ?? "marina@copilot.demo";
const lucas = process.env.E2E_OPERATOR_EMAIL ?? "lucas@copilot.demo";
test.use({ actionTimeout: 10000 });
async function login(page: Page, email = marina) {
  await page.goto("/login");
  await page.getByLabel("E-mail profissional").fill(email);
  await page.getByLabel("Senha de acesso").fill(password);
  await page
    .getByRole("button", { name: "Entrar no Corretor Copilot" })
    .click();
  await expect(page).toHaveURL(/\/leads$/);
}
// The session is intentionally in memory. SPA navigation retains it; goto/reload
// represents a new document and must return to login.
async function navigate(page: Page, path: string) {
  await page.evaluate((target) => {
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
async function token(request: APIRequestContext, email = marina) {
  const result = await request.post(`${apiURL}/auth/login`, {
    data: { email, password },
  });
  expect(result.ok()).toBeTruthy();
  return (await result.json()).accessToken as string;
}
async function command(
  request: APIRequestContext,
  auth: string,
  path: string,
  data: unknown,
  method: "POST" | "PATCH" = "POST",
) {
  const response = await request.fetch(`${apiURL}${path}`, {
    method,
    data,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Idempotency-Key": crypto.randomUUID(),
    },
  });
  expect(
    response.ok(),
    `${method} ${path}: ${await response.text()}`,
  ).toBeTruthy();
  return response.json();
}
function localFuture(days: number, hour = 11) {
  const instant = new Date(Date.now() + days * 86400000);
  const date = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

async function availableVisitTime(request: APIRequestContext, auth: string) {
  for (let days = 28; days < 35; days++) {
    const from = `${localFuture(days, 0)}:00-03:00`;
    const to = `${localFuture(days + 1, 0)}:00-03:00`;
    const result = await request.get(`${apiURL}/agenda`, {
      params: { from, to },
      headers: { Authorization: `Bearer ${auth}` },
    });
    expect(result.ok()).toBeTruthy();
    const calendar = (await result.json()) as {
      visits: Array<{ startAt: string; endAt: string; status: string }>;
      reservations: Array<{ startAt: string; endAt: string; status: string }>;
      blocks: Array<{ startAt: string; endAt: string }>;
    };
    const occupied = [
      ...calendar.visits.filter((item) => item.status === "SCHEDULED"),
      ...calendar.reservations.filter((item) => item.status === "PENDING"),
      ...calendar.blocks,
    ];
    for (let hour = 9; hour < 18; hour++) {
      const start = localFuture(days, hour);
      const end = localFuture(days, hour + 1);
      const startAt = new Date(`${start}:00-03:00`).getTime();
      const endAt = new Date(`${end}:00-03:00`).getTime();
      if (
        !occupied.some(
          (item) =>
            new Date(item.startAt).getTime() < endAt &&
            new Date(item.endAt).getTime() > startAt,
        )
      )
        return { start, end };
    }
  }
  throw new Error("No free slot found in the isolated demonstration calendar");
}

test("carteira, visita, dossiê, proposta, aceite e recibo usam API real", async ({
  page,
  request,
}) => {
  const auth = await token(request);
  const propertiesResult = await request.get(`${apiURL}/properties?limit=100`, {
    headers: { Authorization: `Bearer ${auth}` },
  });
  expect(propertiesResult.ok()).toBeTruthy();
  const properties = (await propertiesResult.json()).items as Array<{
    id: string;
    title: string;
    priceCents: number;
  }>;
  expect(properties.length).toBeGreaterThan(1);
  const primary =
    properties.find((property) => /moema/i.test(property.title)) ??
    properties[0]!;
  const alternative = properties.find(
    (property) => property.id !== primary.id,
  )!;
  await login(page);
  const label = `QA Jornada ${Date.now()}`;
  await page.getByRole("button", { name: "Novo lead", exact: true }).click();
  const leadDialog = page.getByRole("dialog", { name: "Novo lead" });
  await leadDialog.getByLabel("Nome completo").fill(label);
  await leadDialog
    .getByLabel("E-mail", { exact: true })
    .fill(`qa-${Date.now()}@example.test`);
  await leadDialog.getByRole("button", { name: "Cadastrar lead" }).click();
  await expect(leadDialog).not.toBeVisible();
  await page
    .getByPlaceholder("Buscar por nome, telefone ou e-mail...")
    .fill(label);
  const row = page.getByRole("row").filter({ hasText: label });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Ver lead" }).click();
  await expect(
    page.getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  const leadId = page.url().split("/leads/")[1]!.split("?")[0]!;
  await command(
    request,
    auth,
    `/leads/${leadId}/stage`,
    { stage: "CONTACTED" },
    "PATCH",
  );
  await command(
    request,
    auth,
    `/leads/${leadId}/stage`,
    { stage: "QUALIFIED" },
    "PATCH",
  );
  await command(
    request,
    auth,
    `/leads/${leadId}/preferences`,
    {
      maxPriceCents: 150000000,
      neighborhoods: ["Moema"],
      types: ["APARTMENT"],
      purposes: ["SALE"],
    },
    "PATCH",
  );

  await navigate(page, `/imoveis/${primary.id}?leadId=${leadId}`);
  await expect(
    page.getByRole("heading", { name: primary.title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Gerar dossiê", exact: true }).click();
  await page.getByRole("link", { name: "Abrir dossiê gerado" }).click();
  await expect(
    page.getByRole("heading", { name: "Dossiê exclusivo" }).first(),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(await download.failure()).toBeNull();

  await navigate(page, `/agenda?leadId=${leadId}&propertyId=${primary.id}`);
  await expect(
    page.getByRole("heading", { name: "Agenda de visitas" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Agendar visita", exact: true })
    .click();
  const visitDialog = page.getByRole("dialog", { name: "Agendar visita" });
  await expect(visitDialog).toBeVisible();
  await visitDialog
    .getByRole("combobox", { name: "Cliente", exact: true })
    .selectOption(leadId);
  await visitDialog
    .getByRole("combobox", { name: "Imóvel", exact: true })
    .selectOption(primary.id);
  const slot = await availableVisitTime(request, auth);
  await visitDialog.getByLabel("Início (São Paulo)").fill(slot.start);
  await visitDialog.getByLabel("Término (São Paulo)").fill(slot.end);
  const scheduled = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/visits") &&
      response.request().method() === "POST",
  );
  await visitDialog
    .getByRole("button", { name: "Confirmar agendamento" })
    .click();
  const visitResponse = await scheduled;
  expect(visitResponse.ok()).toBeTruthy();
  const visit = await visitResponse.json();
  await expect(visitDialog).not.toBeVisible();
  await navigate(page, `/visitas/${visit.id}`);
  await expect(page.getByText(label).first()).toBeVisible();

  await page
    .getByRole("button", { name: "Confirmar chegada", exact: true })
    .click();
  await expect(page.getByText(/Presença registrada/)).toBeVisible();
  await page.getByRole("button", { name: /Concluir visita e avaliar/ }).click();
  const feedback = page.getByRole("dialog", {
    name: "Concluir visita · Feedback",
  });
  await feedback.getByRole("button", { name: "5 estrelas" }).click();
  await feedback.getByLabel("Interesse do cliente").selectOption("HIGH");
  await feedback
    .getByLabel("Pontos positivos")
    .fill("Iluminação e localização.");
  await feedback
    .getByLabel("Observações", { exact: true })
    .fill("Cliente deseja avançar para uma proposta.");
  await feedback
    .getByLabel("Atualizar estágio (opcional)")
    .selectOption("NEGOTIATION");
  await feedback
    .getByRole("button", { name: "Concluir e registrar feedback" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visita concluída" }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Cliente deseja avançar para uma proposta.", { exact: true })
      .first(),
  ).toBeVisible();

  const opportunity = await command(
    request,
    auth,
    "/commercial/opportunities",
    {
      leadId,
      propertyId: primary.id,
      alternativePropertyId: alternative.id,
      estimatedValueCents: 138000000,
      commissionBps: 600,
      title: label,
      stage: "VISIT_SCHEDULED",
    },
  );
  await navigate(page, `/negocios/${opportunity.id}`);
  await page
    .getByRole("button", { name: "Preparar proposta", exact: true })
    .click();
  const proposal = page.getByRole("dialog", { name: "Preparar proposta" });
  await proposal.getByLabel("Valor proposto em R$").fill("1.380.000,00");
  await proposal.getByLabel("Vendedor", { exact: true }).fill("Carlos QA");
  await proposal.getByLabel("Validade (São Paulo)").fill(localFuture(7, 18));
  await proposal
    .getByLabel("Condições de pagamento")
    .fill("Sinal de R$ 200 mil e saldo por financiamento. Demonstração.");
  await proposal.getByLabel("Parcelas dos honorários").selectOption("2");
  await proposal
    .getByRole("button", {
      name: /Confirmar proposta|Registrar proposta|Salvar proposta|Formalizar proposta/,
    })
    .click();
  await expect(proposal).not.toBeVisible();
  await page
    .getByRole("button", { name: /Confirmar aceite|Registrar aceite/ })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Confirmar aceite da proposta" })
    .getByRole("button", { name: "Confirmar aceite simulado" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aceite e comissão confirmada" }),
  ).toBeVisible();
  await expect(page.getByText(/82\.800/).first()).toBeVisible();
  await page
    .getByRole("button", { name: "Simular liquidação", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Simular liquidação de honorários" })
    .getByRole("button", { name: /Confirmar liquidação/ })
    .click();
  await page
    .getByRole("button", { name: "Recibo", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/documentos\//);
  await expect(
    page.getByText("liquidação simulada", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText(/41\.400/).first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/login\?/);
});

test("RBAC operacional permite Lucas e nega Marina sem consultar jobs", async ({
  page,
  request,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/operations")) requests.push(request.url());
  });
  await login(page);
  await navigate(page, "/operacoes/jobs");
  await expect(
    page.getByRole("heading", { name: "Acesso restrito" }),
  ).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Encerrar sessão" }).click();
  await login(page, lucas);
  await navigate(page, "/operacoes/jobs");
  await expect(
    page.getByRole("heading", { name: "Jobs recentes" }),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBeGreaterThan(0);
  const metricsResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/operations/metrics"),
  );
  await page.getByRole("link", { name: "Métricas", exact: true }).click();
  const metrics = (await (await metricsResponse).json()) as Array<{
    count: number;
    attempts: number;
    averageDurationMs: number | null;
  }>;
  for (const metric of metrics) {
    expect(typeof metric.count).toBe("number");
    expect(typeof metric.attempts).toBe("number");
    if (metric.averageDurationMs !== null) {
      expect(typeof metric.averageDurationMs).toBe("number");
      expect(Number.isFinite(metric.averageDurationMs)).toBe(true);
    }
  }
  await expect(
    page.getByRole("heading", { name: "Métricas da Aplicação" }),
  ).toBeVisible();
  const brokerToken = await token(request);
  const denied = await request.get(`${apiURL}/operations/jobs`, {
    headers: { Authorization: `Bearer ${brokerToken}` },
  });
  expect(denied.status()).toBe(403);
});

test("navegação móvel e logout preservam a sessão apenas em memória", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("link", { name: "Imóveis", exact: true }).click();
  await expect(page).toHaveURL(/\/imoveis$/);
  await expect(
    page.getByRole("heading", { name: /Catálogo de imóveis/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir navegação" }).click();
  await page.getByRole("button", { name: "Encerrar sessão" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/agenda");
  await expect(page).toHaveURL(/\/login\?retorno=/);
});
