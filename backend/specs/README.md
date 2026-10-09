# Especificações do Corretor Copilot

O conjunto 006–013 implementa os27 protótipos de [design/](../design/), integrado à API NestJS. Cada etapa contém `spec.md` (contratos/aceite), `plan.md` (decisões) e `tasks.md` (execução/evidências).

| Etapa                                           | Escopo                                     | Estado                                             |
| ----------------------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| [001](001-nestjs-profissional/spec.md)          | NestJS, autenticação, leads e imóveis      | Histórico preservado                               |
| [002](002-dados-arquitetura/spec.md)            | Preferências, visitas, tarefas e auditoria | Histórico preservado                               |
| [003](003-integracoes-filas/spec.md)            | Outbox, jobs e integrações simuladas       | Histórico preservado                               |
| [004](004-llms-tool-calling/spec.md)            | Extração, ferramentas e confirmação        | Histórico preservado                               |
| [005](005-seguranca-avaliacao-producao/spec.md) | Segurança, avaliação e operações           | Histórico preservado                               |
| [006](006-frontend-fundacao/spec.md)            | Frontend, sessão, identidade e perfis      | Implementação e aceite visual em andamento         |
| [007](007-frontend-leads-crm/spec.md)           | CRM, filtros, importação e histórico       | Implementação e aceite visual em andamento         |
| [008](008-frontend-imoveis/spec.md)             | Catálogo, compatibilidade e dossiê         | Implementação e aceite visual em andamento         |
| [009](009-frontend-agenda-tarefas/spec.md)      | Agenda, check-in, roteiro e feedback       | Backend verificado; aceite visual pendente         |
| [010](010-frontend-assistente/spec.md)          | Conversas, propostas e extração            | Recuperação API verificada; aceite visual pendente |
| [011](011-frontend-operacoes/spec.md)           | Jobs, métricas, replay e 403               | RBAC API verificado; aceite visual pendente        |
| [012](012-encaixes-simulacoes/spec.md)          | Reservas, encaixes e simulações            | Backend verificado; aceite visual pendente         |
| [013](013-negociacao-documentos/spec.md)        | Funil, proposta, comissão e documentos     | Jornada API verificada; PDF/visual pendentes       |

Ordem de entrega: **006 → 007 → 008 → 009 → 010 → 012 → 013 → 011**. [Matriz dos 27 protótipos](../docs/prototype-matrix.md) relaciona PNG, rota, estado, contrato e evidência; modal/variante não exige rota independente.

A jornada é **lead → imóvel associado → visita → cancelamento/encaixe → confirmação → check-in → feedback → proposta → aceite → comissão → recibo**. API aplica propriedade por broker e permissões; operador mantém sua própria carteira nas rotas de negócio e usa permissões específicas nas consultas globais.

Frontend no pacote `frontend/`; backend na raiz. JWT/cache somente em memória; logout, 401, expiração e troca de conta descartam dados e respostas tardias. Interface em português, BRL em centavos e apresentação temporal em America/Sao_Paulo. Mutações não possuem retry automático; retentativas manuais preservam chaves lógicas.

Schema evolui por migration aditiva `20261008150000_frontend_journey`. Visitas, reservas e bloqueios têm ocupação compartilhada com exclusão PostgreSQL. Documentos usam snapshots persistidos. Propostas de IA exigem confirmação humana; aceites e liquidações comerciais são simulados.

Dossiês ficam dentro da sessão; fotos, áudio, transcrições e tour são assets de demonstração. Publicação, links públicos, integrações externas reais, captura/upload de mídia, assinatura certificada e gestão de papéis pela interface estão fora desta entrega.

Verificação disponível: 8 testes de scheduling (7 PostgreSQL) e 4 E2E API da nova jornada passaram no banco dedicado corretor_copilot_test, sem reset ou migração do banco de desenvolvimento. Screenshots, frontend/Playwright e PDFs só recebem aceite depois da execução registrada nas tarefas e matriz. Registros históricos 001–005 não representam auditoria nova.
