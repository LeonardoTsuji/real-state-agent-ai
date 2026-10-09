import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const web = process.env.E2E_WEB_URL ?? "http://127.0.0.1:5173";
const api = process.env.E2E_API_URL ?? "http://127.0.0.1:3000/api";
const email = process.env.E2E_BROKER_EMAIL ?? "marina@copilot.demo";
const password = process.env.E2E_PASSWORD ?? "DemoCopilot2026!";
const output = fileURLToPath(new URL("./screenshots/", import.meta.url));
await mkdir(output, { recursive: true });
const auth = await fetch(`${api}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!auth.ok) throw new Error(`Login failed: ${auth.status}`);
const { accessToken } = await auth.json();
async function read(path) {
  const result = await fetch(`${api}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!result.ok) throw new Error(`${path}: ${result.status}`);
  return result.json();
}
const properties = await read("/properties?limit=100");
const leads = await read("/leads?limit=100");
const visits = await read("/visits?limit=100");
const pipeline = await read("/commercial/pipeline");
const documents = await read("/commercial/documents");
const property =
  properties.items.find((p) => p.title.includes("Moema")) ??
  properties.items[0];
const lead =
  leads.items.find((l) => l.name === "Rafael Almeida") ?? leads.items[0];
const visit =
  visits.items.find((v) => v.status === "SCHEDULED") ?? visits.items[0];
const opportunity =
  pipeline.items.find((o) => o.title.includes("Juliana")) ?? pipeline.items[0];
const doc = documents[0] ?? documents.items?.[0];
const routes = [
  ["leads", "/leads", "Sua carteira de leads"],
  ["catalogo", `/imoveis?leadId=${lead.id}`, "Catálogo de imóveis"],
  ["dossie", `/imoveis/${property.id}`, property.title],
  ["agenda", "/agenda", "Agenda de visitas"],
  ["visita", `/visitas/${visit.id}`, null],
  ["funil", "/funil", "Funil de vendas"],
  ["comercial", `/negocios/${opportunity.id}`, null],
  ...(doc ? [["documento", `/documentos/${doc.id}`, null]] : []),
];
const browser = await chromium.launch({
  channel: process.env.E2E_BROWSER_CHANNEL ?? "chrome",
});
const evidence = [];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale: "pt-BR",
      timezoneId: "America/Sao_Paulo",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`${web}/login`);
    await page.getByLabel("E-mail profissional").fill(email);
    await page.getByLabel("Senha de acesso").fill(password);
    await page
      .getByRole("button", { name: "Entrar no Corretor Copilot" })
      .click();
    await page.waitForURL("**/leads");
    for (const [name, path, heading] of routes) {
      await page.evaluate((path) => {
        history.pushState({}, "", path);
        dispatchEvent(new PopStateEvent("popstate"));
      }, path);
      if (heading)
        await page
          .getByRole("heading", { name: heading, exact: true })
          .waitFor();
      await page
        .locator(".loading")
        .waitFor({ state: "hidden" })
        .catch(() => {});
      await page.waitForTimeout(700);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${output}${name}-${width}.png`,
        fullPage: true,
      });
      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        clippedFinancialValues: Array.from(
          document.querySelectorAll(".metric-value,.property-price"),
        )
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent),
        visibleOverflow: Array.from(document.querySelectorAll("body *"))
          .filter((e) => {
            const r = e.getBoundingClientRect();
            const css = getComputedStyle(e);
            if (
              r.width === 0 ||
              css.visibility === "hidden" ||
              css.display === "none"
            )
              return false;
            if (
              r.right <= 0 ||
              r.left >= innerWidth ||
              (r.right <= innerWidth + 1 && r.left >= -1)
            )
              return false;
            let parent = e.parentElement;
            while (parent && parent !== document.body) {
              const overflow = getComputedStyle(parent).overflowX;
              if (["auto", "scroll", "hidden", "clip"].includes(overflow))
                return false;
              parent = parent.parentElement;
            }
            return true;
          })
          .slice(0, 12)
          .map((e) => `${e.tagName}.${e.className}`),
      }));
      evidence.push({ name, path, width, ...overflow, errors: [...errors] });
      const modalButton =
        name === "leads"
          ? page.getByRole("button", { name: "Novo lead", exact: true })
          : name === "catalogo"
            ? page
                .getByRole("button", { name: "Associar lead", exact: true })
                .first()
            : name === "agenda"
              ? page
                  .getByRole("button", { name: "Propor encaixe", exact: true })
                  .first()
              : name === "visita"
                ? page.getByRole("button", {
                    name: "Concluir visita e avaliar",
                    exact: true,
                  })
                : name === "comercial"
                  ? page.getByRole("button", {
                      name: "Preparar proposta",
                      exact: true,
                    })
                  : null;
      if (
        modalButton &&
        (await modalButton.count()) &&
        (await modalButton.isEnabled())
      ) {
        await modalButton.click();
        await page.getByRole("dialog").waitFor();
        await page.screenshot({
          path: `${output}${name}-modal-${width}.png`,
          fullPage: false,
        });
        await page.keyboard.press("Escape");
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
await writeFile(`${output}evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ screenshots: output, evidence }, null, 2));
if (
  evidence.some(
    (e) =>
      e.documentWidth > e.viewportWidth + 1 ||
      e.errors.length ||
      e.clippedFinancialValues.length,
  )
)
  process.exitCode = 1;
