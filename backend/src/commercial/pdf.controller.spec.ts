import { PassThrough } from 'node:stream';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/authenticated-request.js';
import type { CommercialService } from './commercial.service.js';
import { PdfController } from './pdf.controller.js';
const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest })
  .jest;

describe('authenticated document PDF', () => {
  it('keeps the footer on the content page and reads the owned immutable snapshot', async () => {
    const document = jest.fn().mockResolvedValue({
      id: 'document-id',
      kind: 'DOSSIER',
      title: 'Dossiê exclusivo',
      createdAt: new Date(),
      snapshot: {
        broker: {
          name: 'Marina Costa',
          email: 'marina@copilot.demo',
          creci: '248.910-F',
        },
        property: {
          title: 'Moema',
          city: 'São Paulo',
          neighborhood: 'Moema',
          priceCents: 145000000,
          areaM2: 142,
          bedrooms: 3,
          parkingSpaces: 2,
        },
      },
    });
    const controller = new PdfController({
      document,
    } as unknown as CommercialService);
    const response = new PassThrough();
    const setHeader = jest.fn();
    Object.assign(response, { setHeader });
    const chunks: Buffer[] = [];
    response.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<void>((resolve, reject) => {
      response.on('end', resolve);
      response.on('error', reject);
    });
    await controller.download(
      { user: { id: 'broker-id' } } as AuthenticatedRequest,
      'document-id',
      response as unknown as Response,
    );
    await finished;
    const pdf = Buffer.concat(chunks).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(document).toHaveBeenCalledWith('broker-id', 'document-id');
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });
});
