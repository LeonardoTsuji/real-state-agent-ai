# Plano técnico — etapa 1

## Estado observado

O repositório contém o starter NestJS 11, TypeScript, pnpm, ESLint, Prettier, Jest e Supertest. Há apenas a rota `GET /` com `Hello World!` e seus testes. `tsconfig.json` habilita `strictNullChecks`, mas permite `noImplicitAny: false`; a configuração estrita ainda precisa ser concluída. Não há autenticação, Prisma, infraestrutura local ou módulos de negócio.

## Decisões iniciais

1. Manter um monólito modular com `AuthModule`, `BrokersModule`, `LeadsModule`, `PropertiesModule`, `PrismaModule` e configuração compartilhada. Controllers traduzem HTTP; serviços validam regras de negócio; Prisma persiste os dados. Introduzir repositories apenas se houver benefício concreto.
2. Usar DTOs com validação e transformação explícitas, pipe global com rejeição de campos desconhecidos e validação também nos parâmetros de rota. Compartilhar bootstrap HTTP entre produção e testes e2e.
3. Autenticar com JWT assinado, validade configurável (padrão 3600 segundos), verificação de algoritmo, assinatura e expiração. `sub` identifica o corretor; guard confirma sua existência e fornece identidade ao serviço. Senhas usam hash Argon2id; e-mail tem constraint única normalizada no banco. Mapear também a colisão concorrente de cadastro para `409`.
4. Filtrar toda leitura, atualização e exclusão por `id` e `brokerId`. Nunca confiar em proprietário recebido do cliente. Atualização/exclusão precisa manter o escopo na operação de escrita, e não somente em uma leitura anterior.
5. Guardar valores monetários em inteiros e timestamps em UTC. Começar com paginação por offset e desempate por ID; paginação estável sob concorrência pertence à etapa 2.
6. Mapear erros de domínio em filtro global para o envelope da especificação; falhas de infraestrutura não expõem detalhes internos. Usar interceptor para duração e status HTTP, sem registrar bodies, contatos ou credenciais. Não criar módulo de auditoria nesta etapa.
7. Provisionar PostgreSQL e Redis com volumes e health checks. O script de desenvolvimento aguarda PostgreSQL, aplica migrations e inicia NestJS. Fixar versões compatíveis no momento da implementação e preservar lockfile. Redis ainda não é usado pela aplicação.

8. Prisma fica em CommonJS nesta etapa: Prisma ORM 6.19.0 se integra ao starter NestJS atual. A linha 6 recebe atualizações de segurança até 19 de novembro de 2026; antes de concluir a etapa 2 ou expor a aplicação publicamente, adotar uma versão suportada e migrar a aplicação para o formato exigido por ela. Prisma 7 exige ESM e driver adapter; acompanhar a disponibilidade estável da linha 8 antes de escolher a versão-alvo.

## Modelo mínimo

| Entidade | Persistência                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broker   | UUID, nome, e-mail normalizado único, hash de senha, timestamps                                                                                       |
| Lead     | UUID, FK obrigatória para Broker, nome, e-mail/telefone/notas anuláveis, timestamps                                                                   |
| Property | UUID, FK obrigatória para Broker, título, descrição anulável, enums de finalidade/tipo, preço em centavos, cidade, bairro, quartos, vagas, timestamps |

Prever índices por proprietário para listagens. Restringir remoção de Broker com dependentes (não há endpoint de remoção nesta etapa). Persistência deve apoiar limites monetários, campos obrigatórios e relações. A regra de ao menos um contato é validada nos serviços, considerando o estado final do PATCH. Constraints adicionais e análise de desempenho serão aprofundadas na etapa 2.

## Configuração e operação local

Definir `.env.example` sem credenciais reais, com `PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` e `JWT_EXPIRES_IN_SECONDS`. Validar porta, URLs, segredo não vazio com pelo menos 32 caracteres e expiração inteira positiva antes de subir HTTP. O exemplo deve orientar a geração local do segredo, sem fornecer um segredo funcional padrão.

Separar configuração de teste, incluindo banco dedicado. A rotina de reset e2e precisa verificar explicitamente que está em ambiente de teste e apontando para o banco dedicado antes de apagar dados. Documentar setup inicial, comando único para subir a aplicação, comandos de encerramento e migrations; excluir volumes apenas em comando separado e explicitamente destrutivo.

## Estratégia de verificação

- Unitários: regras de contato de lead após PATCH, combinação/limites de filtros, normalização de e-mail e mapeamento de erros de domínio.
- E2e com Supertest e PostgreSQL: cadastro, duplicidade, login, token inválido/expirado, CRUD, filtros, paginação, DTOs e acesso cruzado GET/PATCH/DELETE com dois corretores. Conferir que dados de B permanecem intactos após tentativas de A.
- Infraestrutura: aplicar migrations em banco vazio e validar persistência após reinício sem remover volumes.
- Qualidade: build, lint sem correções automáticas e testes; registrar comandos e resultados nas tarefas.

Mocks nos testes unitários não substituem o teste de isolamento no banco real. Redis precisa ser verificado na infraestrutura local, mas não nos testes de CRUD.

## Ordem de execução

1. Fundação estrita, configuração e infraestrutura.
2. Persistência mínima e autenticação.
3. Leads com isolamento.
4. Imóveis, filtros e isolamento.
5. Verificação integrada e documentação de operação.

Cada incremento implementa apenas seus contratos e testes; mudanças no contrato exigem atualização da especificação e da rastreabilidade antes de seguir.
