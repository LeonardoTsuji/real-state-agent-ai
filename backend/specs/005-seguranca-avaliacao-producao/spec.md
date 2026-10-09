# 005 — Segurança, avaliação e produção

Status: especificado; depende das etapas 1 a 4.

Origem: `plan.md`, “Etapa 5 — Segurança, avaliação e produção — semanas 12 a 14” e resultado esperado para portfólio.

## Requisitos e critérios de aceite

### RF-01 — Segurança em profundidade

**CA-01:** Endpoints têm autenticação, autorização por recurso, rate limit configurável e validação estrita. Segredos têm privilégios mínimos; endpoints internos/operacionais não ficam públicos. Tentativas de acesso cruzado são registradas sem vazar se o recurso existe.

**CA-02:** Prompt injection em mensagens, descrição de imóvel, importação e resultado de ferramenta não altera política, identidade, schema ou permissões. Modelo não executa SQL nem ações além das ferramentas autorizadas. Ações sensíveis continuam exigindo confirmação externa ao modelo.

**CA-03:** Orquestração aplica limite de custo, duração, tokens e tool calls por execução e usuário. Estouro encerra execução sem ação parcial não confirmada e segue fallback.

**CA-04:** Logs, métricas, traces e avaliações mascaram dados pessoais e nunca armazenam senha, token ou segredo. Retenção e exclusão de conversas seguem política documentada; acesso a conteúdo é auditável.

### RF-02 — Operação observável

**CA-05:** Cada requisição/job/conversa tem correlation ID propagado entre API, outbox, worker e integração. Health checks distinguem processo vivo de dependências prontas. Logs estruturados e métricas permitem localizar latência, erro e falha por integração/job sem expor conteúdo sensível.

**CA-06:** Deploy documenta execução da API e workers, migrations, rollback/compensação, recuperação de backup, configuração de segredos, alertas e procedimento de falha. Workers podem reiniciar sem perder jobs ou duplicar efeitos.

### RF-03 — Avaliação de qualidade e segurança

**CA-07:** Dataset versionado contém ao menos 100 casos que cobrem busca comum, ambiguidade, orçamento incompatível, imóvel inexistente, acesso cruzado, prompt injection, conflito de agenda, calendário indisponível, timeout, duplicidade, conversa longa, confirmação e handoff humano. Cada caso especifica resultado esperado e risco coberto.

**CA-08:** Pipeline mede escolha de ferramenta, correção dos argumentos, fundamentação, conclusão, violação de autorização, respeito à confirmação, fallback, latência, número de chamadas, tokens/custo e erros de integração. Limiares mínimos e política de bloqueio de release são documentados; regressão em caso crítico bloqueia release.

**CA-09:** Threat model resumido identifica ativos, limites de confiança, atacantes, abuso, controles e risco residual. Avaliações de segurança demonstram que autorização e confirmação não dependem da cooperação do modelo.

## Definição de pronto

- CA-01 a CA-09 demonstrados em configuração semelhante à produção.
- Dataset com pelo menos 100 casos e resultados reproduzíveis.
- Métricas e tracing correlacionam API e worker; segredos e PII são redigidos.
- Runbooks de deploy, backup, recuperação, rollback e incidentes existem.
- Threat model, documentação de arquitetura e demonstração de portfólio estão versionados ou referenciados.
