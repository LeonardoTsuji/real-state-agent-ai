# Revisão arquitetural — etapa 1

Estado: respostas iniciais após implementar API, persistência e testes. Limites conhecidos devem ser reavaliados ao entrar nas etapas seguintes.

1. **Que falhas podem ocorrer?** Banco ou Redis podem ficar indisponíveis; entradas inválidas, tokens inválidos e violações de domínio podem falhar; operações HTTP podem ser repetidas pelo cliente. A API não usa Redis ainda. Falhas de persistência impedem a operação, e o startup do Prisma falha se PostgreSQL não aceitar conexão.
2. **Como detectamos falhas?** Health checks do Compose detectam PostgreSQL/Redis não prontos. Erros de domínio e HTTP recebem status e envelope padronizados. O interceptor registra método, caminho, status e duração sem corpo da requisição. Não há endpoint de readiness nem métricas de infraestrutura nesta etapa.
3. **Operações podem ser repetidas com segurança?** Leituras são seguras. Cadastro de corretor repete com `409` para e-mail já usado. Criar lead/imóvel não é idempotente e pode criar duplicatas; DELETE repetido retorna `404`. PATCH substitui os campos enviados, mas não há chave de idempotência. Isso é aceitável para API síncrona sem filas ou efeitos externos; chaves para jobs são tratadas na etapa 3.
4. **Há risco de acesso a dados de outro corretor?** Endpoints protegidos derivam o corretor do JWT e aplicam `brokerId` em consulta, escrita e exclusão. O token é validado por assinatura, expiração e algoritmo. E2E exercita dois corretores em GET, PATCH, DELETE e filtros. Rate limit e controles operacionais adicionais ficam para a etapa 5.
5. **Por que usar IA em vez de código tradicional?** Nenhum comportamento desta etapa usa IA. CRUD, autenticação, filtros, normalização e validação são determinísticos; entendimento de linguagem será introduzido na etapa 4.
6. **O resultado pode ser auditado?** Migrations, timestamps, identidade autenticada e logs de método/status/duração ajudam a diagnosticar. Não existe trilha de auditoria por mutação nesta etapa; ela será entregue na etapa 2. Logs não guardam corpo, senha, token nem contato.
7. **Como medir qualidade, custo e latência?** Build, lint, unitários e e2e verificam qualidade funcional e isolamento. O interceptor registra duração e status HTTP. Ainda não há tracing nem métricas agregadas; custo de LLM não se aplica nesta etapa.
8. **Qual é o caminho de fallback?** O corretor pode continuar usando a API REST diretamente. Se o backend ou PostgreSQL estiver indisponível, mutações não são aceitas e retornam erro; não há integração externa nem fluxo de IA que exija fallback manual nesta etapa.

## Evidências

- `pnpm build` e `pnpm lint` passam.
- `pnpm test --runInBand`: 3 suítes e 7 testes unitários passam.
- `pnpm test:e2e --runInBand`: 4 cenários passam contra PostgreSQL dedicado.
- `pnpm start:local` sobe os serviços, aplica migration e inicia a API; rotas protegidas e o prefixo foram verificados pela suíte e2e.
- PostgreSQL, Redis e dados de teste locais persistem após restart de containers.
