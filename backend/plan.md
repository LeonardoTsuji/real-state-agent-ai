# Plano de Estudos — Engenharia Backend com IA

## Projeto-guia: Corretor Copilot

Plataforma inteligente para apoiar um corretor de imóveis autônomo no cadastro e acompanhamento de leads, busca de imóveis, agendamento de visitas, follow-ups e organização do funil de vendas.

O objetivo deste plano é desenvolver as competências necessárias para trabalhar com aplicações backend que combinam LLMs, ferramentas internas, integrações externas, filas, regras de negócio e mecanismos de segurança.

## Objetivo profissional

Ao concluir o projeto, devo ser capaz de:

- construir backends modulares e testáveis com NestJS e TypeScript;
- modelar dados e regras de negócio no PostgreSQL;
- integrar serviços externos com baixo acoplamento;
- processar tarefas assíncronas com Redis e BullMQ;
- implementar conversas com LLMs e tool calling;
- decidir quando usar IA e quando usar código determinístico;
- proteger operações sensíveis com autenticação, autorização e confirmação;
- avaliar qualidade, custo, latência e segurança do sistema;
- explicar as decisões e os trade-offs arquiteturais do projeto.

## Stack principal

- TypeScript
- Node.js
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
- OpenAI SDK
- Zod
- Jest e Supertest
- Docker Compose
- Pino e/ou OpenTelemetry

## Escopo do produto

O Corretor Copilot permitirá ao corretor:

- cadastrar e acompanhar leads;
- registrar preferências de compradores e locatários;
- cadastrar ou importar imóveis;
- encontrar imóveis compatíveis com um lead;
- registrar interesses e rejeições;
- agendar visitas sem conflito de horários;
- manter o histórico das conversas;
- criar tarefas e lembretes;
- gerar rascunhos de follow-up;
- acompanhar o estágio de cada lead no funil;
- confirmar ações sensíveis antes de executá-las.

## Princípio arquitetural

O LLM interpreta linguagem, extrai informações e redige respostas. O backend controla identidade, autorização, regras de negócio e efeitos externos.

> O modelo pode sugerir uma ação; código determinístico decide se ela é válida e permitida.

### IA ou código tradicional

| Problema | Solução principal |
|---|---|
| Entender a mensagem do cliente | LLM |
| Extrair preferências do imóvel | LLM + schema validado |
| Buscar imóveis por filtros | SQL |
| Calcular comissão | Código determinístico |
| Verificar conflito de agenda | Código determinístico |
| Produzir resumo personalizado | LLM baseado em dados reais |
| Avaliar compatibilidade básica | Código determinístico |
| Explicar uma recomendação | LLM |
| Enviar mensagem ao cliente | Código + confirmação |
| Alterar dados importantes | Código + autorização |
| Redigir follow-up | LLM |
| Definir quando executar follow-up | Regra + fila |

## Arquitetura inicial

```text
Chat / Painel Web / Canal de mensagens simulado
                       |
                       v
                    NestJS API
                       |
                       v
            Autenticação e autorização
                       |
                       v
            Orquestrador conversacional
              |        |        |
              v        v        v
          Lead tools  Imóveis  Agenda/Tasks
                       |
                       v
             Serviços de aplicação
                       |
                       v
       PostgreSQL / Redis / Integrações
```

Começar com um único orquestrador e poucas ferramentas. Adicionar múltiplos agentes somente quando houver necessidade concreta de separar contexto, permissões ou responsabilidades.

## Organização dos módulos

```text
src/
├── auth/
├── brokers/
├── leads/
├── properties/
├── visits/
├── tasks/
├── conversations/
├── integrations/
│   ├── calendar/
│   ├── messaging/
│   └── property-portals/
├── ai/
│   ├── orchestrator/
│   ├── tools/
│   ├── policies/
│   └── prompts/
├── jobs/
├── audit/
└── common/
```

Regras de negócio não devem ficar em controllers nem apenas em prompts.

## Modelo de dados inicial

### Entidades

- `Broker`
- `Lead`
- `LeadPreference`
- `Property`
- `PropertyOwner`
- `LeadPropertyMatch`
- `Conversation`
- `Message`
- `Visit`
- `Task`
- `IntegrationAccount`
- `ToolExecution`
- `AuditLog`
- `Consent`

### Relacionamentos principais

```text
Broker       1 --- N Lead
Lead         1 --- 1 LeadPreference
Lead         1 --- N Conversation
Conversation 1 --- N Message
Lead         N --- N Property
Lead         1 --- N Visit
Property     1 --- N Visit
Lead         1 --- N Task
```

### Compatibilidade entre lead e imóvel

```typescript
type LeadPropertyMatch = {
  leadId: string;
  propertyId: string;
  score: number;
  status: 'SUGGESTED' | 'SENT' | 'INTERESTED' | 'REJECTED';
  rejectionReason?: string;
};
```

## Ferramentas do agente

Começar com ferramentas pequenas, explícitas e validadas:

- `create_lead`
- `get_lead`
- `update_lead_preferences`
- `search_properties`
- `get_property_details`
- `save_property_interest`
- `list_available_visit_slots`
- `schedule_visit`
- `create_follow_up_task`
- `list_pending_tasks`
- `draft_follow_up_message`

Cada ferramenta deverá:

- possuir schema de entrada;
- validar argumentos;
- receber a identidade do corretor pelo backend, nunca pelo modelo;
- verificar autorização;
- ter timeout;
- ser idempotente quando produzir efeitos;
- retornar dados estruturados;
- registrar execução e resultado;
- esconder detalhes internos das integrações.

## Roadmap de 14 semanas

Carga sugerida: 8 a 12 horas por semana.

### Etapa 1 — NestJS profissional — semanas 1 a 3

#### Estudar

- TypeScript estrito, tipos, generics e tratamento de erros;
- módulos, controllers e providers;
- injeção de dependência;
- DTOs, pipes e validação;
- guards e autenticação;
- exception filters e interceptors;
- configuração por ambiente;
- testes unitários e end-to-end.

#### Entregar

- projeto NestJS inicial;
- PostgreSQL e Redis com Docker Compose;
- autenticação do corretor;
- CRUD de leads;
- CRUD de imóveis;
- busca de imóveis com filtros;
- testes com Jest e Supertest.

#### Critérios de conclusão

- controllers finos;
- regras em serviços ou casos de uso;
- validação em todas as entradas;
- erros de domínio mapeados para respostas HTTP adequadas;
- testes impedindo acesso indevido a recursos.

### Etapa 2 — Dados e arquitetura — semanas 4 a 6

#### Estudar

- modelagem relacional;
- constraints e transações;
- índices e análise de consultas;
- paginação estável;
- migrations;
- separação entre domínio, aplicação e infraestrutura;
- repository pattern usado de forma pragmática;
- isolamento de integrações por adapters.

#### Entregar

- preferências do lead;
- relacionamento lead-imóvel;
- agenda de visitas;
- prevenção de conflitos de horário;
- histórico de interações;
- tarefas;
- funil de vendas;
- auditoria das operações importantes.

#### Critérios de conclusão

- constraints importantes também existem no banco;
- operações relacionadas usam transações;
- consultas frequentes possuem índices justificados;
- a aplicação não depende diretamente de formatos de APIs externas.

### Etapa 3 — Integrações e filas — semanas 7 e 8

#### Estudar

- Redis e BullMQ;
- producers, consumers e eventos;
- retries com backoff;
- idempotência;
- jobs atrasados e recorrentes;
- concorrência e rate limiting;
- tratamento de falhas permanentes;
- transactional outbox;
- logs e métricas de filas.

#### Entregar

- lembretes de visitas;
- follow-ups programados;
- importação simulada de imóveis;
- integração simulada com calendário;
- processamento assíncrono de mensagens;
- política de retry e registro de falhas.

#### Critérios de conclusão

- repetir um job não duplica uma operação;
- falhas transitórias são retentadas;
- falhas permanentes ficam visíveis;
- o status do job pode ser rastreado;
- o fluxo continua consistente após reinício do worker.

### Etapa 4 — LLMs e tool calling — semanas 9 a 11

#### Estudar

- Responses API e SDK TypeScript;
- instruções e contexto;
- outputs estruturados;
- function/tool calling;
- loop de execução de ferramentas;
- schemas JSON e Zod;
- limites de iterações;
- custo, tokens e latência;
- fallback determinístico;
- confirmação humana.

#### Implementar progressivamente

1. extração estruturada das preferências;
2. busca de imóveis por tool call;
3. criação e atualização de leads;
4. consulta de horários disponíveis;
5. agendamento após confirmação;
6. geração de follow-up;
7. controle e resumo de contexto;
8. fallback para operação manual.

#### Serviço de orquestração

```typescript
@Injectable()
export class AgentOrchestratorService {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly policyService: AgentPolicyService,
  ) {}

  async execute(command: AgentCommand): Promise<AgentResult> {
    // Carregar apenas o contexto autorizado.
    // Chamar o modelo com as ferramentas disponíveis.
    // Validar e autorizar cada tool call.
    // Executar ferramentas com limite de tempo.
    // Devolver resultados estruturados ao modelo.
    // Persistir mensagens, métricas e auditoria.
    throw new Error('Not implemented');
  }
}
```

#### Critérios de conclusão

- o modelo nunca consulta diretamente o banco;
- toda tool call é validada e autorizada;
- informações sobre imóveis vêm do banco;
- ações externas exigem confirmação quando aplicável;
- existe limite de chamadas e tempo por execução;
- todas as execuções são rastreáveis.

### Etapa 5 — Segurança, avaliação e produção — semanas 12 a 14

#### Estudar e implementar

- rate limiting;
- autenticação e autorização em profundidade;
- princípio do menor privilégio;
- proteção contra prompt injection;
- limites de custo, duração e tool calls;
- mascaramento de dados pessoais;
- política de retenção das conversas;
- logs estruturados e correlation ID;
- métricas e tracing;
- health checks;
- avaliações automatizadas de conversas;
- deploy e operação dos workers.

#### Dataset de avaliação

Criar pelo menos 100 casos, incluindo:

- busca comum de imóvel;
- pedido incompleto ou ambíguo;
- lead com orçamento incompatível;
- imóvel inexistente;
- tentativa de acessar dados de outro corretor;
- tentativa de prompt injection;
- agendamento com conflito;
- calendário indisponível;
- tool com timeout;
- ação duplicada;
- conversa longa;
- necessidade de confirmação;
- necessidade de atendimento manual.

#### Métricas

- escolha correta da ferramenta;
- correção dos argumentos;
- taxa de respostas fundamentadas;
- taxa de conclusão da tarefa;
- violações de autorização;
- confirmações respeitadas;
- fallback correto;
- latência total;
- quantidade de tool calls;
- tokens e custo por conversa;
- taxa de erros por integração.

## MVP conversacional

Fluxo mínimo esperado:

```text
Cliente:
Procuro um apartamento de até 600 mil na Vila Mariana,
com dois quartos e uma vaga.

Assistente:
Encontrei três imóveis compatíveis. Você prefere receber
um resumo ou verificar horários para visita?

Cliente:
Quero visitar o segundo sábado à tarde.

Assistente:
Há disponibilidade às 14h e às 16h. Qual horário prefere?

Cliente:
16h.

Assistente:
Posso agendar a visita para sábado às 16h?
```

Somente depois da confirmação deverá ser executada a ferramenta `schedule_visit`.

## Primeira sprint — começar aqui

A primeira sprint será totalmente determinística, sem LLM.

### Tarefas

- [ ] Criar o projeto NestJS com TypeScript estrito.
- [ ] Configurar lint e formatação.
- [ ] Subir PostgreSQL e Redis com Docker Compose.
- [ ] Configurar Prisma e migrations.
- [ ] Modelar `Broker`, `Lead`, `LeadPreference`, `Property` e `Visit`.
- [ ] Implementar autenticação.
- [ ] Criar CRUD de leads.
- [ ] Criar CRUD e busca de imóveis.
- [ ] Implementar agendamento de visitas.
- [ ] Impedir conflito de horários.
- [ ] Impedir acesso aos dados de outro corretor.
- [ ] Criar testes unitários e end-to-end.
- [ ] Documentar setup, arquitetura e decisões no README.

### Definição de pronto

- a aplicação sobe com um único comando documentado;
- migrations são reproduzíveis;
- entradas inválidas retornam erros claros;
- endpoints protegidos exigem autenticação;
- o isolamento de dados possui testes;
- conflito de visitas possui teste;
- a suíte de testes passa localmente;
- nenhuma chave ou segredo está versionado.

## Segunda sprint — primeira integração com IA

Adicionar somente duas capacidades:

- `extract_lead_preferences`
- `search_properties`

Fluxo:

```text
Mensagem do cliente
        |
        v
Extração estruturada pelo LLM
        |
        v
Validação do schema no backend
        |
        v
Busca determinística no PostgreSQL
        |
        v
Resposta baseada nos resultados reais
```

### Testes obrigatórios

- mensagem completa;
- mensagem sem orçamento;
- bairro inexistente;
- valor escrito de forma informal;
- nenhuma propriedade encontrada;
- tool call com argumento inválido;
- tentativa de fazer o modelo ignorar as regras;
- resposta sem inventar resultados.

## Evoluções posteriores

Implementar apenas depois do MVP estar confiável:

- integração real com calendário;
- integração real com WhatsApp;
- importadores de portais imobiliários;
- busca semântica de descrições;
- scoring avançado de compatibilidade;
- múltiplos corretores ou pequenas imobiliárias;
- dashboard de métricas;
- handoff para humano;
- workflows duráveis de negociação;
- múltiplos agentes, se houver justificativa arquitetural.

## O que evitar no início

- arquitetura de microserviços sem necessidade;
- múltiplos agentes antes de dominar tool calling;
- regras críticas apenas no prompt;
- banco vetorial antes de existir um caso de uso claro;
- abstrações genéricas para integrações ainda inexistentes;
- permitir que o modelo execute SQL;
- permitir que o modelo defina a identidade do usuário;
- enviar mensagens ou agendar visitas sem confirmação;
- avaliar qualidade apenas manualmente.

## Perguntas para revisão arquitetural

Ao concluir cada etapa, responder por escrito:

1. Qual falha este componente pode sofrer?
2. Como essa falha é detectada?
3. A operação pode ser repetida com segurança?
4. Existe risco de acessar dados de outro usuário?
5. Por que isto usa IA em vez de código tradicional?
6. O resultado pode ser auditado?
7. Como medir qualidade, custo e latência?
8. Qual é o caminho de fallback?

## Resultado esperado para o portfólio

O repositório final deve conter:

- README com problema, arquitetura e decisões;
- diagrama da arquitetura;
- instruções para execução local;
- migrations e dados de demonstração;
- API documentada;
- testes unitários, de integração e end-to-end;
- exemplos de conversas;
- dataset de avaliação;
- métricas de qualidade e desempenho;
- threat model resumido;
- registro das principais decisões arquiteturais;
- demonstração em vídeo ou ambiente publicado.

O projeto deve demonstrar principalmente que sei construir um sistema backend confiável no qual a IA é um componente controlado, observável e substituível — não o lugar onde todas as regras vivem.

## Referências iniciais

- [NestJS Documentation](https://docs.nestjs.com/)
- [NestJS Queues](https://docs.nestjs.com/techniques/queues)
- [OpenAI Responses API para TypeScript](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create)
- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/current/)
- [OWASP Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [OWASP Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
