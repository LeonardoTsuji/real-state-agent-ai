# Roteiro de testes no Postman

Este roteiro cobre os fluxos HTTP implementados e os principais caminhos de sucesso, validação, autorização, idempotência, filas e agenda. Use uma base local descartável; o fluxo de exclusão de conteúdo e os testes de cancelamento alteram dados.

## 1. Subir a aplicação

Na raiz do projeto:

```bash
pnpm install
cp .env.example .env
openssl rand -base64 48
```

Cole o segredo gerado em `JWT_SECRET` no `.env`. Depois rode:

```bash
pnpm start:local
```

O script sobe PostgreSQL e Redis, aplica as migrations e inicia a API com worker. A base padrão é `http://localhost:3000/api`.

No Postman, crie um Environment chamado `Copilot local` com estas variáveis:

| Variável | Valor inicial |
| --- | --- |
| `baseUrl` | `http://localhost:3000/api` |
| `email` | endereço único, por exemplo `corretor.postman.001@example.com` |
| `password` | senha com pelo menos 12 caracteres |
| `accessToken` | vazio; preencher após login |
| `brokerId` | ID retornado no cadastro, para administrar o papel no servidor |
| `leadId`, `lead2Id`, `propertyId`, `visitId`, `taskId`, `followUpId`, `conversationId`, `proposalId`, `importId`, `jobId` | vazio |

Para todas as rotas autenticadas, use o header `Authorization: Bearer {{accessToken}}`. Para JSON, use `Content-Type: application/json`. Não coloque chave da OpenAI na collection nem no environment do Postman: ela fica no `.env` da API.

Para evitar copiar valores manualmente, estes scripts podem ser colocados na aba **Scripts > Post-response** das requisições correspondentes:

```javascript
// Login
pm.environment.set('accessToken', pm.response.json().accessToken);

// Criação de lead; use lead2Id no segundo lead
pm.environment.set('leadId', pm.response.json().id);

// Criação de imóvel/visita/tarefa/lote/conversa: troque pelo nome da variável
pm.environment.set('propertyId', pm.response.json().id);
```

## 2. Verificar processo e dependências

Envie, sem autenticação:

1. `GET {{baseUrl}}/health/live` — esperado `200` e `{"status":"alive"}`.
2. `GET {{baseUrl}}/health/ready` — esperado `200`, com banco e fila como `ready`.

Se readiness falhar, confirme os containers (`docker compose ps`) antes de seguir.

## 3. Criar corretor, autenticar e validar isolamento

1. `POST {{baseUrl}}/auth/register`

```json
{
  "name": "Corretor Postman",
  "email": "{{email}}",
  "password": "Senha-local-segura-123"
}
```

Esperado `201`; a resposta não deve conter hash de senha. Reenvie o cadastro com o mesmo e-mail: esperado `409 EMAIL_ALREADY_REGISTERED`.

2. `POST {{baseUrl}}/auth/login`

```json
{
  "email": "{{email}}",
  "password": "Senha-local-segura-123"
}
```

Esperado `200`, com `accessToken`, `tokenType` e `expiresIn`. Copie `accessToken` para a variável correspondente. Senha errada deve retornar `401`.

3. Faça `GET {{baseUrl}}/leads` sem token e confirme `401`. Com o token válido deve retornar `200`.

Para provar isolamento entre corretores, registre outro e-mail, faça login, guarde o segundo token temporariamente e use-o para ler um ID do primeiro corretor. O resultado esperado é `404`, sem revelar se o recurso existe.

## 4. Criar dados base do CRM

### Lead

`POST {{baseUrl}}/leads`:

```json
{
  "name": "Cliente Postman",
  "email": "cliente.postman@example.com",
  "phone": "+5511999990000",
  "notes": "Lead de teste local"
}
```

Esperado `201`. Salve o `id` em `leadId`. Crie outro lead semelhante e salve o ID em `lead2Id` (use outro e-mail/telefone se informar esses campos).

Teste as rotas: `GET /leads`, `GET /leads/{{leadId}}`, `PATCH /leads/{{leadId}}` com `{"notes":"Atualizado pelo Postman"}`, e `GET /leads/funnel`. Uma leitura com UUID inexistente ou pertencente ao outro corretor deve dar `404`.

### Imóvel

`POST {{baseUrl}}/properties`:

```json
{
  "title": "Apartamento Postman Pinheiros",
  "description": "Imóvel sintético para teste local",
  "purpose": "RENT",
  "type": "APARTMENT",
  "priceCents": 450000,
  "city": "São Paulo",
  "neighborhood": "Pinheiros",
  "bedrooms": 2,
  "parkingSpaces": 1
}
```

Esperado `201`; salve `id` em `propertyId`. Teste `GET /properties`, `GET /properties/{{propertyId}}` e filtros, por exemplo `GET /properties?purpose=RENT&city=São%20Paulo&minBedrooms=2&maxPriceCents=500000`. `minPriceCents` maior que `maxPriceCents` deve retornar `400`. `PATCH /properties/{{propertyId}}` aceita atualização parcial; `DELETE /properties/{{propertyId}}` retorna `204` e faz exclusão lógica. Faça a exclusão só depois dos outros cenários que precisam do imóvel.

## 5. Preferências, matches, interações e funil

Com `leadId` e `propertyId`:

1. `PATCH /leads/{{leadId}}/preferences`:

```json
{
  "purposes": ["RENT"],
  "types": ["APARTMENT"],
  "minPriceCents": 300000,
  "maxPriceCents": 600000,
  "minBedrooms": 2,
  "neighborhoods": ["Pinheiros"]
}
```

2. `GET /leads/{{leadId}}/preferences` — deve refletir os valores. Tente `minPriceCents` acima de `maxPriceCents`: esperado `400`.
3. `POST /leads/{{leadId}}/matches` com `{"propertyId":"{{propertyId}}","score":87,"status":"SUGGESTED"}`; depois consulte `GET /leads/{{leadId}}/matches`.
4. `PATCH /leads/{{leadId}}/matches/{{propertyId}}` com `{"status":"SENT","score":90}`. Teste também `REJECTED` com `rejectionReason`.
5. `POST /leads/{{leadId}}/interactions`:

```json
{
  "type": "CALL",
  "occurredAt": "2030-02-01T14:00:00.000Z",
  "summary": "Apresentou opções de locação",
  "channel": "phone"
}
```

6. Consulte `GET /leads/{{leadId}}/interactions`.
7. `PATCH /leads/{{leadId}}/stage` com `{"stage":"CONTACTED"}` e depois `{"stage":"QUALIFIED"}`. Um salto não permitido, por exemplo `NEW` diretamente para `WON`, deve retornar conflito (`409`).

Também teste `DELETE /leads/{{leadId}}` ao final, depois dos fluxos que precisam do lead; a exclusão é lógica.

## 6. Agenda: criação, conflito, concorrência e transições

As datas dos exemplos estão no futuro em relação ao ambiente atual do projeto. Use intervalos ISO 8601 terminados em `Z`. A constraint é por corretor: não permite duas visitas agendadas sobrepostas para o mesmo corretor, ainda que sejam leads ou imóveis diferentes. Ela usa intervalo `[início, fim)`, então visitas adjacentes são permitidas.

### Conflito sequencial (deve ser `409`)

1. `POST {{baseUrl}}/visits`, com token e header `Idempotency-Key: postman-visita-a-001`:

```json
{
  "leadId": "{{leadId}}",
  "propertyId": "{{propertyId}}",
  "startAt": "2030-02-10T13:00:00.000Z",
  "endAt": "2030-02-10T14:00:00.000Z"
}
```

Esperado `201`; salve `id` em `visitId`.

2. Crie outra visita com `lead2Id`, mesmo imóvel ou outro imóvel próprio, mesmo intervalo e um header **diferente**, `Idempotency-Key: postman-visita-b-001`. Esperado `409` com conflito de sobreposição. Se reutilizar a mesma chave do passo 1, a API retorna a visita original por idempotência e não testa o conflito.

### Concorrência simultânea (deve haver uma vencedora)

Para testar a constraint no caso de corrida, duplique a requisição de criação em duas abas do Postman. Use `leadId` na primeira e `lead2Id` na segunda, mantenha exatamente o mesmo `startAt`/`endAt`, use chaves idempotentes distintas e dispare Send nas duas quase ao mesmo tempo. As duas respostas válidas são uma `201` e uma `409`; nunca devem existir duas visitas `SCHEDULED` sobrepostas. Faça esse teste com dados livres, sem visita prévia naquele horário.

### Casos de limite e ciclo de vida

- Intervalo invertido ou com início igual ao fim: `400`.
- Nova visita começando exatamente às `14:00Z`, quando a anterior termina às `14:00Z`: `201` (intervalos adjacentes).
- `GET /visits`, `GET /visits/{{visitId}}`: confirmam a reserva.
- `PATCH /visits/{{visitId}}` com novos `startAt`/`endAt` não conflitantes: remarca com sucesso; tentar remarcar para horário ocupado: `409`.
- `DELETE /visits/{{visitId}}`: cancela e retorna estado `CANCELED`. O horário cancelado pode ser reservado novamente.
- `POST /visits/{{visitId}}/complete`: em outra visita ainda `SCHEDULED`, muda para `COMPLETED`; depois dela, cancelar/remarcar deve dar `409`.
- `POST /visits/{{visitId}}/calendar-sync`, depois consulte `GET /visits/{{visitId}}/calendar-event` para exercitar a integração simulada.

Use IDs diferentes e crie outra visita do mesmo corretor para os testes de remarcação/cancelamento/conclusão, pois cada transição terminal só pode ocorrer uma vez.

## 7. Tarefas e follow-ups

1. `POST /tasks`:

```json
{
  "leadId": "{{leadId}}",
  "title": "Enviar opções ao cliente",
  "dueAt": "2030-02-03T12:00:00.000Z"
}
```

Salve o `id` em `taskId`. Teste `GET /tasks`, `GET /tasks?status=PENDING&leadId={{leadId}}` e `PATCH /tasks/{{taskId}}/status` com `{"status":"COMPLETED"}`. Também pode criar outra tarefa e cancelar com `CANCELED`. Estados concluídos/cancelados são terminais.

2. `POST /follow-ups`:

```json
{
  "idempotencyKey": "postman-follow-up-001",
  "leadId": "{{leadId}}",
  "title": "Retornar contato",
  "dueAt": "2030-02-04T12:00:00.000Z",
  "timezone": "America/Sao_Paulo"
}
```

Salve o ID retornado em `followUpId`. Teste `PATCH /follow-ups/{{followUpId}}/complete` e, com outro follow-up, `PATCH /follow-ups/{{followUpId}}/cancel`. Repetir criação com a mesma chave deve ser idempotente.

## 8. Imports, mensageria e fila assíncrona

O worker local roda junto com a API (`PROCESS_ROLE=all`). Esses endpoints retornam antes de alguns trabalhos terminarem; consulte os recursos/jobs depois de alguns segundos.

1. `POST /imports/properties`:

```json
{
  "idempotencyKey": "postman-import-001",
  "rows": [
    {
      "externalKey": "postman-imovel-001",
      "title": "Casa de teste",
      "purpose": "SALE",
      "type": "HOUSE",
      "priceCents": 85000000,
      "city": "São Paulo",
      "neighborhood": "Butantã",
      "bedrooms": 3,
      "parkingSpaces": 2
    },
    {"externalKey":"linha-invalida","title":"Sem campos obrigatórios"}
  ]
}
```

Salve o ID do lote em `importId`; `GET /imports/properties/{{importId}}` retorna o relatório de aceitas/rejeitadas. Reenvie a mesma chave para validar idempotência.

2. `POST /leads/{{leadId}}/messages` com `{"idempotencyKey":"postman-msg-001","body":"Olá, seguem as opções."}` e depois `GET /leads/{{leadId}}/messages`.
3. Consulte `GET /operations/jobs` e `GET /operations/metrics` com `Authorization: Bearer {{accessToken}}`. Um corretor recém-cadastrado deve receber `403`. No servidor, execute `pnpm auth:set-role -- <brokerId> OPERATOR` usando o ID retornado no cadastro; repita com o mesmo JWT e espere `200`. O operador acessa jobs e métricas de todo o sistema. Ao terminar os testes operacionais, execute `pnpm auth:set-role -- <brokerId> BROKER` e confirme `403` com o mesmo JWT. Sem autenticação ou com JWT inválido, espere `401`.
4. Jobs permanentes com falha podem ser consultados por ID e reenviados por `POST /operations/jobs/{{jobId}}/replay`. Em modo local, teste falhas de calendário/mensageria alterando `SIMULATED_CALENDAR_MODE` ou `SIMULATED_MESSAGING_MODE` no `.env` para `timeout`, `transient_failure` ou `permanent_failure` e reiniciando a API. Volte para `success` ao terminar. Retry pode levar alguns segundos.

## 9. Conversas e assistente

1. `POST /conversations` com `{"leadId":"{{leadId}}"}`; salve `id` em `conversationId`.
2. `POST /conversations/{{conversationId}}/messages`, header `Idempotency-Key: postman-ai-msg-001`, body `{"content":"Procuro apartamento para alugar em Pinheiros até R$ 5.000."}`.
3. `GET /conversations/{{conversationId}}/messages` consulta o histórico. Repita a mensagem com a mesma chave para conferir idempotência. Uma chave repetida enquanto processamento ainda está em andamento pode responder `409`.
4. Para teste de extração, `POST /ai/preferences/extract` com `{"message":"Quero apartamento para alugar em Pinheiros até R$ 5.000, com 2 quartos."}`.
5. Envie uma mensagem solicitando uma proposta de visita, com imóvel existente e intervalo futuro. O retorno de `POST /conversations/{{conversationId}}/messages` inclui `proposals`; salve `proposals[0].id` em `proposalId` e revise `summary`. Chame `POST /conversations/{{conversationId}}/proposals/{{proposalId}}/decision` com `{"confirmed":true}` ou `{"confirmed":false}`. A confirmação tenta criar a visita e valida conflitos; a rejeição não cria. Confirmar novamente uma proposta confirmada retorna o estado existente sem segunda visita. Propostas expiram após 15 minutos.
6. `DELETE /conversations/{{conversationId}}/content` anonimiza as mensagens e remove propostas não confirmadas. Depois confira o histórico; esse passo é terminal para o conteúdo da conversa.

Se a IA falhar depois de persistir uma proposta, a resposta informa que existe uma proposta pendente para revisão, mesmo com a execução registrada como `FAILED`. Use o ID retornado para decidir sem reenviar o pedido de agendamento. Se não houver proposta válida, permanece o fallback manual. `proposals` contém as propostas pendentes e não expiradas da conversa, incluindo as de mensagens anteriores; ao repetir a mesma `Idempotency-Key`, o texto salvo é mantido e a lista de propostas reflete o estado atual, sem executar novamente o modelo. Propostas decididas ou expiradas deixam de aparecer. O histórico por GET e a extração de preferências não retornam esse campo. Veja os [diagramas dos fluxos](business-flows.md) e a [versão visual offline](diagramas.html).

**Atenção ao provider local:** `.env.example` usa `AI_PROVIDER=mock`. Esse mock devolve fallback de indisponibilidade e não gera tools/propostas; a extração retorna `503`. Para testar proposta, confirmação e extração de ponta a ponta, configure `AI_PROVIDER=openai`, `OPENAI_API_KEY` e `OPENAI_MODEL` apenas no `.env` da API e reinicie o servidor. O modelo é não determinístico; para verificar a regra de agenda de forma repetível, use `POST /visits` diretamente. A constraint do PostgreSQL continua sendo a proteção final se duas conversas tentarem reservar o mesmo horário.

`GET /operations/metrics/ai`, com JWT de usuário no papel `OPERATOR`, mostra métricas agregadas da execução de IA.

Para usar Gemini, configure `AI_PROVIDER=gemini`, `GEMINI_API_KEY` e `GEMINI_MODEL=gemini-2.5-flash` no ambiente da API e reinicie o servidor. Não é necessário configurar uma chave OpenAI para esse provider. Os endpoints de extração, conversa, proposta e confirmação são os mesmos. O adapter usa o endpoint Chat Completions compatível do Google e preserva as chamadas de ferramentas durante o loop; as regras de autorização e confirmação continuam no backend. As métricas registram o modelo Gemini selecionado. O plano gratuito tem quotas próprias do Google: HTTP 429 do provedor gera fallback na conversa ou 503 na extração e é registrado como `AI_PROVIDER_RATE_LIMITED`.

## 10. Casos transversais de segurança e validação

- Envie corpo JSON com uma propriedade desconhecida: esperado `400` (whitelist estrita).
- Envie payload maior que `HTTP_BODY_LIMIT`: esperado `413`.
- Envie data sem `Z` em visita/tarefa: esperado `400`.
- Tente acessar lead, imóvel, visita, conversa ou mensagem com o token do segundo corretor: esperado `404`.
- Envie `x-request-id: teste-postman-001`; confirme o mesmo valor no header da resposta. Valor inválido deve ser substituído por ID gerado.
- Teste rate limit ajustando temporariamente `RATE_LIMIT_IP_MAX` para `2`, reinicie e exceda o limite de chamadas no mesmo IP/janela: esperado `429` com `Retry-After`. Restaure o valor depois.
- Consulte logs locais e confirme que há `correlationId`, rota, status e latência, mas não corpo, senha, bearer token ou conteúdo da mensagem.
- `GET /operations/metrics/ai` e demais operações com JWT de `BROKER`: `403`; com JWT de `OPERATOR`: acesso permitido sem header adicional. Enviar o antigo `x-operations-token` com JWT de `BROKER` continua retornando `403`.
- Tente cadastrar `role: "OPERATOR"` ou `permissions: ["operations:read"]` no body: esperado `400`; nenhum usuário deve ser criado.
- Com o JWT de operador, tente acessar recursos de outro corretor pelas rotas normais: esperado `404`.

## 11. Cobertura de endpoints

Este é o mapa de rotas para conferir que a collection manual passou por cada módulo:

| Grupo | Rotas |
| --- | --- |
| Saúde/autenticação | `GET /health/live`, `GET /health/ready`, `POST /auth/register`, `POST /auth/login` |
| Leads/CRM | `POST/GET /leads`, `GET/PATCH/DELETE /leads/:id`, `GET /leads/funnel`, `GET/PATCH /leads/:id/preferences`, `POST/GET /leads/:id/matches`, `PATCH /leads/:leadId/matches/:propertyId`, `POST/GET /leads/:id/interactions`, `PATCH /leads/:id/stage` |
| Imóveis | `POST/GET /properties`, `GET/PATCH/DELETE /properties/:id` |
| Visitas | `POST/GET /visits`, `GET/PATCH/DELETE /visits/:id`, `POST /visits/:id/complete` |
| Tarefas/integrações | `POST/GET /tasks`, `PATCH /tasks/:id/status`, `POST /follow-ups`, `PATCH /follow-ups/:id/complete`, `PATCH /follow-ups/:id/cancel`, `POST /imports/properties`, `GET /imports/properties/:id`, `POST/GET /leads/:leadId/messages`, `POST /visits/:id/calendar-sync`, `GET /visits/:id/calendar-event` |
| Operação | `GET /operations/jobs`, `GET /operations/jobs/:id`, `POST /operations/jobs/:id/replay`, `GET /operations/metrics`, `GET /operations/metrics/ai` |
| IA | `POST /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `DELETE /conversations/:id/content`, `POST /conversations/:id/proposals/:proposalId/decision`, `POST /ai/preferences/extract` |

Para automação repetível no CI, rode também `pnpm test --runInBand` e `pnpm test:e2e`; o Postman complementa os testes automatizados e não substitui a validação de migrations em um banco local limpo.
