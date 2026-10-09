# Corretor Copilot

CRM imobiliário com frontend React e API NestJS. A implementação cobre os fluxos dos [27 protótipos](frontend/design/): leads, assistente, catálogo, dossiê, agenda, visita, funil, proposta, aceite, comissão, recibos, perfil e operações.

## Executar

Requisitos: Node.js 24, pnpm e Docker Compose. Na raiz:

```bash
pnpm install:all
pnpm start:demo
```

Abra **http://127.0.0.1:5173**. O comando inicia banco e Redis, aplica migrations somente em `corretor_copilot_demo`, popula exemplos e inicia API, workers e frontend. Os exemplos persistem; o seed não apaga dados. O banco de desenvolvimento e a fila normal são preservados.

| Perfil                   | E-mail              | Senha de demonstração |
| ------------------------ | ------------------- | --------------------- |
| Marina Costa — corretora | marina@copilot.demo | DemoCopilot2026!      |
| Lucas Mendes — operador  | lucas@copilot.demo  | DemoCopilot2026!      |

Se as portas padrão estiverem ocupadas:

```bash
PORT=3001 FRONTEND_PORT=5174 pnpm start:demo
```

Nesse caso, abra **http://127.0.0.1:5174**. `Ctrl+C` encerra frontend/API; dados e containers persistem. WhatsApp, calendário externo, assinatura, pagamento, localização, áudio e tour são simulações identificadas. O assistente usa o provider mock, sem chamadas pagas. Dossiês e PDFs exigem sessão. Token e cache ficam em memória; recarregar exige login novamente.

## Desenvolvimento e validação

As pastas [backend/](backend/README.md) e [frontend/](frontend/) têm dependências e lockfiles próprios. `pnpm install:all` instala ambas. Configure `backend/.env` a partir de `.env.example` para desenvolvimento fora da demonstração.

```bash
pnpm build
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:ui
pnpm api:types
```

`test:e2e` usa exclusivamente o banco local `corretor_copilot_test`. `test:ui` requer a demonstração já iniciada e o Chrome instalado; URLs alternativas podem ser definidas com `E2E_API_URL=http://127.0.0.1:3001/api E2E_WEB_URL=http://127.0.0.1:5174`. O contrato e os tipos gerados são versionados; `api:types` requer Swagger da API em desenvolvimento e aceita `API_BASE_URL=http://127.0.0.1:3001`.

Consulte [especificações](backend/specs/README.md), [matriz dos protótipos e evidências](backend/docs/prototype-matrix.md) e [arquitetura](backend/docs/architecture.md).
