# Tarefas — 006 — Fundação, sessão e perfis

Status: implementação integrada e validada. [Critérios](spec.md), [decisões técnicas](plan.md).

- [x] Atualizar especificação com o escopo aprovado dos protótipos e contratos atuais.
- [x] Registrar validação dos contratos backend da etapa.
- [x] Confirmar componentes e fluxos frontend para todos os critérios CA.
- [x] Executar comparação visual representativa dos protótipos e navegação responsiva.
- [x] Executar testes de comportamento frontend e registrar resultado.
- [x] Executar E2E de API da nova jornada e jornadas da interface.
- [x] Registrar build, TypeScript, lint e limitações antes do aceite final.

## Evidências

E2E de API: `NODE_ENV=test DEMO_MODE=true PROCESS_ROLE=api AI_PROVIDER=mock DATABASE_URL=<banco local corretor_copilot_test> NODE_OPTIONS=--experimental-vm-modules node node_modules/jest/bin/jest.js --config test/jest-e2e.json --runInBand test/frontend-journey.e2e-spec.ts`: 4 testes passaram. Escopo: jornada comercial/agenda, histórico/propostas após login e propriedade/revogação operacional. Sem chamadas externas pagas. Evidência atual da interface e dos documentos está registrada na validação final abaixo. Lint de src/visits, src/scheduling, src/integrations/async-workflows.service.ts e test/frontend-journey.e2e-spec.ts passou após instalação das dependências. Demais áreas têm validação própria.

## Validação integrada — 09/10/2026

`bash scripts/test-e2e.sh --runInBand` no diretório `backend/`: **15 testes passaram em 2 suítes** com PostgreSQL/Redis locais e provider mock. Banco exclusivo `corretor_copilot_test`; fila exclusiva por execução. As guardas de ambiente recusam produção e banco externo. Validação da agenda com `SCHEDULING_TEST_SCHEMA=scheduling_agent_test` no schema dedicado: **8 testes passaram**, incluindo 7 invariantes de concorrência PostgreSQL. `node_modules/.bin/tsc --noEmit --incremental false --project tsconfig.build.json` passou; lint das áreas de testes e serviço comercial passou. Evidência da interface está registrada abaixo.

## Interface e validação final — 09/10/2026

- Backend: **92 testes unitários em 19 suítes passaram**; os 7 cenários PostgreSQL opcionais foram executados separadamente na suíte de 8 testes da agenda. TypeScript, lint e build passaram.
- Frontend: **31 testes unitários passaram** (BRL, datas/fuso, sessão em memória, respostas tardias, 401/403, download autenticado e foco dos diálogos). TypeScript, lint e build passaram.
- `E2E_API_URL=http://127.0.0.1:3001/api E2E_WEB_URL=http://127.0.0.1:5174 node_modules/.bin/playwright test e2e/journey.spec.ts --output=qa/test-results/journey --reporter=list` em `frontend/`: **3 testes passaram em 12,3 s**. Incluem cadastro de lead sem preferências, dossiê e PDF, agendamento, check-in, feedback, proposta, aceite, comissão de R$ 82.800 e recibo de R$ 41.400; RBAC e métricas numéricas; navegação móvel, logout e recarga.
- **3 jornadas adicionais de agenda passaram** (chegada/rascunho/conclusão com tarefa, expiração/falha e associação manual com compatibilidade preservada), totalizando **6 jornadas Chrome**. Elas são documentadas na [matriz dos protótipos](../../docs/prototype-matrix.md). Capturas de páginas e diálogos em **390/768/1440 px**: [artefatos de QA](../../../frontend/qa/README.md). Verificação automática registra ausência de overflow, valores financeiros cortados e erros JavaScript nas páginas capturadas. A comparação visual é representativa; não é comparação automática de pixels dos 27 estados.
- Canais externos, localização, mídias, assinatura e liquidação permanecem demonstrações explícitas. Dossiês e documentos exigem sessão; nenhuma integração financeira ou envio externo real foi habilitado.
