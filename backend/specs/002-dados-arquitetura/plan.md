# Plano técnico — etapa 2

## Arquitetura

Organizar dependências em domínio, aplicação e infraestrutura sem criar abstrações genéricas antecipadas. Casos de uso definem transações; adapters Prisma implementam ports de persistência. Controllers permanecem na borda HTTP. Integrações externas futuras recebem adapters separados e nunca vazam seus DTOs ao domínio.

Na implementação, `ChangeLeadStageUseCase` depende de `LeadStagePort`; `PrismaLeadStageAdapter` contém a escrita condicional, histórico e auditoria. As regras de transição e intervalo de visita são funções puras testadas sem banco. Os demais serviços Nest mantêm Prisma nos fluxos onde a transação está estreitamente ligada a constraints SQL; a extração para novos ports deve acompanhar um segundo adapter real que traga benefício de teste ou manutenção.

Transições permitidas do estágio: `NEW → CONTACTED|LOST`; `CONTACTED → QUALIFIED|LOST`; `QUALIFIED → VISIT_SCHEDULED|NEGOTIATION|LOST`; `VISIT_SCHEDULED → QUALIFIED|NEGOTIATION|LOST`; `NEGOTIATION → WON|LOST`; `LOST → CONTACTED`; `WON` é terminal. Repetir o estágio atual é idempotente.

## Modelo

Adicionar `LeadPreference` (1:1), `LeadPropertyMatch`, `Visit`, `Interaction`, `Task`, `LeadStageHistory` e `AuditLog`. Indexar proprietário mais ordenação temporal nas listagens de visitas, tarefas e interações; unicidade do par lead-imóvel; referências e status válidos com constraints. Índices devem ser justificados por consulta e plano de execução, não criados especulativamente.

IDs continuam UUID. Remoção de lead/imóvel com histórico deve seguir política explícita: não apagar histórico/auditoria em cascata; usar exclusão lógica onde a retenção seja necessária e definir comportamento antes de ativar remoção destrutiva. Mudanças aditivas de schema são preferidas; rollback com dados pode exigir migration compensatória.

Leads e imóveis usam `deleted_at`; consultas normais ocultam tombstones, enquanto FKs `RESTRICT` mantêm histórico. Preferências são exclusivas por `lead_id`; associações por `(lead_id, property_id)`. FKs compostas `(entity_id, broker_id)` garantem que o proprietário das entidades relacionadas corresponda ao corretor da nova linha.

Índices temporais seguem as consultas implementadas: `visits(broker_id,start_at,id)` para agenda, `visits(broker_id,status,start_at)` para agenda filtrada; `interactions(broker_id,lead_id,occurred_at,id)` para histórico; `tasks(broker_id,status,due_at,id)` para pendências e `tasks(broker_id,lead_id,status,due_at)` para pendências de um lead; `lead_property_matches(broker_id,lead_id,created_at,id)` para histórico de compatibilidade; `lead_stage_history(broker_id,lead_id,created_at,id)` para trilha de estágio; `audit_logs(broker_id,occurred_at,id)` para trilha do corretor e `(broker_id,entity_type,entity_id,occurred_at)` para auditoria de entidade. O índice `leads(broker_id,stage,deleted_at)` atende ao agrupamento do funil.

## Concorrência e transações

Checagem de conflito em aplicação por si só tem race condition. Usar constraint de exclusão por corretor e intervalo no PostgreSQL quando viável; caso contrário, lock transacional no recurso de agenda e isolamento que serializa reservas. E2E envia duas reservas sobrepostas em paralelo e espera exatamente uma confirmação. Cancelar/remarcar e gravar auditoria pertencem à mesma transação.

Cursor de paginação composto por `(createdAt, id)` ou chave temporal equivalente dá ordem total. O cursor é opaco, validado e ligado ao filtro/escopo; não aceita um proprietário fornecido pelo cliente.

## Auditoria

Gravar a auditoria dentro da transação de negócio para as operações cujo critério exige atomicidade. Redigir senha, tokens, contatos desnecessários e conteúdo livre sensível; incluir somente os campos de mudança permitidos pela política. Correlation ID vem de middleware confiável. Leitura de auditoria é escopada e não há alteração/exclusão pela API comum.

## Migração da etapa 1

Aplicar migrations em cópia de banco com leads e imóveis reais de teste; verificar integridade, índices e plano de rollback. Remoções destrutivas exigem migration de expansão/contração e transformação reversível ou migration compensatória documentada.

Migrations `20261006190000_stage2_data_architecture` e `20261006200000_stage2_integrity_constraints` são aditivas e preservam as tabelas existentes. A primeira cria entidades históricas e a exclusão GiST; a segunda adiciona checks de domínio e proprietário. A agenda requer a extensão `btree_gist`. Não remover migration já aplicada: em rollback de release, publicar migration compensatória que remova constraints e só então tabelas/colunas, após exportar ou migrar registros históricos. Descartar tabelas de eventos perde histórico e não é um rollback sem perda de dados.

As listas novas usam `nextCursor` baseado em `(instante,id)` e vinculam o escopo ao corretor e filtros; cursores de outro lead/filtro retornam `400`. A API legada de leads e imóveis preserva `page/limit` por compatibilidade com etapa 1.
