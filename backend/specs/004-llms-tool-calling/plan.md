# Plano técnico — etapa 4

## Limites de confiança

Responses API é adapter da aplicação; domínio não depende do SDK OpenAI. Chaves ficam no servidor. O modelo só vê ferramentas liberadas ao ator/contexto. Tool registry resolve schemas por versão e executores internos; argumento com `brokerId`, owner ou SQL é recusado. Toda consulta ainda inclui escopo aplicado pelo backend.

## Loop e limites

Orquestrador carrega conversa e contexto autorizado, inclui resumo/fatos necessários, chama modelo, valida saída, executa no máximo limites configurados e responde com resultados estruturados. Guardar métricas de tokens, custo estimado, latência e calls. Timeout por chamada e deadline total evitam execução ilimitada. Fallback não repete mutação incerta sem chave idempotente.

## Confirmação

Persistir proposta pendente com ator, conversa, tipo de ação, argumentos canonizados/hash, expiração e estado. Endpoint determinístico de confirmação valida ator, validade e hash dos argumentos, depois consome proposta atomicamente e executa caso de uso. Tool call do modelo não pode confirmar a própria proposta.

## Schemas, prompts e privacidade

Schemas Zod versionados validam entrada e saída. Instruções de sistema são recursos versionados, revisados e cobertos por casos adversariais; mensagem do usuário e conteúdo recuperado ficam explicitamente delimitados como dados não confiáveis. Enviar ao provedor apenas o mínimo necessário. Redigir dados pessoais em logs e aplicar retenção conforme política.

## Testes e custo

Usar adapter falso do modelo para testes de loop, inválidos, timeout e repetição; e2e mantém chamadas externas desligadas. Conjunto de avaliação versionado mede escolha de ferramenta, argumentos, fundamentação, conclusão, autorização, confirmação, fallback, latência, chamadas e tokens/custo. Implementação deve ter limites de iteração e gasto por conversa e permitir operação manual.
