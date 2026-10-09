# Plano técnico — etapa 3

## Componentes

Separar producers de casos de uso, dispatcher da outbox e consumers BullMQ. Payloads são contratos versionados e pequenos; consumidores recarregam estado autorizado do banco em vez de confiar em dados mutáveis do job. PostgreSQL é a fonte da verdade; Redis/BullMQ é o transporte e execução.

## Outbox e deduplicação

Na mesma transação do domínio, inserir `OutboxEvent` com ID, tipo/versão, chave do agregado, instante e payload mínimo. Dispatcher reivindica eventos com lock e lease, publica job com ID determinístico e marca publicado. Repetições são esperadas. Tabela de idempotência no consumidor registra chave e resultado dentro da transação do efeito; retenção cobre o horizonte de retries e redrives.

Não alegar “exactly once”: projetar entrega pelo menos uma vez e efeitos idempotentes. Falhas após executar efeito e antes do ack precisam ser seguras.

## Política de retry

Classificar erros transitórios e permanentes. Configurar tentativas máximas, backoff exponencial com jitter, timeout e concorrência por fila. Falhas permanentes vão para estado visível/DLQ lógico com causa sanitizada. Replay exige chave original ou nova chave explicitamente auditada conforme efeito pretendido.

## Adaptadores simulados

Calendário e mensageria têm ports internos e adapters determinísticos configuráveis para sucesso/timeout/erro transitório. Importação usa fonte de fixture, valida por linha e grava resultado parcial de modo idempotente. Isso mantém cenários repetíveis sem contas externas.

## Operação e segurança

Endpoint interno/console de job exige autenticação operacional e não devolve payload sensível. Métricas incluem fila, estado, duração, tentativas e idade do evento. Segredos ficam em configuração; logs redigem dados pessoais. Testes cobrem restart, indisponibilidade de Redis, concorrência e replay.
