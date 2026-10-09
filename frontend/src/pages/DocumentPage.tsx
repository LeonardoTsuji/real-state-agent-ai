import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/session';
import { date, datetime, money } from '../lib/format';
import {
  Badge,
  Button,
  ErrorPanel,
  Icon,
  Loading,
  PageHeader,
} from '../components/ui';
import './pages.css';
type Snapshot = {
  simulated: boolean;
  notice: string;
  issuedAt: string;
  broker: { name: string; email: string; creci?: string };
  lead?: { name: string; email?: string; phone?: string };
  property?: {
    title: string;
    priceCents: number;
    city: string;
    neighborhood: string;
    areaM2?: number;
    bedrooms: number;
    parkingSpaces: number;
    description?: string;
    media?:string[];
  };
  opportunity?: {
    id: string;
    title: string;
    estimatedValueCents: number;
    commissionBps: number;
    proposal?: {
      sellerName: string;
      paymentTerms: string;
      clauses?: string[];
      validUntil: string;
    };
    acceptance?: { acceptedAt: string };
  };
  installment?: { amountCents: number; paidAt: string; id: string };
  commissionCents?: number;
  visit?: {
    startAt: string;
    endAt: string;
    feedback?: { notes?: string; rating?: number };
  };
};
type Document = {
  id: string;
  title: string;
  kind: string;
  createdAt: string;
  snapshot: Snapshot;
};
const kindLabel: Record<string, string> = {
  DOSSIER: 'Dossiê exclusivo',
  REPORT: 'Relatório de acompanhamento',
  VISIT_REPORT: 'Relatório de visita',
  DRAFT: 'Minuta de proposta',
  ACCEPTANCE: 'Comprovante de aceite',
  RECEIPT: 'Recibo de honorários',
};
export default function DocumentPage() {
  const { id } = useParams();
  const [error, setError] = useState<unknown>();
  const [downloading, setDownloading] = useState(false);
  const doc = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.get<Document>(`/commercial/documents/${id}`),
  });
  async function download() {
    setDownloading(true);
    setError(undefined);
    try {
      const blob = await api.blob(`/commercial/documents/${id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `corretor-copilot-${id}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e);
    } finally {
      setDownloading(false);
    }
  }
  if (doc.isLoading) return <Loading />;
  if (doc.isError)
    return <ErrorPanel error={doc.error} onRetry={() => void doc.refetch()} />;
  const d = doc.data!;
  const s = d.snapshot;
  const o = s.opportunity;
  const p = s.property;
  const seller = o?.proposal?.sellerName || 'Vendedor não informado';
  return (
    <div className="page-stack">
      <div className="no-print">
        <PageHeader
          title={kindLabel[d.kind] || 'Documento'}
          subtitle="Registro da proposta, dos honorários e das partes envolvidas."
          actions={
            <>
              <Button variant="secondary" onClick={() => window.print()}>
                <Icon name="print" />
                Imprimir
              </Button>
              <Button disabled={downloading} onClick={() => void download()}>
                <Icon name="download" />
                {downloading ? 'Preparando...' : 'Baixar PDF'}
              </Button>
            </>
          }
        />
        {o && <Link to={`/negocios/${o.id}`}>← Voltar para o negócio</Link>}
        {error !== undefined && <ErrorPanel error={error} />}
      </div>
      <article className="document-sheet">
        <header>
          <div className="toolbar">
            <strong
              style={{ fontFamily: 'Manrope', fontSize: 22, color: '#004ac6' }}
            >
              Corretor Copilot
            </strong>
            <Badge>DEMONSTRAÇÃO</Badge>
          </div>
          <p className="muted">Inteligência imobiliária · {s.broker.name}</p>
          <small className="muted">
            {s.broker.creci
              ? `CRECI ${s.broker.creci}`
              : 'Registro profissional não informado'}{' '}
            · {s.broker.email}
          </small>
        </header>
        <h1>{kindLabel[d.kind] || d.title}</h1>
        <p className="muted" style={{ textAlign: 'center' }}>
          Documento {d.id.slice(0, 8).toUpperCase()} · Emitido em{' '}
          {datetime(s.issuedAt || d.createdAt)}
        </p>
        <div className="notice">
          {s.notice ||
            'Documento de demonstração. Assinaturas e liquidações simuladas.'}
        </div>
        {d.kind === 'RECEIPT' ? (
          <>
            <p style={{ lineHeight: 2, marginTop: 32 }}>
              Eu, <strong>{s.broker.name}</strong>, declaro para fins
              demonstrativos o recebimento simulado de{' '}
              <strong>{money(s.installment?.amountCents)}</strong>, referente
              aos honorários de intermediação imobiliária do negócio{' '}
              <strong>{o?.title}</strong>, envolvendo{' '}
              <strong>{s.lead?.name}</strong> e <strong>{seller}</strong>.
            </p>
            <p>
              <strong>Imóvel:</strong> {p?.title} · {p?.neighborhood}, {p?.city}
            </p>
            <p>
              <strong>Valor da negociação:</strong>{' '}
              {money(o?.estimatedValueCents)}
            </p>
            <p>
              <strong>Comissão acordada:</strong>{' '}
              {o ? o.commissionBps / 100 : '—'}% · {money(s.commissionCents)}
            </p>
            <p>
              <strong>Parcela liquidada:</strong>{' '}
              {money(s.installment?.amountCents)}
            </p>
            <p>
              <strong>Data do registro:</strong> {date(s.installment?.paidAt)}
            </p>
            <p className="muted">
              Este recibo documenta exclusivamente uma liquidação simulada.
              Tributos e retenções não foram apurados.
            </p>
          </>
        ) : (
          <>
            <h2>{p?.title || o?.title || d.title}</h2>
            {p && (
              <>
                <img
                  src={p.media?.[0]||'/assets/property-5.jpg'}
                  alt={`${p.title} · imagem demonstrativa`}
                  style={{
                    width: '100%',
                    height: 230,
                    objectFit: 'cover',
                    borderRadius: 8,
                  }}
                />
                <p>
                  <strong>Localização:</strong> {p.neighborhood}, {p.city}
                </p>
                <p>
                  <strong>Características:</strong> {p.areaM2 || '—'} m² ·{' '}
                  {p.bedrooms} dormitórios · {p.parkingSpaces} vagas
                </p>
                <p>
                  <strong>Preço anunciado:</strong> {money(p.priceCents)}
                </p>
                {d.kind === 'DOSSIER' && <p>{p.description}</p>}
              </>
            )}
            {s.lead && (
              <p>
                <strong>Cliente:</strong> {s.lead.name} ·{' '}
                {s.lead.email || s.lead.phone}
              </p>
            )}
            {o && (
              <>
                <p>
                  <strong>Valor negociado:</strong>{' '}
                  {money(o.estimatedValueCents)}
                </p>
                <p>
                  <strong>Honorários:</strong> {o.commissionBps / 100}% ·{' '}
                  {money(s.commissionCents)}
                </p>
                {o.proposal && (
                  <>
                    <p>
                      <strong>Vendedor:</strong> {seller}
                    </p>
                    <p>
                      <strong>Condições:</strong> {o.proposal.paymentTerms}
                    </p>
                    <p>
                      <strong>Validade da proposta:</strong>{' '}
                      {datetime(o.proposal.validUntil)}
                    </p>
                    {o.proposal.clauses?.map((clause, i) => (
                      <p key={i}>
                        {i + 1}. {clause}
                      </p>
                    ))}
                  </>
                )}
                {d.kind === 'ACCEPTANCE' && (
                  <p className="toast">
                    Aceite e assinaturas simulados registrados em{' '}
                    {datetime(o.acceptance?.acceptedAt)}.
                  </p>
                )}
              </>
            )}
            {s.visit && (
              <>
                <p>
                  <strong>Visita:</strong> {datetime(s.visit.startAt)} a{' '}
                  {datetime(s.visit.endAt)}
                </p>
                <p>
                  <strong>Feedback:</strong>{' '}
                  {s.visit.feedback?.notes || 'Não registrado'}
                </p>
                <p>
                  <strong>Avaliação:</strong> {s.visit.feedback?.rating || '—'}{' '}
                  / 5
                </p>
              </>
            )}
          </>
        )}
        <div className="signature">
          <strong>{s.broker.name}</strong>
          <p className="muted">
            {s.broker.creci
              ? `CRECI ${s.broker.creci}`
              : 'Corretor responsável'}{' '}
            · assinatura demonstrativa
          </p>
        </div>
        <footer style={{ marginTop: 44, fontSize: 11, color: '#737686' }}>
          Documento interno. Mídia ilustrativa. Sem certificação digital ou
          comprovação de pagamento real.
        </footer>
      </article>
    </div>
  );
}
