# 004 — LLMs e tool calling

Status: especificado; depende das etapas 1 a 3.

Origem: `plan.md`, “Etapa 4 — LLMs e tool calling — semanas 9 a 11”, incluindo o MVP conversacional e a segunda sprint.

## Objetivo e limites

Adicionar um único orquestrador conversacional, inicialmente determinístico nos limites de domínio e assistido por LLM para interpretação/redação. O LLM não acessa banco, identidade, agenda ou integrações diretamente. O backend injeta identidade, valida schemas, autoriza e controla efeitos.

## Requisitos e critérios de aceite

### RF-01 — Extração estruturada e busca

**CA-01:** Dada uma mensagem, extração de preferências retorna JSON em schema versionado com apenas campos conhecidos e confiança/incerteza explícita. Campos ausentes permanecem ausentes; valores não inferíveis não são inventados. Mensagem incompleta ou bairro desconhecido pede esclarecimento sem busca fictícia.

**CA-02:** Argumentos são validados no backend (Zod ou equivalente). Busca usa exclusivamente filtros determinísticos e imóveis retornados pelo banco, escopados ao corretor. Nenhum resultado produz resposta explícita sem inventar imóveis, preços ou disponibilidade.

### RF-02 — Registro e ferramentas

**CA-03:** Registry expõe apenas ferramentas permitidas para o ator e estado da conversa. Cada ferramenta tem schema, timeout, validação, autorização, saída estruturada e registro sanitizado de execução. Identidade é obtida do contexto autenticado, nunca de argumentos do modelo.

**CA-04:** São suportadas progressivamente `create_lead`, `get_lead`, `update_lead_preferences`, `search_properties`, `get_property_details`, `save_property_interest`, `list_available_visit_slots`, `schedule_visit`, `create_follow_up_task`, `list_pending_tasks` e `draft_follow_up_message`. Ferramentas de leitura retornam somente dados autorizados; mutações aplicam as mesmas regras dos endpoints.

### RF-03 — Orquestração

**CA-05:** Orquestrador carrega apenas contexto da conversa autorizado, envia instruções e ferramentas disponíveis ao Responses API, valida cada tool call antes da execução, devolve resultados estruturados ao modelo e persiste mensagens/resultado. Limite configurável de iterações, tool calls, tempo total e tokens encerra loop com fallback claro.

**CA-06:** Falha de rede, timeout, limite de custo ou saída inválida não executa ferramentas com argumentos parciais; usuário recebe encaminhamento determinístico/manual e a execução fica rastreável. Chaves de idempotência impedem repetição de efeitos em retry.

### RF-04 — Confirmação humana

**CA-07:** Agendar visita ou executar outra ação classificada como sensível cria proposta com resumo, recurso e horário explícitos. Nenhuma mutação ocorre até confirmação inequívoca do usuário autenticado. Confirmação expira, é vinculada ao ator/conversa e ao estado revisado; alteração de argumentos exige nova confirmação. Recusa ou expiração não produz efeito.

### RF-05 — Conversa e contexto

**CA-08:** Mensagens têm papel, conteúdo, instante e estado; armazenamento respeita política de retenção configurada. Resumo de contexto referencia fatos persistidos e autorizado, nunca substitui checagem de permissão. Conteúdo de cliente é dado não confiável e não altera instruções ou políticas.

**CA-09:** Casos de avaliação da primeira integração passam: mensagem completa, sem orçamento, bairro inexistente, valor informal, sem imóveis, argumento inválido, tentativa de ignorar regras e resposta fundamentada sem invenção.

## Execução de ferramenta

Todo pedido contém ator do contexto da aplicação e conversa autorizada. O fluxo é: validar entrada, selecionar política, autorizar recurso, executar com limite, registrar resultado mínimo sanitizado, então opcionalmente devolver resultado ao modelo. Respostas de ferramenta são dados, nunca instruções de sistema. Uma ferramenta desconhecida ou não habilitada falha fechada.

## Definição de pronto

- CA-01 a CA-09 verificados sem acesso do modelo ao banco ou credenciais.
- Confirmação precede mutação sensível, inclusive em retry e conversa duplicada.
- Cada execução registra ferramenta, ator, duração, resultado/código e correlation ID, sem conteúdo desnecessário.
- Limites e fallback funcionam sem disponibilidade do provedor.
- Avaliações demonstram que as respostas se baseiam em dados reais.
