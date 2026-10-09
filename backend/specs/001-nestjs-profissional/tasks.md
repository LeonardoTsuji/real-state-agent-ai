# Tarefas — etapa 1

Status: etapa implementada; critérios de aceite verificados com build, lint, testes e serviços locais.

## Incremento 1 — Fundação

- [x] T01 Ativar TypeScript estrito e corrigir incompatibilidades do starter; preservar lint e formatação. Verificar build e lint.
- [x] T02 Configurar validação de ambiente, prefixo `/api`, bootstrap HTTP reutilizável, validação global, filtro de erros e interceptor de duração/status. Cobrir erros de configuração e validação. **CA-01, CA-08**.
- [x] T03 Criar Docker Compose para PostgreSQL e Redis, volumes, health checks, `.env.example` e comando de inicialização documentado. Verificar reinício com persistência. **CA-01**.
- [x] T04 Adicionar Prisma e módulo de persistência; modelar Broker, Lead e Property; criar migration inicial e aplicá-la em banco vazio. Integrar migrations ao comando de inicialização. **CA-01, CA-04, CA-05**.

Dependências: T01 → T02; T03 → T04. O incremento termina com build/lint válidos e ambiente persistente reproduzível.

## Incremento 2 — Autenticação

- [x] T05 Escrever casos de cadastro válido, e-mail normalizado duplicado, senha inválida e ausência de hash nas respostas. Implementar cadastro com hash e unicidade. **CA-02, CA-08**.
- [x] T06 Escrever casos de login válido/inválido, token ausente/inválido/expirado e identidade autenticada. Implementar login e guard JWT. **CA-03**.
- [x] T07 Consolidar factory e2e com bootstrap compartilhado, PostgreSQL dedicado e proteção contra reset de banco fora do ambiente de teste. Preparar fixtures de dois corretores. **CA-03, CA-07**.

Dependências: T02 + T04 → T05 → T06; T07 deve estar pronto antes das verificações e2e do incremento.

## Incremento 3 — Leads

- [x] T08 Escrever testes da regra de contato e do estado final de PATCH, incluindo limpeza de um contato e tentativa de remover ambos. **CA-04, CA-08**.
- [x] T09 Implementar DTOs, serviço e controller de criação, consulta, listagem paginada, atualização e exclusão de leads. **CA-04, CA-08, CA-09**.
- [x] T10 Verificar CRUD e acesso cruzado entre A e B, IDs inválidos/inexistentes, tentativa de enviar proprietário e ausência de efeitos sobre B. **CA-04, CA-07, CA-08, CA-09**.

Dependências: incremento 2 → T08 → T09 → T10.

## Incremento 4 — Imóveis e busca

- [x] T11 Escrever casos de preço/quartos/vagas inválidos, PATCH vazio, enums inválidos e campos desconhecidos. Implementar CRUD com DTOs e escopo por proprietário. **CA-05, CA-08**.
- [x] T12 Escrever casos de filtros combinados, limites inclusivos, cidade/bairro sem distinção de caixa, nenhum resultado, faixa invertida e query numérica inválida/repetida. Implementar busca e paginação. **CA-06, CA-08, CA-09**.
- [x] T13 Verificar isolamento em CRUD e busca, contagem `total` por proprietário, ordenação com desempate e página vazia. **CA-05, CA-06, CA-07, CA-09**.

Dependências: incremento 2 → T11 → T12 → T13.

## Incremento 5 — Fechamento

- [x] T14 Substituir testes do starter quando a rota for removida; executar build, lint, unitários e e2e com PostgreSQL. Corrigir falhas e registrar evidências. **CA-01 a CA-09**.
- [x] T15 Documentar setup real, comando único de inicialização, migrations, testes, exemplos HTTP e decisões arquiteturais no README. Revisar arquivos para evitar segredos versionados. **CA-01 a CA-09**.
- [x] T16 Responder às perguntas de revisão arquitetural do `plan.md` para os componentes implementados e conferir a definição de pronto. Encerrar etapa somente após os critérios passarem. Ver [revisão arquitetural](review.md).

Dependências: incrementos 1–4 → T14 → T15 → T16.

## Matriz de rastreabilidade

| Critério              | Tarefas                                |
| --------------------- | -------------------------------------- |
| CA-01 Ambiente        | T02, T03, T04, T14, T15                |
| CA-02 Cadastro        | T05, T14                               |
| CA-03 Autenticação    | T06, T07, T14                          |
| CA-04 Leads           | T04, T08, T09, T10, T14                |
| CA-05 Imóveis         | T04, T11, T13, T14                     |
| CA-06 Busca           | T12, T13, T14                          |
| CA-07 Isolamento      | T07, T10, T13, T14                     |
| CA-08 Validação/erros | T02, T05, T08, T09, T10, T11, T12, T14 |
| CA-09 Paginação       | T09, T10, T12, T13, T14                |

## Evidências

Ao concluir uma tarefa, registrar aqui: identificador, comando/cenário executado, resultado e limitações.

- **T01:** `pnpm build` e `pnpm lint` passaram com `strict`, `noImplicitOverride` e `noUncheckedIndexedAccess` habilitados.
- **T02:** `pnpm test --runInBand` passou (4 suítes, 8 testes); `pnpm test:e2e --runInBand` passou (2 testes) com permissão de loopback. Cobertos prefixo, envelope 404, configuração de ambiente, `ValidationPipe` e redaction de erro interno.
- **T03:** `docker compose config --quiet` passou. `pnpm start:local` subiu serviços saudáveis, aplicou migrations e iniciou a API. Valores de Redis e uma linha sintética do PostgreSQL sobreviveram ao restart dos containers; ambos foram limpos ao fim da verificação.
- **T04:** `prisma validate` e `prisma generate` passaram com Prisma 6.19.0. Migration aplicada em bancos vazios de desenvolvimento e teste; `pnpm prisma:deploy` confirmou que não havia migrations pendentes na repetição.
- **T05–T13:** cobertos pela suíte e2e PostgreSQL em `test/app.e2e-spec.ts`: hash Argon2id, normalização/duplicidade, JWT válido/inválido/expirado, CRUD, validação, filtros, paginação e isolamento entre dois corretores.
- **T14:** `pnpm build`, `pnpm lint`, `pnpm test --runInBand` (3 suítes, 7 testes) e `pnpm test:e2e --runInBand` (4 cenários PostgreSQL) passaram.
- **T15–T16:** README documenta setup e exemplos HTTP; esta revisão responde às oito perguntas arquiteturais do roadmap.
