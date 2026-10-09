import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const web = process.env.E2E_WEB_URL ?? "http://127.0.0.1:5173";
const api = process.env.E2E_API_URL ?? "http://127.0.0.1:3000/api";
const password = process.env.E2E_PASSWORD ?? "DemoCopilot2026!";
const output = fileURLToPath(new URL("./screenshots/", import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
});
const evidence = [];
const failures = [];
async function navigate(page, path) {
  await page.evaluate((target) => {
    history.pushState({}, "", target);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}
async function login(page, email) {
  await page.goto(`${web}/login`);
  await page.getByLabel("E-mail profissional").fill(email);
  await page.getByLabel("Senha de acesso").fill(password);
  await page
    .getByRole("button", { name: "Entrar no Corretor Copilot" })
    .click();
  await page.waitForURL("**/leads");
}
async function capture(page, name, width) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
  }));
  await page.screenshot({
    path: `${output}${name}-${width}.png`,
    fullPage: true,
  });
  evidence.push({ name, width, ...dimensions });
  if (dimensions.documentWidth > dimensions.viewportWidth + 1)
    failures.push(`Overflow ${name}@${width}`);
}
async function allWidths(page, name) {
  for (const width of [1440, 768, 390]) await capture(page, name, width);
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(error.message));
  await page.goto(`${web}/login`);
  await allWidths(page, "login");
  await page.getByRole("link", { name: "Cadastrar-se" }).click();
  await expect(page.getByLabel("Confirmar senha")).toBeVisible();
  await allWidths(page, "cadastro");
  await login(page, "marina@copilot.demo");
  await page
    .getByPlaceholder("Buscar por nome, telefone ou e-mail...")
    .fill("Rafael Almeida");
  await page
    .getByRole("row")
    .filter({ hasText: "Rafael Almeida" })
    .getByRole("button", { name: "Ver lead" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Rafael Almeida", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Histórico da conversa")).toBeVisible();
  await allWidths(page, "detalhe-lead");
  await page
    .getByRole("button", { name: "Extrair preferências de um texto" })
    .click();
  const extraction = page.getByRole("dialog", {
    name: "Revisar preferências detectadas",
  });
  await extraction
    .getByLabel("Texto para análise")
    .fill(
      "Procuro apartamento para comprar em Vila Mariana com 2 quartos e até R$ 650 mil.",
    );
  await extraction.getByRole("button", { name: "Analisar texto" }).click();
  await expect(
    extraction.getByRole("button", { name: "Aplicar campos revisados" }),
  ).toBeVisible();
  await allWidths(page, "preferencias-extraidas");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^2\. Preferências$/ }).click();
  await expect(
    page.getByRole("button", { name: "Salvar preferências" }),
  ).toBeVisible();
  await allWidths(page, "preferencias");
  await navigate(page, "/tarefas");
  await expect(
    page.getByRole("heading", {
      name: "Tarefas & Próximas Ações",
      exact: true,
    }),
  ).toBeVisible();
  await allWidths(page, "tarefas");
  await navigate(page, "/configuracoes");
  await expect(
    page.getByRole("heading", { name: "Configurações", exact: true }),
  ).toBeVisible();
  await allWidths(page, "perfil-corretora");
  await navigate(page, "/operacoes/jobs");
  await expect(
    page.getByRole("heading", { name: "Permissão negada" }),
  ).toBeVisible();
  await allWidths(page, "acesso-negado");
  await login(page, "lucas@copilot.demo");
  await navigate(page, "/configuracoes");
  await expect(
    page.getByRole("heading", { name: "Configurações", exact: true }),
  ).toBeVisible();
  await allWidths(page, "perfil-operador");
  await navigate(page, "/operacoes/jobs");
  await expect(
    page.getByRole("heading", { name: "Jobs recentes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Exibindo até 50 jobs recentes. A consulta tem alcance global.",
    ),
  ).toBeVisible();
  await allWidths(page, "operacoes-jobs");
  const tokenResponse = await context.request.post(`${api}/auth/login`, {
    data: { email: "lucas@copilot.demo", password },
  });
  const { accessToken } = await tokenResponse.json();
  const jobsResponse = await context.request.get(
    `${api}/operations/jobs?limit=50`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const jobs = await jobsResponse.json();
  const job = jobs.find((item) => item.status === "FAILED") ?? jobs[0];
  if (job) {
    await navigate(page, `/operacoes/jobs/${job.id}`);
    await expect(
      page.getByRole("heading", { name: "Detalhes do Processamento" }),
    ).toBeVisible();
    await expect(page.getByText(job.id, { exact: true }).first()).toBeVisible();
    await allWidths(page, "operacoes-job");
    if (job.status === "FAILED") {
      await page.getByRole("button", { name: "Reenfileirar job" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await allWidths(page, "operacoes-replay");
      await page.getByRole("button", { name: "Confirmar reenvio" }).click();
      await expect(
        page.getByText(
          "Job reenfileirado. Acompanhe o resultado na fila operacional.",
        ),
      ).toBeVisible();
    }
  }
  await navigate(page, "/operacoes/metricas");
  await expect(
    page.getByRole("heading", { name: "Métricas da Aplicação" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inteligência Artificial" }),
  ).toBeVisible();
  await allWidths(page, "operacoes-metricas");
  await context.close();
} finally {
  await browser.close();
  await writeFile(
    `${output}account-evidence.json`,
    JSON.stringify(
      { capturedAt: new Date().toISOString(), evidence, failures },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ screenshots: evidence.length, failures }, null, 2),
  );
}
if (failures.length) process.exitCode = 1;
