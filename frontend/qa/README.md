# Verificação das telas

`capture.mjs` visita oito módulos por navegação SPA, usando login real e dados do ambiente demonstrativo. Captura as páginas em 390, 768 e 1440 px de largura e cinco diálogos em cada tamanho. As imagens ficam em `screenshots/`; `evidence.json` registra dimensões, erros de JavaScript e valores financeiros cortados.

Execute com a API e o frontend demo ativos, a partir de `frontend/`:

```sh
E2E_API_URL=http://127.0.0.1:3000/api E2E_WEB_URL=http://127.0.0.1:5173 node qa/capture.mjs
```

O navegador padrão é o Chrome instalado. `E2E_BROWSER_CHANNEL`, `E2E_BROKER_EMAIL` e `E2E_PASSWORD` permitem usar outro canal ou credenciais de demonstração. A captura lê dados; não inicia serviços nem reinicializa o banco. Para incluir documentos, gere um dossiê ou execute a jornada comercial antes da captura.

As capturas foram inspecionadas em comparação com os protótipos de `design/`. São evidências representativas; não há comparação automática de pixels. Foram corrigidos cortes de valores BRL no funil, sobreposição das comodidades no tablet e feedback visual do checklist. As variações de estado da agenda e do fluxo comercial são verificadas pelas jornadas E2E.

`capture-account.mjs` complementa os módulos com login, cadastro, detalhe do lead, extração/revisão de preferências, tarefas, os dois perfis e operações. Também confirma o replay de um job sintético. As duas capturas somam **78 imagens** em 390/768/1440 px; `screenshots/evidence.json` e `screenshots/account-evidence.json` registram execução sem erros JavaScript ou overflow horizontal.

```sh
E2E_API_URL=http://127.0.0.1:3001/api E2E_WEB_URL=http://127.0.0.1:5174 node qa/capture-account.mjs
```

Os seis tipos de documento foram baixados com autenticação, renderizados e conferidos visualmente. Dossiê e relatório de visita têm uma página; minuta, aceite, recibo e relatório comercial têm duas. A validação confirma formato A4, conteúdo em todas as páginas, rodapé de demonstração e recusa de download sem sessão. Os PDFs, PNGs, textos extraídos e registros ficam em `pdfs/`.

Para reproduzir no macOS, com dados da jornada comercial no banco de demonstração:

```sh
E2E_API_URL=http://127.0.0.1:3001/api node ../backend/scripts/qa-documents.mjs
swift -module-cache-path /private/tmp/copilot-swift-cache qa/render-pdfs.swift qa/pdfs
```

O script de documentos recusa ambientes fora do modo de demonstração e cria apenas documentos demonstrativos ausentes. A renderização utiliza PDFKit/AppKit nativos do macOS.

As três jornadas de `e2e/agenda.spec.ts` usam dados próprios, cancelam visitas e reservas pendentes e excluem logicamente seus leads ao terminar. Seus resultados podem ser isolados dos outros testes:

```sh
E2E_API_URL=http://127.0.0.1:3000/api E2E_WEB_URL=http://127.0.0.1:5173 ./node_modules/.bin/playwright test e2e/agenda.spec.ts --output=qa/test-results/agenda
```
