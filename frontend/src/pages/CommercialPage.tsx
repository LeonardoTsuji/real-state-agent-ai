import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/session';
import { money, parseMoney, datetime, toUTC, stageLabel } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  ErrorPanel,
  Field,
  Icon,
  Loading,
  Modal,
  PageHeader,
} from '../components/ui';
import './pages.css';
type Proposal = {
  valueCents: number;
  validUntil: string;
  paymentTerms: string;
  sellerName: string;
  clauses?: string[];
};
type Opportunity = {
  id: string;
  title: string;
  leadId: string;
  propertyId?: string;
  alternativePropertyId?: string;
  estimatedValueCents: number;
  commissionBps: number;
  stage: string;
  proposal?: Proposal;
  acceptance?: { acceptedAt?: string; simulated?: boolean };
};
type Property = {
  id: string;
  title: string;
  priceCents: number;
  areaM2?: number;
  bedrooms: number;
  parkingSpaces: number;
  neighborhood: string;
  media?: string[];
};
type Installment = {
  id: string;
  amountCents: number;
  dueAt?: string;
  status: string;
  paidAt?: string;
  number?: number;
};
export default function CommercialPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [modal, setModal] = useState<
    'proposal' | 'accept' | 'pay' | 'edit' | null
  >(null);
  const [payment, setPayment] = useState<Installment | null>(null);
  const [formError, setFormError] = useState<unknown>();
  const [notice, setNotice] = useState('');
  const commandKeys = useRef(new Map<string, string>());
  const deal = useQuery({
    queryKey: ['opportunity', id],
    queryFn: () => api.get<Opportunity>(`/commercial/opportunities/${id}`),
  });
  const primary = useQuery({
    queryKey: ['property', deal.data?.propertyId],
    queryFn: () => api.get<Property>(`/properties/${deal.data?.propertyId}`),
    enabled: !!deal.data?.propertyId,
  });
  const alternative = useQuery({
    queryKey: ['property', deal.data?.alternativePropertyId],
    queryFn: () =>
      api.get<Property>(`/properties/${deal.data?.alternativePropertyId}`),
    enabled: !!deal.data?.alternativePropertyId,
  });
  const installments = useQuery({
    queryKey: ['installments', id],
    queryFn: () =>
      api.get<Installment[]>(`/commercial/opportunities/${id}/installments`),
  });
  const properties = useQuery({
    queryKey: ['properties', 'opportunity-edit'],
    queryFn: () => api.get<{ items: Property[] }>('/properties?limit=100'),
    enabled: modal === 'edit',
  });
  const modify = useMutation({
    mutationFn: (body: unknown) =>
      api.patch(`/commercial/opportunities/${id}`, body),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ['opportunity', id] });
      void client.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => {
      const signature = JSON.stringify({ path, body });
      if (!commandKeys.current.has(signature))
        commandKeys.current.set(signature, crypto.randomUUID());
      return api.post(path, body, commandKeys.current.get(signature));
    },
    onSuccess: () => {
      setModal(null);
      commandKeys.current.clear();
      setNotice('Operação registrada.');
      void client.invalidateQueries({ queryKey: ['opportunity', id] });
      void client.invalidateQueries({ queryKey: ['installments', id] });
      void client.invalidateQueries({ queryKey: ['pipeline'] });
    },
  });
  const document = useMutation({
    mutationFn: ({
      kind,
      installmentId,
    }: {
      kind: string;
      installmentId?: string;
    }) =>
      api.post<{ id: string }>('/commercial/documents', {
        opportunityId: id,
        kind,
        title: `${kind === 'RECEIPT' ? 'Recibo de honorários' : kind === 'ACCEPTANCE' ? 'Comprovante de aceite' : 'Minuta de proposta'} · ${deal.data?.title}`,
        installmentId,
      }),
    onSuccess: (d) => navigate(`/documentos/${d.id}`),
  });
  if (deal.isLoading) return <Loading />;
  if (deal.isError)
    return (
      <ErrorPanel error={deal.error} onRetry={() => void deal.refetch()} />
    );
  const d = deal.data!;
  const commission = Math.round(
    (d.estimatedValueCents * d.commissionBps) / 10000,
  );
  const paid = (installments.data || [])
    .filter((i) => i.status === 'PAID')
    .reduce((s, i) => s + i.amountCents, 0);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setFormError(undefined);
      const valueCents = parseMoney(String(f.get('value')));
      if (modal === 'edit') {
        modify.mutate({
          title: f.get('title'),
          propertyId: f.get('propertyId') || null,
          alternativePropertyId: f.get('alternativePropertyId') || null,
          estimatedValueCents: valueCents,
          commissionBps: Math.round(Number(f.get('commission')) * 100),
        });
        return;
      }
      const honor = Math.round((valueCents * d.commissionBps) / 10000);
      const count = Number(f.get('installmentCount'));
      const amount = Math.floor(honor / count);
      if (honor > 0 && honor < count)
        throw new Error(
          'A comissão deve permitir ao menos um centavo por parcela.',
        );
      action.mutate({
        path: `/commercial/opportunities/${id}/proposal`,
        body: {
          valueCents,
          validUntil: toUTC(String(f.get('validUntil'))),
          paymentTerms: f.get('paymentTerms'),
          sellerName: f.get('sellerName'),
          clauses: String(f.get('clauses')).split('\n').filter(Boolean),
          installments:
            honor === 0
              ? undefined
              : Array.from({ length: count }, (_, i) => ({
                  amountCents:
                    amount + (i === count - 1 ? honor - amount * count : 0),
                })),
        },
      });
    } catch (err) {
      setFormError(err);
    }
  }
  function propertyPanel(p: Property | undefined, isMain: boolean) {
    return (
      <Card>
        <Badge tone={isMain ? 'primary' : 'neutral'}>
          {isMain ? '★ Escolha principal' : 'Alternativa de contingência'}
        </Badge>
        {p ? (
          <>
            <img
              src={
                p.media?.[0] ||
                (isMain ? '/assets/property-5.jpg' : '/assets/property-1.jpg')
              }
              alt={p.title}
              style={{
                width: '100%',
                height: 230,
                objectFit: 'cover',
                borderRadius: 12,
                marginTop: 18,
              }}
            />
            <h2>{p.title}</h2>
            <p className="muted">
              {p.neighborhood} · {p.areaM2 || '—'} m² · {p.bedrooms} dormitórios
              · {p.parkingSpaces} vagas
            </p>
            <p>
              Anunciado: <strong>{money(p.priceCents)}</strong>
            </p>
            {isMain && (
              <p>
                Proposta: <strong>{money(d.estimatedValueCents)}</strong> (
                {((1 - d.estimatedValueCents / p.priceCents) * 100).toFixed(1)}%
                de desconto)
              </p>
            )}
            <Link to={`/imoveis/${p.id}`}>Abrir dossiê →</Link>
          </>
        ) : (
          <p className="muted">Nenhum imóvel associado.</p>
        )}
      </Card>
    );
  }
  return (
    <div className="page-stack">
      <Link to="/funil">← Voltar ao funil</Link>
      <PageHeader
        title={
          d.stage === 'WON'
            ? 'Aceite e comissão confirmada'
            : 'Fechamento e proposta'
        }
        subtitle={d.title}
        actions={
          <>
            <Badge>{stageLabel(d.stage)}</Badge>
            <Button
              variant="secondary"
              disabled={!!d.proposal || d.stage === 'WON'}
              onClick={() => setModal('edit')}
            >
              Editar oportunidade
            </Button>
          </>
        }
      />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <div className="copilot-banner">
        <Icon name="auto_awesome" />
        <div>
          <strong>
            {d.stage === 'WON'
              ? 'Negócio concluído · Próximos passos'
              : 'Prepare uma decisão com confiança'}
          </strong>
          <p>
            {d.stage === 'WON'
              ? 'Aceite registrado em ambiente demonstrativo. Acompanhe honorários e gere os comprovantes.'
              : 'Compare os imóveis e formalize as condições após revisar o interesse do cliente.'}
          </p>
        </div>
        <Badge>Assinatura e pagamentos simulados</Badge>
      </div>
      <div className="grid-2">
        {propertyPanel(primary.data, true)}
        {propertyPanel(alternative.data, false)}
      </div>
      {(primary.isError || alternative.isError) && (
        <ErrorPanel error={primary.error || alternative.error} />
      )}
      <div className="dossier-layout">
        <div className="page-stack">
          <Card>
            <h2>Condições da negociação</h2>
            <p>
              Valor negociado <strong>{money(d.estimatedValueCents)}</strong>
            </p>
            <p>
              Comissão acordada{' '}
              <strong>
                {d.commissionBps / 100}% · {money(commission)}
              </strong>
            </p>
            {d.proposal ? (
              <>
                <p>
                  Vendedor <strong>{d.proposal.sellerName}</strong>
                </p>
                <p>
                  Validade <strong>{datetime(d.proposal.validUntil)}</strong>
                </p>
                <p>{d.proposal.paymentTerms}</p>
                {d.proposal.clauses?.map((c) => (
                  <p key={c}>
                    <Icon name="check_circle" />
                    {c}
                  </p>
                ))}
              </>
            ) : (
              <p className="muted">
                Nenhuma proposta formalizada. O lead precisa estar qualificado
                para avançar.
              </p>
            )}
            <div className="actions">
              <Button
                disabled={d.stage === 'WON' || !d.propertyId}
                onClick={() => setModal('proposal')}
              >
                {d.proposal ? 'Registrar contraproposta' : 'Preparar proposta'}
              </Button>
              {d.proposal && (
                <Button
                  variant="secondary"
                  disabled={document.isPending}
                  onClick={() => document.mutate({ kind: 'DRAFT' })}
                >
                  Gerar minuta PDF
                </Button>
              )}
            </div>
          </Card>
          <Card>
            <h2>Honorários e pagamentos</h2>
            <div className="metric-grid">
              <div>
                <small className="muted">Total acordado</small>
                <div className="property-price">{money(commission)}</div>
              </div>
              <div>
                <small className="muted">Liquidado</small>
                <div className="property-price">{money(paid)}</div>
              </div>
            </div>
            {installments.isLoading ? (
              <Loading />
            ) : installments.isError ? (
              <ErrorPanel error={installments.error} />
            ) : !installments.data?.length ? (
              <p className="muted">Parcelas serão criadas após o aceite.</p>
            ) : (
              installments.data.map((i, index) => (
                <div className="task-row" key={i.id}>
                  <div>
                    <strong>
                      Parcela {index + 1} · {money(i.amountCents)}
                    </strong>
                    <p className="muted">
                      {i.dueAt ? datetime(i.dueAt) : 'Vencimento a combinar'}
                    </p>
                    <Badge tone={i.status === 'PAID' ? 'success' : 'warning'}>
                      {stageLabel(i.status)}
                    </Badge>
                  </div>
                  {i.status === 'PAID' ? (
                    <Button
                      variant="secondary"
                      disabled={document.isPending}
                      onClick={() =>
                        document.mutate({
                          kind: 'RECEIPT',
                          installmentId: i.id,
                        })
                      }
                    >
                      <Icon name="receipt_long" />
                      Recibo
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPayment(i);
                        setModal('pay');
                      }}
                    >
                      Simular liquidação
                    </Button>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
        <div className="page-stack">
          <Card>
            <h2>
              {d.stage === 'WON' ? 'Comprovante de aceite' : 'Formalização'}
            </h2>
            <p className="muted">
              Leia e confirme as condições. A simulação registra um evento de
              aceite para esta oportunidade.
            </p>
            {d.stage === 'WON' ? (
              <>
                <Badge tone="success">Aceite registrado · simulado</Badge>
                <p>{datetime(d.acceptance?.acceptedAt)}</p>
                <Button
                  variant="secondary"
                  disabled={document.isPending}
                  onClick={() => document.mutate({ kind: 'ACCEPTANCE' })}
                >
                  Gerar comprovante
                </Button>
              </>
            ) : (
              <Button
                disabled={!d.proposal || action.isPending}
                onClick={() => setModal('accept')}
              >
                Confirmar aceite simulado
              </Button>
            )}
            <p className="notice">
              Sem assinatura certificada ou transferência financeira real.
            </p>
          </Card>
          <Card>
            <h2>Documentos da negociação</h2>
            <p className="muted">
              Consulte e compartilhe os registros da negociação.
            </p>
            <Button
              variant="secondary"
              disabled={document.isPending}
              onClick={() => document.mutate({ kind: 'REPORT' })}
            >
              Gerar relatório
            </Button>
            <Link to={`/leads/${d.leadId}`}>
              <Button variant="secondary">Ver histórico do lead</Button>
            </Link>
          </Card>
        </div>
      </div>
      {action.isError && <ErrorPanel error={action.error} />}{' '}
      {document.isError && <ErrorPanel error={document.error} />}
      {modal === 'edit' && (
        <Modal title="Editar oportunidade" onClose={() => setModal(null)}>
          <form className="page-stack" onSubmit={submit}>
            <Field label="Título">
              <input
                className="input"
                name="title"
                required
                defaultValue={d.title}
              />
            </Field>
            <Field label="Imóvel principal">
              <select
                className="input"
                name="propertyId"
                defaultValue={d.propertyId || ''}
              >
                <option value="">Selecionar depois</option>
                {properties.data?.items.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Alternativa">
              <select
                className="input"
                name="alternativePropertyId"
                defaultValue={d.alternativePropertyId || ''}
              >
                <option value="">Sem alternativa</option>
                {properties.data?.items.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor estimado em R$">
              <input
                className="input"
                name="value"
                required
                defaultValue={(d.estimatedValueCents / 100)
                  .toFixed(2)
                  .replace('.', ',')}
              />
            </Field>
            <Field label="Comissão (%)">
              <input
                className="input"
                name="commission"
                type="number"
                min={0}
                max={100}
                step="0.01"
                defaultValue={d.commissionBps / 100}
              />
            </Field>
            {(modify.isError || formError !== undefined) && (
              <ErrorPanel error={formError || modify.error} />
            )}
            <Button type="submit" disabled={modify.isPending}>
              Salvar oportunidade
            </Button>
          </form>
        </Modal>
      )}
      {modal === 'proposal' && (
        <Modal
          title={d.proposal ? 'Registrar contraproposta' : 'Preparar proposta'}
          onClose={() => setModal(null)}
        >
          <form className="page-stack" onSubmit={submit}>
            <Field label="Valor proposto em R$">
              <input
                name="value"
                className="input"
                required
                defaultValue={(d.estimatedValueCents / 100)
                  .toFixed(2)
                  .replace('.', ',')}
              />
            </Field>
            <Field label="Vendedor">
              <input
                name="sellerName"
                className="input"
                required
                defaultValue={d.proposal?.sellerName}
              />
            </Field>
            <Field label="Validade (São Paulo)">
              <input
                name="validUntil"
                className="input"
                type="datetime-local"
                required
              />
            </Field>
            <Field label="Condições de pagamento">
              <textarea
                name="paymentTerms"
                className="input"
                required
                rows={3}
                defaultValue={d.proposal?.paymentTerms}
              />
            </Field>
            <Field label="Cláusulas (uma por linha)">
              <textarea
                name="clauses"
                className="input"
                rows={3}
                defaultValue={d.proposal?.clauses?.join('\n')}
              />
            </Field>
            <Field label="Parcelas dos honorários">
              <select name="installmentCount" className="input">
                <option value="1">1 parcela</option>
                <option value="2">2 parcelas iguais</option>
                <option value="3">3 parcelas iguais</option>
              </select>
            </Field>
            <div className="notice">
              As parcelas correspondem à comissão. O valor da venda fica
              descrito nas condições de pagamento.
            </div>
            {(formError !== undefined || action.isError) && (
              <ErrorPanel error={formError || action.error} />
            )}
            <Button type="submit" disabled={action.isPending}>
              Confirmar proposta
            </Button>
          </form>
        </Modal>
      )}
      {modal === 'accept' && (
        <Modal
          title="Confirmar aceite da proposta"
          onClose={() => setModal(null)}
        >
          <div className="page-stack">
            <p>
              Confirme o aceite simulado de{' '}
              <strong>{money(d.estimatedValueCents)}</strong> e a comissão de{' '}
              <strong>{money(commission)}</strong>.
            </p>
            <p className="notice">
              O negócio será marcado como ganho e as parcelas serão registradas.
              Esta ação é uma simulação.
            </p>
            {action.isError && <ErrorPanel error={action.error} />}
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: `/commercial/opportunities/${id}/accept`,
                  body: { confirmed: true, simulated: true },
                })
              }
            >
              Confirmar aceite simulado
            </Button>
          </div>
        </Modal>
      )}
      {modal === 'pay' && payment && (
        <Modal
          title="Simular liquidação de honorários"
          onClose={() => setModal(null)}
        >
          <div className="page-stack">
            <p>
              Registrar liquidação demonstrativa de{' '}
              <strong>{money(payment.amountCents)}</strong>?
            </p>
            <p className="notice">
              Nenhuma cobrança ou transferência real será realizada.
            </p>
            {action.isError && <ErrorPanel error={action.error} />}
            <Button
              disabled={action.isPending}
              onClick={() =>
                action.mutate({
                  path: `/commercial/installments/${payment.id}/pay`,
                  body: { simulated: true },
                })
              }
            >
              Confirmar liquidação simulada
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
