# 001 — NestJS profissional

Status: implementado; critérios CA-01 a CA-09 verificados em 06/10/2026.

Origem: `plan.md`, “Etapa 1 — NestJS profissional — semanas 1 a 3”.

## Objetivo e limite de escopo

Permitir que um corretor autenticado gerencie seus leads e imóveis em uma API persistente, validada e testável. Toda operação de negócio desta etapa é determinística.

Inclui TypeScript estrito, configuração por ambiente, PostgreSQL e Redis locais com Docker Compose, persistência com Prisma e migrations, autenticação, CRUD de leads, CRUD e busca de imóveis, tratamento de erros e testes unitários e end-to-end.

Preferências estruturadas, relacionamento lead-imóvel, visitas e conflitos de agenda ficam na etapa 2. Filas, integrações, conversas e IA ficam nas etapas posteriores. Redis é provisionado nesta etapa, sem consumers ou dependência para o funcionamento dos CRUDs.

A seção “Primeira sprint” do roadmap atravessa as etapas 1 e 2. Para este trabalho, prevalecem os entregáveis da etapa 1. O roadmap original permanece como referência.

## Premissas de produto

- Cada lead e imóvel pertence a exatamente um corretor.
- Cadastro público de corretor por nome, e-mail e senha é suficiente para o ambiente de estudo.
- Autenticação usa um token de acesso com validade limitada. Recuperação de senha, refresh token e logout com revogação ficam para evolução posterior.
- Exclusão de leads e imóveis é definitiva nesta etapa; não existem relacionamentos com visitas ainda.
- Preços são expressos em centavos de real (BRL), como inteiros, evitando ponto flutuante.
- Datas de resposta usam ISO 8601 em UTC; identificadores são UUIDs.

## Requisitos e critérios de aceite

### RF-01 — Ambiente reproduzível

**CA-01:** Dadas as dependências instaladas e o arquivo de ambiente configurado a partir do exemplo, um comando documentado sobe PostgreSQL e Redis, aplica migrations e inicia a API. Reiniciar o ambiente preserva os dados. Configuração obrigatória ausente ou inválida impede a inicialização com mensagem útil, sem revelar segredos.

### RF-02 — Cadastro e autenticação

**CA-02:** Cadastro válido retorna `201` com identificador, nome, e-mail e datas do corretor. E-mail é aparado e normalizado para minúsculas; duplicata normalizada retorna `409`. Senha tem de 12 a 128 caracteres, é armazenada como hash e nunca aparece em respostas.

**CA-03:** Login válido retorna `200` com `accessToken`, `tokenType: "Bearer"` e `expiresIn` em segundos. E-mail desconhecido e senha errada retornam o mesmo erro `401`. Token ausente, inválido ou expirado retorna `401` nos endpoints protegidos.

### RF-03 — CRUD de leads

**CA-04:** Um corretor autenticado cria um lead com nome e pelo menos um contato (e-mail ou telefone), recebendo `201`. Consegue listar, consultar, atualizar parcialmente e excluir seus leads. Campos omitidos no PATCH são preservados; o resultado precisa continuar com pelo menos um contato. Exclusão retorna `204`; consulta posterior retorna `404`.

### RF-04 — CRUD de imóveis

**CA-05:** Um corretor autenticado cadastra título, descrição opcional, finalidade, tipo, preço, cidade, bairro, quartos e vagas, recebendo `201`. Consegue listar, consultar, atualizar parcialmente e excluir seus imóveis. Preço deve ser positivo; quartos e vagas podem ser zero. Dados persistem após reinício.

### RF-05 — Busca de imóveis

**CA-06:** A listagem combina os filtros fornecidos por AND: finalidade, tipo, cidade, bairro, preço mínimo/máximo e quantidade mínima de quartos/vagas. Limites de preço são inclusivos; cidade e bairro usam igualdade sem distinção entre maiúsculas e minúsculas, após trim, com acentos preservados. Uma busca sem resultados retorna `200` com lista vazia. `minPriceCents > maxPriceCents` retorna `400`.

### RF-06 — Isolamento entre corretores

**CA-07:** Com dois corretores A e B, A não lista nem encontra por filtros os leads ou imóveis de B. GET, PATCH e DELETE de A usando um ID de B retornam `404`, assim como um ID inexistente. Nenhuma tentativa altera dados de B. O backend obtém o proprietário da identidade autenticada; enviar `brokerId` no body ou query retorna `400`.

### RF-07 — Validação e erros

**CA-08:** Bodies e queries rejeitam campos desconhecidos, tipos incorretos, strings vazias após trim e valores fora dos limites com `400`. UUID inválido na rota retorna `400`. PATCH vazio retorna `400`. Campos obrigatórios rejeitam `null`; campos opcionais explicitamente anuláveis aceitam `null` conforme contrato. Erros internos retornam `500` sem stack trace, SQL, senha ou token.

### RF-08 — Listagens limitadas

**CA-09:** Listagens de leads e imóveis recebem `page` (inteiro de 1 a 2.147.483.647; padrão 1) e `limit` (1 a 100; padrão 20). Retornam `{ items, page, limit, total }`, ordenados por `createdAt DESC, id DESC`. `total` considera filtros e proprietário. Fora da última página, `items` é vazio. Não se promete estabilidade entre páginas sob gravações concorrentes nesta etapa.

## Contrato HTTP

Prefixo: `/api`. JSON nas requisições e respostas, exceto respostas `204` sem body. Autenticação: `Authorization: Bearer <token>`.

| Método e caminho             | Acesso      | Entrada                    | Sucesso                |
| ---------------------------- | ----------- | -------------------------- | ---------------------- |
| POST `/api/auth/register`    | Público     | nome, e-mail, senha        | 201, corretor          |
| POST `/api/auth/login`       | Público     | e-mail, senha              | 200, token             |
| POST `/api/leads`            | Autenticado | criação de lead            | 201, lead              |
| GET `/api/leads`             | Autenticado | paginação                  | 200, página de leads   |
| GET `/api/leads/:id`         | Autenticado | UUID                       | 200, lead              |
| PATCH `/api/leads/:id`       | Autenticado | campos editáveis de lead   | 200, lead              |
| DELETE `/api/leads/:id`      | Autenticado | UUID                       | 204                    |
| POST `/api/properties`       | Autenticado | criação de imóvel          | 201, imóvel            |
| GET `/api/properties`        | Autenticado | filtros e paginação        | 200, página de imóveis |
| GET `/api/properties/:id`    | Autenticado | UUID                       | 200, imóvel            |
| PATCH `/api/properties/:id`  | Autenticado | campos editáveis de imóvel | 200, imóvel            |
| DELETE `/api/properties/:id` | Autenticado | UUID                       | 204                    |

### Campos

Strings de texto recebem trim; senhas são preservadas exatamente como enviadas. Limites são de caracteres. Não há unicidade de contato entre leads.

| Recurso  | Campos de entrada                                                                                                                                                                                                                                                                                    |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cadastro | `name`: 1–120; `email`: e-mail válido até 254; `password`: 12–128                                                                                                                                                                                                                                    |
| Login    | `email`: e-mail válido até 254; `password`: string não vazia até 128                                                                                                                                                                                                                                 |
| Lead     | `name`: obrigatório, 1–120; `email`: opcional/anulável, e-mail válido até 254; `phone`: opcional/anulável, 8–20, apenas dígitos e um `+` inicial opcional; `notes`: opcional/anulável, até 2000                                                                                                      |
| Imóvel   | `title`: obrigatório, 1–160; `description`: opcional/anulável, até 5000; `purpose`: `SALE` ou `RENT`; `type`: `APARTMENT`, `HOUSE`, `LAND` ou `COMMERCIAL`; `priceCents`: inteiro de 1 a 2147483647; `city` e `neighborhood`: obrigatórios, 1–120; `bedrooms` e `parkingSpaces`: inteiros de 0 a 100 |
| Filtros  | `purpose`, `type`, `city`, `neighborhood`, `minPriceCents`, `maxPriceCents` (0 a 2147483647), `minBedrooms`, `minParkingSpaces` (0 a 100), `page`, `limit`                                                                                                                                           |

Todo campo de criação é obrigatório salvo quando marcado opcional. PATCH aceita qualquer subconjunto não vazio dos campos de criação. IDs, proprietário e timestamps não são editáveis. Queries numéricas aceitam somente representação decimal inteira, rejeitando frações, notação científica, valores vazios e parâmetros repetidos.

Respostas de recursos contêm `id`, campos de negócio, `createdAt` e `updatedAt`; opcionais ausentes aparecem como `null`. Não retornam `passwordHash` ou `brokerId`. No cadastro, retorna-se somente o corretor, sem token automático.

Formato de erro: `{ statusCode, code, message, details? }`. `details` aparece em erros de validação como lista de `{ field, message }`.

| HTTP | `code`                     | Situação                                    |
| ---- | -------------------------- | ------------------------------------------- |
| 400  | `VALIDATION_ERROR`         | Entrada inválida                            |
| 401  | `UNAUTHORIZED`             | Falha de autenticação                       |
| 404  | `RESOURCE_NOT_FOUND`       | Recurso inexistente ou fora do proprietário |
| 409  | `EMAIL_ALREADY_REGISTERED` | Duplicidade de e-mail                       |
| 500  | `INTERNAL_ERROR`           | Falha inesperada                            |

## Definição de pronto da etapa

- CA-01 a CA-09 verificados e vinculados às tarefas.
- Controllers delegam regras aos serviços; DTOs e pipes validam entradas.
- Configuração de TypeScript estrita, build e lint passam.
- Migrations versionadas e aplicáveis a banco vazio.
- Testes com Jest e Supertest passam; isolamento usa dois corretores e banco PostgreSQL de teste.
- README descreve setup, comandos, contratos e decisões relevantes.
- Nenhum segredo real é versionado.
