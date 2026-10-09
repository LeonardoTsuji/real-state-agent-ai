# 003 — Integrações e filas

Status: implementação concluída; falta apenas o teste de encerramento abrupto do worker previsto em CA-03.

Origem: `plan.md`, “Etapa 3 — Integrações e filas — semanas 7 e 8”. Integrações são simuladas nesta etapa.

## Requisitos e critérios de aceite

### RF-01 — Jobs confiáveis

**CA-01:** Producers e workers BullMQ processam lembretes de visita, follow-ups, importações e mensagens. Cada job tem ID estável/idempotency key, payload versionado e status rastreável. Reenviar o mesmo comando não duplica o efeito de negócio.

**CA-02:** Falhas transitórias tentam novamente com backoff exponencial e jitter, dentro de máximo configurado. Falhas permanentes não são retentadas indefinidamente, ficam em estado de falha consultável e permitem replay controlado após correção. Timeout encerra tentativa e registra causa sanitizada.

**CA-03:** Jobs atrasados e recorrentes não criam duplicatas após reinício. Concorrência por fila é limitada e rate limiting evita ultrapassar capacidade dos adapters. Reiniciar worker durante processamento recupera jobs pendentes sem perder ou repetir efeitos não idempotentes.

### RF-02 — Consistência entre banco e fila

**CA-04:** Uma alteração de negócio e a intenção de publicar evento são gravadas na mesma transação via outbox. Se Redis estiver indisponível, a alteração confirmada permanece publicável e é entregue depois da recuperação. Um dispatcher pode publicar o evento mais de uma vez sem repetir efeito de negócio.

### RF-03 — Fluxos

**CA-05:** Lembretes são agendados para visitas elegíveis, cancelamento/remarcação substitui ou invalida o job anterior, e uma visita cancelada não provoca envio.

**CA-06:** Follow-up agendado pertence a lead e corretor existentes; cancelar ou concluir impede execução posterior. A política de horário aplica timezone configurado e respeita horário comercial definido.

**CA-07:** Importação simulada recebe registros de imóveis, valida cada linha, cria/atualiza apenas dados do corretor autorizado e reporta totais de lidos, aceitos, rejeitados e razões por linha. Reexecutar mesmo lote é idempotente.

**CA-08:** Adapter de calendário simulado permite reservar, consultar e cancelar evento e simula sucesso, timeout e indisponibilidade transitória. Estado local e remoto simulado convergem por retries sem criar eventos duplicados.

**CA-09:** Mensagens simuladas são processadas assincronamente, vinculadas à conversa/lead, e recebem estado rastreável. Repetição de webhook/comando não duplica mensagem; falha permanente é visível e não aparece falsamente como enviada.

### RF-04 — Operação

**CA-10:** Operadores autorizados consultam status, tentativas, próximo retry e falha sanitizada por job. Logs e métricas exibem volume, latência, retries, sucesso e falha permanente por fila sem incluir tokens, credenciais ou conteúdo pessoal.

## Estados e idempotência

Estados observáveis: `WAITING`, `ACTIVE`, `COMPLETED`, `FAILED`, `CANCELED`. O domínio define a chave idempotente e a janela de retenção para cada efeito. Jobs antigos com versão de payload não suportada falham com motivo explícito e podem ser migrados/republicados; não são interpretados silenciosamente.

## Definição de pronto

- CA-01 a CA-10 passam em cenários com Redis indisponível, reinício, retries, concorrência e replay.
- Falha permanente é consultável e tem procedimento documentado de replay.
- Outbox fecha a janela de perda entre commit do negócio e enqueue.
- Integrações continuam atrás de adapters; domínio não importa BullMQ nem DTOs externos.
