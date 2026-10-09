# 002 — Dados e arquitetura

Status: implementado; critérios CA-01 a CA-10 verificados conforme `tasks.md`.

Origem: `plan.md`, “Etapa 2 — Dados e arquitetura — semanas 4 a 6”.

## Objetivo e escopo

Expandir o CRM do corretor com preferências estruturadas, interesses em imóveis, visitas sem conflito, interações, tarefas, estágios de funil e auditoria. Preservar isolamento entre corretores, consistência transacional e independência de formatos externos. Esta etapa não inclui filas ou LLM.

## Requisitos e critérios de aceite

### RF-01 — Preferências do lead

**CA-01:** Cada lead tem zero ou uma preferência, sempre sob o mesmo corretor. Pode registrar finalidade, tipos de imóvel, faixa de preço, quartos, vagas, bairros e observações. PATCH parcial preserva campos omitidos; valores mínimos não podem exceder máximos. Uma preferência inconsistente retorna `400` e não grava alteração parcial.

### RF-02 — Relacionamento lead-imóvel

**CA-02:** O corretor associa um imóvel próprio a um lead próprio com score de compatibilidade de 0 a 100 e status `SUGGESTED`, `SENT`, `INTERESTED` ou `REJECTED`. Um par lead-imóvel é único. Rejeição pode incluir motivo. A associação de entidades de corretores distintos retorna `404` e nenhuma linha é gravada.

### RF-03 — Agenda de visitas

**CA-03:** O corretor cria, lista, consulta, remarca e cancela visitas para lead e imóvel próprios. Horários têm início e fim em UTC, duração positiva e estado `SCHEDULED`, `COMPLETED` ou `CANCELED`. Visitas marcadas para o mesmo corretor não se sobrepõem; intervalos adjacentes são permitidos. Tentativa concorrente de reservar intervalo conflitante resulta em conflito HTTP `409`, mesmo quando as solicitações chegam ao mesmo tempo.

**CA-04:** Alterar ou cancelar visita de outro corretor retorna `404`. Cancelamento guarda horário e ator da operação. Visitas canceladas ou concluídas não bloqueiam novos horários; remarcação verifica conflito e atualiza em uma transação.

### RF-04 — Histórico de interações

**CA-05:** O corretor registra uma interação vinculada a lead próprio, com tipo, instante, resumo e canal opcional. A listagem ordena por instante decrescente com desempate determinístico. Eventos não podem ser alterados ou apagados pela API comum. Um lead de outro corretor retorna `404`.

### RF-05 — Tarefas e funil

**CA-06:** O corretor cria tarefas para seus leads com título, vencimento, estado `PENDING`, `COMPLETED` ou `CANCELED`, e conclusão/cancelamento explícitos. Lista pendências por vencimento e pode filtrar por estado e lead. Mudanças válidas são persistidas e mudanças inválidas não deixam estado parcial.

**CA-07:** O lead tem estágio configurável dentre `NEW`, `CONTACTED`, `QUALIFIED`, `VISIT_SCHEDULED`, `NEGOTIATION`, `WON` e `LOST`. Transições permitidas são definidas no domínio; mudança registra evento de histórico com estágio anterior, novo estágio, autor e instante. Leitura de funil agrupa leads por estágio dentro do corretor.

### RF-06 — Auditoria

**CA-08:** Criação, alteração e exclusão de dados importantes (lead, preferência, associação, visita, tarefa e estágio) grava auditoria com ator, entidade, identificador, ação, instante UTC e correlação da requisição quando presente. Auditoria e mutação confirmada são atômicas. Falha ao gravar auditoria reverte a mutação. Dados sensíveis e credenciais não são copiados para o log.

### RF-07 — Dados e consultas

**CA-09:** Constraints de unicidade, integridade referencial, valores possíveis e invariantes simples existem também no PostgreSQL. Índices adicionados correspondem a consultas frequentes documentadas. Migrações existentes e dados válidos sobrevivem a upgrade e rollback conforme estratégia documentada. Leituras paginadas usam cursor composto e não duplicam nem omitem registros por inserções anteriores ao cursor.

**CA-10:** Operações que alteram múltiplas entidades usam transação. O domínio e casos de uso não dependem de modelos gerados pelo Prisma ou de formatos de APIs externas; adapters convertem infraestrutura para contratos da aplicação.

## Contrato de domínio

Todas as entidades pertencem a um corretor via relacionamento explícito ou via lead proprietário. IDs de entidades não provam autorização; consultas e escrita sempre aplicam o escopo do corretor autenticado.

Valores monetários continuam em centavos inteiros. Intervalos de visita usam semântica `[início, fim)`, permitindo visitas adjacentes. Todos os horários são normalizados para UTC. Restrições de concorrência devem ser garantidas no banco ou por lock/transação serializável, além da validação antecipada na aplicação.

Enums e transições acima formam vocabulário de domínio e não serão inferidos por prompts. Contratos HTTP novos e exemplos serão documentados junto das rotas, mantendo o envelope de erros da etapa 1.

## Definição de pronto

- CA-01 a CA-10 verificados.
- Conflito de agenda testado também sob concorrência.
- Operações multi-entidade e auditoria demonstram rollback integral em falha.
- Constraints e índices estão justificados no plano técnico.
- Casos de uso podem ser testados sem PostgreSQL/Prisma por meio de ports/adapters, enquanto integração real também é exercitada.
- Migrations aplicam em banco existente com dados de etapa 1.
