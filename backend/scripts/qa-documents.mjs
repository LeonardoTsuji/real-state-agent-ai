import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000/api';
const directory = new URL('../../frontend/qa/pdfs/', import.meta.url);
await mkdir(directory, { recursive: true });
async function call(path, body, auth) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
}
const { accessToken } = await call('/auth/login', {
  email: 'marina@copilot.demo',
  password: 'DemoCopilot2026!',
});
const identity = await call('/auth/me', undefined, accessToken);
if (!identity.demoMode)
  throw new Error('PDF QA requires the dedicated demonstration server.');
let { items } = await call(
  '/commercial/documents?limit=100',
  undefined,
  accessToken,
);
const properties = await call('/properties?limit=100', undefined, accessToken);
const property =
  properties.items.find((item) => /moema/i.test(item.title)) ??
  properties.items[0];
if (!items.some((item) => item.kind === 'DOSSIER'))
  items.push(
    await call(
      '/commercial/documents',
      {
        propertyId: property.id,
        kind: 'DOSSIER',
        title: `Dossiê exclusivo · ${property.title}`,
      },
      accessToken,
    ),
  );
let acceptance = items.find((item) => item.kind === 'ACCEPTANCE');
if (!acceptance) {
  const receipt = items.find((item) => item.kind === 'RECEIPT');
  if (receipt) {
    acceptance = await call(
      '/commercial/documents',
      {
        opportunityId: receipt.opportunityId,
        kind: 'ACCEPTANCE',
        title: 'Comprovante de aceite e comissão',
      },
      accessToken,
    );
    items.push(acceptance);
  }
}
if (acceptance && !items.some((item) => item.kind === 'DRAFT')) {
  items.push(
    await call(
      '/commercial/documents',
      {
        opportunityId: acceptance.opportunityId,
        kind: 'DRAFT',
        title: 'Minuta da proposta comercial',
      },
      accessToken,
    ),
  );
}
if (acceptance && !items.some((item) => item.kind === 'REPORT'))
  items.push(
    await call(
      '/commercial/documents',
      {
        opportunityId: acceptance.opportunityId,
        kind: 'REPORT',
        title: 'Relatório de acompanhamento comercial',
      },
      accessToken,
    ),
  );
const visits = await call('/visits?limit=100', undefined, accessToken);
const completed = visits.items.find((visit) => visit.status === 'COMPLETED');
if (completed && !items.some((item) => item.kind === 'VISIT_REPORT'))
  items.push(
    await call(
      '/commercial/documents',
      {
        visitId: completed.id,
        kind: 'VISIT_REPORT',
        title: 'Relatório de visita e feedback',
      },
      accessToken,
    ),
  );
const report = [];
for (const kind of [
  'DOSSIER',
  'DRAFT',
  'ACCEPTANCE',
  'RECEIPT',
  'REPORT',
  'VISIT_REPORT',
]) {
  const document = items.find((item) => item.kind === kind);
  if (!document)
    throw new Error(
      `Missing ${kind}: complete the UI commercial journey before PDF QA.`,
    );
  const response = await fetch(
    `${base}/commercial/documents/${document.id}/pdf`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/pdf')
  )
    throw new Error(`${kind} PDF response invalid.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new Error(`${kind}: invalid PDF header.`);
  const unauthenticated = await fetch(
    `${base}/commercial/documents/${document.id}/pdf`,
  );
  if (unauthenticated.status !== 401)
    throw new Error(`${kind}: PDF must require authentication.`);
  await writeFile(new URL(`${kind.toLowerCase()}.pdf`, directory), bytes);
  report.push({
    kind,
    id: document.id,
    bytes: bytes.length,
    authenticated: true,
  });
}
await writeFile(
  new URL('evidence.json', directory),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
