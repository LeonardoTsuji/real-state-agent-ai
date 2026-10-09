import { writeFile, mkdir } from 'node:fs/promises';
const response = await fetch(
  `${process.env.API_BASE_URL ?? 'http://127.0.0.1:3000'}/api/docs-json`,
);
if (!response.ok)
  throw new Error('Inicie a API em desenvolvimento antes de gerar os tipos.');
const document = await response.json();
await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../docs/openapi.json', import.meta.url),
  JSON.stringify(document, null, 2) + '\n',
);
console.log('Contrato OpenAPI exportado para docs/openapi.json.');
