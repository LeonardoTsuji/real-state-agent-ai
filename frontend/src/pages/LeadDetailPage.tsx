import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../lib/session';
import type {
  Lead,
  Preference,
  Match,
  Interaction,
  Task,
  CursorPage,
  Conversation,
  Message,
  Proposal,
} from '../lib/types';
import {
  money,
  datetime,
  initials,
  stageLabel,
  parseMoney,
  localInput,
  toUTC,
} from '../lib/format';
import {
  Button,
  Card,
  Field,
  Icon,
  Badge,
  Modal,
  Loading,
  ErrorPanel,
  Empty,
  Simulation,
} from '../components/ui';
const transitions: Record<string, string[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT_SCHEDULED', 'NEGOTIATION', 'LOST'],
  VISIT_SCHEDULED: ['QUALIFIED', 'NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],
  LOST: ['CONTACTED'],
};
const tabs = [
  'Dados',
  'Preferências',
  'Interações',
  'Imóveis Associados',
  'Assistente IA',
];
export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(4);
  const [edit, setEdit] = useState(false);
  const [remove, setRemove] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<unknown>(null);
  const qc = useQueryClient();
  const lead = useQuery({
    queryKey: ['leads', id],
    queryFn: ({ signal }) => api.get<Lead>(`/leads/${id}`, signal),
  });
  const preference = useQuery({
    queryKey: ['preferences', id],
    queryFn: ({ signal }) =>
      api.get<Preference | null>(`/leads/${id}/preferences`, signal),
  });
  const matches = useQuery({
    queryKey: ['matches', id],
    queryFn: ({ signal }) =>
      api.get<CursorPage<Match>>(`/leads/${id}/matches`, signal),
  });
  const tasks = useQuery({
    queryKey: ['tasks', id],
    queryFn: ({ signal }) =>
      api.get<CursorPage<Task>>(`/tasks?leadId=${id}&status=PENDING`, signal),
  });
  const change = useMutation({
    mutationFn: () => api.patch(`/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      setStage('');
      setError(null);
    },
    onError: setError,
  });
  const deletion = useMutation({
    mutationFn: () => api.delete(`/leads/${id}`),
    onSuccess: () => navigate('/leads'),
    onError: setError,
  });
  if (lead.isPending) return <Loading />;
  if (lead.error)
    return (
      <ErrorPanel error={lead.error} onRetry={() => void lead.refetch()} />
    );
  const l = lead.data!;
  const pref = preference.data;
  return (
    <div className="page-stack">
      <Link className="small" to="/leads">
        ← Voltar para Leads
      </Link>
      <Card>
        <div className="detail-summary">
          <span className="avatar large">{initials(l.name)}</span>
          <div>
            <div className="status-line">
              <h1>{l.name}</h1>
              <Badge tone={l.stage}>{stageLabel(l.stage)}</Badge>
            </div>
            <div className="detail-contact">
              {l.email && (
                <span>
                  <Icon name="mail" size={14} />
                  {l.email}
                </span>
              )}
              {l.phone && (
                <span>
                  <Icon name="phone" size={14} />
                  {l.phone}
                </span>
              )}
              <Simulation />
            </div>
          </div>
          <div className="actions" style={{ marginLeft: 'auto' }}>
            <Button variant="secondary" onClick={() => setEdit(true)}>
              <Icon name="edit" />
              Editar dados
            </Button>
            <Button variant="danger" onClick={() => setRemove(true)}>
              <Icon name="delete" />
              Excluir lead
            </Button>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 24 }}>
          <Field label="Estágio do funil">
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">{stageLabel(l.stage)}</option>
              {transitions[l.stage]?.map((s) => (
                <option key={s} value={s}>
                  {stageLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          <Button
            variant="secondary"
            disabled={!stage || change.isPending}
            onClick={() => change.mutate()}
          >
            <Icon name="sync" />
            Atualizar estágio
          </Button>
        </div>
      </Card>
      {error != null && <ErrorPanel error={error} />}
      <div className="detail-tabs">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={tab === i ? 'active' : ''}
            onClick={() => setTab(i)}
          >
            {i + 1}. {t}
            {i === 3 && matches.data ? ` (${matches.data.items.length})` : ''}
            {i === 4 ? ' ✨' : ''}
          </button>
        ))}
      </div>
      <div className="detail-layout">
        <div>
          {tab === 0 && (
            <Card>
              <h2>Dados do lead</h2>
              <dl className="definition-list" style={{ marginTop: 20 }}>
                <div>
                  <dt>Nome completo</dt>
                  <dd>{l.name}</dd>
                </div>
                <div>
                  <dt>Origem</dt>
                  <dd>{l.source ?? 'Cadastro manual'}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{l.email ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{l.phone ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Perfil</dt>
                  <dd>{l.profile ?? 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Cadastrado em</dt>
                  <dd>{datetime(l.createdAt)}</dd>
                </div>
              </dl>
              <div className="divider" />
              <h3>Observações</h3>
              <p
                className="small muted"
                style={{ marginTop: 12, whiteSpace: 'pre-wrap' }}
              >
                {l.notes ?? 'Sem observações.'}
              </p>
            </Card>
          )}
          {tab === 1 && (
            <PreferencesPanel
              key={id}
              id={id!}
              preference={pref ?? null}
              loading={preference.isPending}
              error={preference.error}
            />
          )}
          {tab === 2 && <InteractionsPanel key={id} id={id!} />}
          {tab === 3 && <MatchesPanel key={id} id={id!} />}
          {tab === 4 && (
            <AssistantPanel
              key={id}
              id={id!}
              onExtractApplied={() => {
                void qc.invalidateQueries({ queryKey: ['preferences', id] });
                setTab(1);
              }}
            />
          )}
        </div>
        <aside className="stack">
          <Card>
            <div className="section-title">
              <h3>
                <Icon name="tune" /> Preferências cadastradas
              </h3>
              <button
                className="icon-button"
                aria-label="Editar preferências"
                onClick={() => setTab(1)}
              >
                <Icon name="edit" size={14} />
              </button>
            </div>
            {preference.isPending ? (
              <Loading />
            ) : preference.error ? (
              <ErrorPanel error={preference.error} />
            ) : pref ? (
              <dl className="definition-list">
                <div>
                  <dt>Objetivo</dt>
                  <dd>
                    {pref.purposes.map(stageLabel).join(', ') ||
                      'Não informado'}
                  </dd>
                </div>
                <div>
                  <dt>Tipologia</dt>
                  <dd>
                    {pref.types.map(stageLabel).join(', ') || 'Não informado'}
                  </dd>
                </div>
                <div className="full-width">
                  <dt>Orçamento máximo</dt>
                  <dd>{money(pref.maxPriceCents)}</dd>
                </div>
                <div>
                  <dt>Bairros</dt>
                  <dd>{pref.neighborhoods.join(', ') || 'Não informado'}</dd>
                </div>
                <div>
                  <dt>Configuração</dt>
                  <dd>
                    {pref.minBedrooms ?? '—'} qts ·{' '}
                    {pref.minParkingSpaces ?? '—'} vagas
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="small muted">Ainda sem preferências.</p>
            )}
            <Link to={`/imoveis?leadId=${id}`}>
              <Button
                variant="copilot"
                style={{ width: '100%', marginTop: 18 }}
              >
                <Icon name="search" />
                Buscar imóveis compatíveis
              </Button>
            </Link>
          </Card>
          <Card>
            <div className="section-title">
              <h3>Imóveis associados</h3>
              <Badge tone="primary">{matches.data?.items.length ?? '—'}</Badge>
            </div>
            {matches.data?.items.slice(0, 2).map((m) => (
              <div key={m.id} style={{ marginBottom: 16 }}>
                <Badge tone={m.status}>
                  {stageLabel(m.status)} · Afinidade {m.score}%
                </Badge>
                <h4 style={{ margin: '10px 0 4px' }}>{m.property?.title}</h4>
                <p className="currency" style={{ fontSize: 20 }}>
                  {money(m.property?.priceCents)}
                </p>
                <Link
                  className="small"
                  to={`/imoveis/${m.propertyId}?leadId=${id}`}
                >
                  Ver detalhes do imóvel →
                </Link>
              </div>
            ))}
            {!matches.data?.items.length && (
              <p className="small muted">
                Associe um imóvel para acompanhar o interesse.
              </p>
            )}
          </Card>
          <Card>
            <div className="section-title">
              <h3>Próxima tarefa</h3>
              <Icon name="task_alt" />
            </div>
            {tasks.data?.items[0] ? (
              <>
                <strong className="small">{tasks.data.items[0].title}</strong>
                <p className="small muted" style={{ marginTop: 8 }}>
                  Vence {datetime(tasks.data.items[0].dueAt)}
                </p>
              </>
            ) : (
              <p className="small muted">Nenhuma tarefa pendente.</p>
            )}
            <Link to={`/tarefas?leadId=${id}`}>
              <Button
                variant="secondary"
                style={{ width: '100%', marginTop: 16 }}
              >
                <Icon name="add" />
                Criar tarefa para {l.name.split(' ')[0]}
              </Button>
            </Link>
          </Card>
        </aside>
      </div>
      {edit && <EditLead lead={l} onClose={() => setEdit(false)} />}
      {remove && (
        <Modal
          title="Excluir lead da carteira?"
          onClose={() => setRemove(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemove(false)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={deletion.isPending}
                onClick={() => deletion.mutate()}
              >
                Confirmar exclusão
              </Button>
            </>
          }
        >
          <p>
            O lead <strong>{l.name}</strong> será removido da carteira ativa. O
            histórico será preservado pela exclusão lógica.
          </p>
          {deletion.error != null && <ErrorPanel error={deletion.error} />}
        </Modal>
      )}
    </div>
  );
}
function EditLead({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { register, handleSubmit } = useForm({
    defaultValues: {
      name: lead.name,
      email: lead.email ?? '',
      phone: lead.phone ?? '',
      notes: lead.notes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: (data: Record<string, string>) => {
      if (!data.email && !data.phone)
        throw new Error('Informe pelo menos um contato.');
      const payload: Record<string, string | null> = {};
      for (const [field, value] of Object.entries(data)) {
        const normalized = value || null;
        if (normalized !== (lead as any)[field]) payload[field] = normalized;
      }
      return api.patch(`/leads/${lead.id}`, payload);
    },
    onSuccess: onClose,
  });
  return (
    <Modal title="Editar dados do lead" onClose={onClose}>
      <form
        className="form-grid"
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
      >
        <Field label="Nome completo">
          <input {...register('name', { required: true, maxLength: 120 })} />
        </Field>
        <Field label="E-mail">
          <input type="email" {...register('email')} />
        </Field>
        <Field label="Telefone com DDD">
          <input {...register('phone')} placeholder="11987654321" />
        </Field>
        <div className="full-width">
          <Field label="Observações">
            <textarea {...register('notes')} maxLength={2000} />
          </Field>
        </div>
        {mutation.error != null && (
          <div className="full-width">
            <ErrorPanel error={mutation.error} />
          </div>
        )}
        <div className="actions full-width">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            Salvar alterações
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function PreferencesPanel({
  id,
  preference,
  loading,
  error,
}: {
  id: string;
  preference: Preference | null;
  loading: boolean;
  error: unknown;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorPanel error={error} />;
  return (
    <PreferenceForm
      key={JSON.stringify(preference)}
      id={id}
      preference={preference}
    />
  );
}
function PreferenceForm({
  id,
  preference,
}: {
  id: string;
  preference: Preference | null;
}) {
  const [success, setSuccess] = useState(false);
  const { register, handleSubmit } = useForm({
    defaultValues: {
      purposes: preference?.purposes ?? [],
      types: preference?.types ?? [],
      neighborhoods: preference?.neighborhoods.join(', ') ?? '',
      minPrice:
        preference?.minPriceCents == null
          ? ''
          : String(preference.minPriceCents / 100),
      maxPrice:
        preference?.maxPriceCents == null
          ? ''
          : String(preference.maxPriceCents / 100),
      minBedrooms:
        preference?.minBedrooms == null ? '' : String(preference.minBedrooms),
      maxBedrooms:
        preference?.maxBedrooms == null ? '' : String(preference.maxBedrooms),
      minParkingSpaces:
        preference?.minParkingSpaces == null
          ? ''
          : String(preference.minParkingSpaces),
      maxParkingSpaces:
        preference?.maxParkingSpaces == null
          ? ''
          : String(preference.maxParkingSpaces),
      notes: preference?.notes ?? '',
    },
  });
  const mutation = useMutation({
    mutationFn: async (d: any) => {
      const next: any = {
        purposes: d.purposes,
        types: d.types,
        neighborhoods: d.neighborhoods
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean),
        notes: d.notes || null,
        minPriceCents: d.minPrice ? parseMoney(d.minPrice) : null,
        maxPriceCents: d.maxPrice ? parseMoney(d.maxPrice) : null,
      };
      for (const k of [
        'minBedrooms',
        'maxBedrooms',
        'minParkingSpaces',
        'maxParkingSpaces',
      ])
        next[k] = d[k] === '' ? null : Number(d[k]);
      for (const [a, b] of [
        ['minPriceCents', 'maxPriceCents'],
        ['minBedrooms', 'maxBedrooms'],
        ['minParkingSpaces', 'maxParkingSpaces'],
      ])
        if (next[a] != null && next[b] != null && next[a] > next[b])
          throw new Error('O mínimo não pode exceder o máximo.');
      return api.patch(`/leads/${id}/preferences`, next);
    },
    onSuccess: () => setSuccess(true),
  });
  return (
    <Card>
      <h2>Preferências do lead</h2>
      <p className="muted small" style={{ margin: '8px 0 24px' }}>
        Critérios usados na busca e no cálculo de compatibilidade.
      </p>
      <form
        onSubmit={handleSubmit((d) => mutation.mutate(d))}
        className="form-grid"
      >
        <Field label="Finalidade">
          <div className="actions">
            {[
              ['SALE', 'Compra'],
              ['RENT', 'Locação'],
            ].map(([v, l]) => (
              <label className="check-label" key={v}>
                <input type="checkbox" value={v} {...register('purposes')} />
                {l}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Tipo de imóvel">
          <div className="actions">
            {['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'].map((v) => (
              <label className="check-label" key={v}>
                <input type="checkbox" value={v} {...register('types')} />
                {stageLabel(v)}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Preço mínimo (R$)">
          <input inputMode="decimal" {...register('minPrice')} />
        </Field>
        <Field label="Preço máximo (R$)">
          <input inputMode="decimal" {...register('maxPrice')} />
        </Field>
        {[
          ['minBedrooms', 'Quartos mínimos'],
          ['maxBedrooms', 'Quartos máximos'],
          ['minParkingSpaces', 'Vagas mínimas'],
          ['maxParkingSpaces', 'Vagas máximas'],
        ].map(([k, l]) => (
          <Field label={l!} key={k}>
            <input type="number" min="0" max="100" {...register(k as any)} />
          </Field>
        ))}
        <div className="full-width">
          <Field label="Bairros (separados por vírgula)">
            <input {...register('neighborhoods')} />
          </Field>
        </div>
        <div className="full-width">
          <Field label="Observações">
            <textarea maxLength={2000} {...register('notes')} />
          </Field>
        </div>
        {mutation.error != null && (
          <div className="full-width">
            <ErrorPanel error={mutation.error} />
          </div>
        )}
        {success && (
          <div className="success-panel full-width" role="status">
            Preferências atualizadas.
          </div>
        )}
        <div className="actions full-width">
          <Button type="submit" disabled={mutation.isPending}>
            Salvar preferências
          </Button>
        </div>
      </form>
    </Card>
  );
}
function InteractionsPanel({ id }: { id: string }) {
  const [items, setItems] = useState<Interaction[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [add, setAdd] = useState(false);
  const query = useQuery({
    queryKey: ['interactions', id, cursor],
    queryFn: ({ signal }) =>
      api.get<CursorPage<Interaction>>(
        `/leads/${id}/interactions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        signal,
      ),
  });
  useEffect(() => {
    if (query.data)
      setItems((prev) => [
        ...new Map(
          [...prev, ...query.data.items].map((x) => [x.id, x]),
        ).values(),
      ]);
  }, [query.data]);
  const form = useForm({
    defaultValues: {
      type: 'NOTE',
      occurredAt: localInput(),
      summary: '',
      channel: '',
    },
  });
  const mutation = useMutation({
    mutationFn: (d: any) =>
      api.post(`/leads/${id}/interactions`, {
        ...d,
        occurredAt: toUTC(d.occurredAt),
        channel: d.channel || undefined,
      }),
    onSuccess: () => {
      setAdd(false);
      setItems([]);
      setCursor(null);
    },
  });
  return (
    <Card>
      <div className="section-title">
        <h2>Histórico de interações</h2>
        <Button onClick={() => setAdd(true)}>
          <Icon name="add" />
          Registrar interação
        </Button>
      </div>
      {query.error != null && <ErrorPanel error={query.error} />}
      {query.isPending && !items.length ? (
        <Loading />
      ) : items.length ? (
        <div className="timeline">
          {items.map((x) => (
            <div className="timeline-item" key={x.id}>
              <strong>{stageLabel(x.type)}</strong>
              <small>
                {datetime(x.occurredAt)} · {x.channel ?? 'Registro manual'}
              </small>
              <p>{x.summary}</p>
            </div>
          ))}
        </div>
      ) : (
        <Empty title="Nenhuma interação registrada" />
      )}
      {query.data?.nextCursor && (
        <Button
          variant="secondary"
          onClick={() => setCursor(query.data!.nextCursor)}
        >
          Carregar mais
        </Button>
      )}
      {add && (
        <Modal title="Registrar interação" onClose={() => setAdd(false)}>
          <form
            className="form-grid"
            onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
          >
            <Field label="Tipo">
              <select {...form.register('type')}>
                {['CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'NOTE', 'OTHER'].map(
                  (x) => (
                    <option value={x} key={x}>
                      {
                        (
                          {
                            CALL: 'Ligação',
                            EMAIL: 'E-mail',
                            WHATSAPP: 'WhatsApp',
                            MEETING: 'Reunião',
                            NOTE: 'Anotação',
                            OTHER: 'Outro',
                          } as any
                        )[x]
                      }
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Data e hora · Brasília">
              <input
                type="datetime-local"
                {...form.register('occurredAt')}
                required
              />
            </Field>
            <div className="full-width">
              <Field label="Resumo">
                <textarea
                  {...form.register('summary')}
                  required
                  maxLength={2000}
                />
              </Field>
            </div>
            <Field label="Canal (opcional)">
              <input {...form.register('channel')} />
            </Field>
            {mutation.error != null && (
              <div className="full-width">
                <ErrorPanel error={mutation.error} />
              </div>
            )}
            <div className="actions full-width">
              <Button type="submit" disabled={mutation.isPending}>
                Salvar interação
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </Card>
  );
}
function MatchesPanel({ id }: { id: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [items, setItems] = useState<Match[]>([]);
  const [edit, setEdit] = useState<Match | null>(null);
  const [score, setScore] = useState(50);
  const [status, setStatus] = useState('SUGGESTED');
  const [reason, setReason] = useState('');
  const query = useQuery({
    queryKey: ['matches', id, cursor],
    queryFn: () =>
      api.get<CursorPage<Match>>(
        `/leads/${id}/matches${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      ),
  });
  useEffect(() => {
    if (query.data)
      setItems((prev) => [
        ...new Map(
          [...prev, ...query.data.items].map((x) => [x.id, x]),
        ).values(),
      ]);
  }, [query.data]);
  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/leads/${id}/matches/${edit!.propertyId}`, {
        score,
        status,
        rejectionReason: status === 'REJECTED' ? reason || null : null,
      }),
    onSuccess: () => setEdit(null),
  });
  return (
    <Card>
      <div className="section-title">
        <h2>Imóveis associados</h2>
        <Link to={`/imoveis?leadId=${id}`}>
          <Button>
            <Icon name="add" />
            Associar imóvel
          </Button>
        </Link>
      </div>
      {query.error != null && <ErrorPanel error={query.error} />}
      {query.isPending && !items.length ? (
        <Loading />
      ) : items.length ? (
        <div className="stack">
          {items.map((m) => (
            <div key={m.id} className="notice" style={{ alignItems: 'center' }}>
              <Icon name="apartment" size={30} />
              <div style={{ flex: 1 }}>
                <h3>{m.property?.title ?? 'Imóvel associado'}</h3>
                <p>
                  {money(m.property?.priceCents)} · Afinidade manual {m.score}%
                </p>
                <Badge tone={m.status}>{stageLabel(m.status)}</Badge>
              </div>
              <div className="actions">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEdit(m);
                    setScore(m.score);
                    setStatus(m.status);
                    setReason(m.rejectionReason ?? '');
                  }}
                >
                  Editar interesse
                </Button>
                <Link to={`/agenda?leadId=${id}&propertyId=${m.propertyId}`}>
                  <Button>Agendar visita</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="Nenhum imóvel associado"
          description="Busque imóveis e revise a compatibilidade antes de associar."
        />
      )}
      {query.data?.nextCursor && (
        <Button
          variant="secondary"
          onClick={() => setCursor(query.data!.nextCursor)}
        >
          Carregar mais
        </Button>
      )}
      {edit && (
        <Modal
          title="Atualizar associação"
          onClose={() => setEdit(null)}
          footer={
            <Button
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Salvar interesse
            </Button>
          }
        >
          <Field label={`Afinidade manual: ${score}%`}>
            <input
              type="range"
              min={0}
              max={100}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
            />
          </Field>
          <Field label="Estado">
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {['SUGGESTED', 'SENT', 'INTERESTED', 'REJECTED'].map((x) => (
                <option value={x} key={x}>
                  {stageLabel(x)}
                </option>
              ))}
            </select>
          </Field>
          {status === 'REJECTED' && (
            <Field label="Motivo da rejeição">
              <textarea
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          {mutation.error != null && <ErrorPanel error={mutation.error} />}
        </Modal>
      )}
    </Card>
  );
}
function AssistantPanel({
  id,
  onExtractApplied,
}: {
  id: string;
  onExtractApplied: () => void;
}) {
  const [selected, setSelected] = useState('');
  const [conversationCursor, setConversationCursor] = useState<string | null>(
    null,
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [content, setContent] = useState('');
  const [extract, setExtract] = useState(false);
  const [extractText, setExtractText] = useState('');
  const [extraction, setExtraction] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const attempt = useRef<{ key: string; content: string } | null>(null);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['conversations', id, conversationCursor],
    queryFn: () =>
      api.get<CursorPage<Conversation>>(
        `/leads/${id}/conversations${conversationCursor ? `?cursor=${encodeURIComponent(conversationCursor)}` : ''}`,
      ),
  });
  useEffect(() => {
    if (list.data) {
      setConversations((prev) => [
        ...new Map(
          [...prev, ...list.data.items].map((x) => [x.id, x]),
        ).values(),
      ]);
      if (!selected && list.data.items[0]) setSelected(list.data.items[0].id);
    }
  }, [list.data]);
  const messages = useQuery({
    queryKey: ['messages', selected],
    queryFn: () => api.get<Message[]>(`/conversations/${selected}/messages`),
    enabled: !!selected,
  });
  const proposals = useQuery({
    queryKey: ['proposals', selected],
    queryFn: () => api.get<Proposal[]>(`/conversations/${selected}/proposals`),
    enabled: !!selected,
  });
  useEffect(() => {
    if (!proposals.data?.length) return;
    const next = Math.min(
      ...proposals.data.map((p) => new Date(p.expiresAt).getTime()),
    );
    const timer = setTimeout(
      () => void proposals.refetch(),
      Math.max(0, next - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [proposals.data]);
  const create = useMutation({
    mutationFn: () => api.post<Conversation>('/conversations', { leadId: id }),
    onSuccess: (d) => {
      setConversations((prev) => [d, ...prev]);
      setSelected(d.id);
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!content.trim()) throw new Error('Escreva uma mensagem.');
      if (!attempt.current || attempt.current.content !== content)
        attempt.current = { key: crypto.randomUUID(), content };
      return api.post(
        `/conversations/${selected}/messages`,
        { content: attempt.current.content },
        attempt.current.key,
      );
    },
    onSuccess: () => {
      setContent('');
      attempt.current = null;
      void qc.invalidateQueries({ queryKey: ['messages', selected] });
      void qc.invalidateQueries({ queryKey: ['proposals', selected] });
    },
  });
  const decision = useMutation({
    mutationFn: ({
      proposalId,
      confirmed,
    }: {
      proposalId: string;
      confirmed: boolean;
    }) =>
      api.post(`/conversations/${selected}/proposals/${proposalId}/decision`, {
        confirmed,
      }),
    onSettled: () => void proposals.refetch(),
  });
  const extractionMutation = useMutation({
    mutationFn: () =>
      api.post('/ai/preferences/extract', { message: extractText }),
    onSuccess: (data) => {
      setExtraction(data);
      const x = data.preferences ?? data;
      setReview({
        purposes: x.purpose ? [x.purpose] : [],
        types: x.types ?? [],
        neighborhoods: x.neighborhoods ?? [],
        minPrice: x.minPriceCents == null ? '' : String(x.minPriceCents / 100),
        maxPrice: x.maxPriceCents == null ? '' : String(x.maxPriceCents / 100),
        minBedrooms: x.minBedrooms == null ? '' : String(x.minBedrooms),
        maxBedrooms: x.maxBedrooms == null ? '' : String(x.maxBedrooms),
      });
    },
  });
  const apply = useMutation({
    mutationFn: () => {
      const d: any = {};
      if (review.purposes.length) d.purposes = review.purposes;
      if (review.types.length) d.types = review.types;
      if (review.neighborhoods.length) d.neighborhoods = review.neighborhoods;
      if (review.minPrice) d.minPriceCents = parseMoney(review.minPrice);
      if (review.maxPrice) d.maxPriceCents = parseMoney(review.maxPrice);
      if (review.minBedrooms !== '') d.minBedrooms = Number(review.minBedrooms);
      if (review.maxBedrooms !== '') d.maxBedrooms = Number(review.maxBedrooms);
      if (!Object.keys(d).length)
        throw new Error(
          'Nenhum campo preenchido. Complete as preferências manualmente.',
        );
      return api.patch(`/leads/${id}/preferences`, d);
    },
    onSuccess: () => {
      setExtract(false);
      onExtractApplied();
    },
  });
  return (
    <Card>
      <div className="section-title">
        <div>
          <h2>
            <Icon name="auto_awesome" /> Assistente Copilot
          </h2>
          <p className="small muted" style={{ marginTop: 8 }}>
            Converse com a IA sobre este lead. Revise as sugestões antes de
            confirmar.
          </p>
        </div>
        <Simulation />
      </div>
      <div className="toolbar">
        <select
          aria-label="Conversa selecionada"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            attempt.current = null;
            setContent('');
          }}
        >
          <option value="">Selecione uma conversa</option>
          {conversations.map((c, i) => (
            <option key={c.id} value={c.id}>
              Conversa {conversations.length - i} · {datetime(c.createdAt)}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={create.isPending}
          onClick={() => create.mutate()}
        >
          <Icon name="add" />
          Nova conversa
        </Button>
      </div>
      {list.data?.nextCursor && (
        <Button
          variant="secondary"
          onClick={() => setConversationCursor(list.data!.nextCursor)}
        >
          Mais conversas
        </Button>
      )}
      {list.error != null && (
        <ErrorPanel error={list.error} onRetry={() => void list.refetch()} />
      )}
      {create.error != null && <ErrorPanel error={create.error} />}
      {selected ? (
        <>
          <div
            className="conversation-messages"
            role="log"
            aria-label="Histórico da conversa"
            aria-live="polite"
          >
            {messages.isPending ? (
              <Loading />
            ) : messages.error ? (
              <ErrorPanel
                error={messages.error}
                onRetry={() => void messages.refetch()}
              />
            ) : messages.data?.length ? (
              messages.data.map((m) => (
                <div
                  key={m.id}
                  className={`message ${m.role === 'USER' ? 'user' : ''}`}
                >
                  <span className="message-role">
                    {m.role === 'USER'
                      ? 'Você'
                      : m.role === 'ASSISTANT'
                        ? 'Copilot IA'
                        : 'Evento técnico'}{' '}
                    · {datetime(m.createdAt)}
                  </span>
                  {m.body}
                </div>
              ))
            ) : (
              <Empty
                title="Inicie a conversa"
                description="Peça ajuda para buscar imóveis, organizar tarefas ou propor uma visita."
              />
            )}
          </div>
          {proposals.error != null && <ErrorPanel error={proposals.error} />}
          {proposals.data?.map((p) => (
            <div className="proposal-card" key={p.id}>
              <div className="status-line">
                <Icon name="calendar_today" />
                <strong>Proposta de visita identificada</strong>
                <Badge tone="warning">Ação sugerida</Badge>
              </div>
              <p>{p.summary}</p>
              <p className="small muted">
                Expira em {datetime(p.expiresAt)}. A visita só será criada após
                sua confirmação.
              </p>
              <div className="actions">
                <Button
                  disabled={
                    decision.isPending ||
                    new Date(p.expiresAt).getTime() <= Date.now()
                  }
                  onClick={() =>
                    decision.mutate({ proposalId: p.id, confirmed: true })
                  }
                >
                  Confirmar visita e adicionar à agenda
                </Button>
                <Button
                  variant="secondary"
                  disabled={decision.isPending}
                  onClick={() =>
                    decision.mutate({ proposalId: p.id, confirmed: false })
                  }
                >
                  Rejeitar proposta
                </Button>
              </div>
            </div>
          ))}
          {decision.error != null && <ErrorPanel error={decision.error} />}
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <textarea
              aria-label="Mensagem para o assistente"
              value={content}
              maxLength={4000}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Peça uma sugestão ao Copilot…"
              disabled={send.isPending}
            />
            <Button type="submit" disabled={!content.trim() || send.isPending}>
              {send.isPending ? (
                <Icon name="progress_activity" className="spin" />
              ) : (
                <Icon name="send" />
              )}
              {send.isPending ? 'Processando' : 'Enviar'}
            </Button>
          </form>
          {send.error != null && (
            <ErrorPanel error={send.error} onRetry={() => send.mutate()} />
          )}
        </>
      ) : (
        <Empty title="Escolha ou crie uma conversa" />
      )}
      <div className="actions" style={{ marginTop: 18 }}>
        <Button
          variant="copilot"
          onClick={() => {
            setExtract(true);
            setExtraction(null);
            setReview(null);
          }}
        >
          <Icon name="tune" />
          Extrair preferências de um texto
        </Button>
        <Link to={`/agenda?leadId=${id}`}>
          <Button variant="secondary">Agendar manualmente</Button>
        </Link>
      </div>
      {extract && (
        <Modal
          title="Revisar preferências detectadas"
          onClose={() => setExtract(false)}
        >
          <Field label="Texto para análise">
            <textarea
              value={extractText}
              maxLength={4000}
              onChange={(e) => setExtractText(e.target.value)}
              placeholder="Procuro apartamento na Vila Mariana, com 2 quartos e até R$ 650 mil…"
            />
          </Field>
          <Button
            variant="copilot"
            disabled={!extractText.trim() || extractionMutation.isPending}
            onClick={() => extractionMutation.mutate()}
          >
            Analisar texto
          </Button>
          {extractionMutation.error != null && (
            <ErrorPanel error={extractionMutation.error} />
          )}
          {extraction && (
            <div className="notice">
              {extraction.needsClarification
                ? 'A análise precisa de esclarecimentos. Revise os campos abaixo.'
                : 'Revise os campos antes de aplicar.'}
              {extraction.uncertainty?.join(' ')}
            </div>
          )}
          {review && (
            <>
              <Field label="Finalidade">
                <select
                  value={review.purposes[0] ?? ''}
                  onChange={(e) =>
                    setReview({
                      ...review,
                      purposes: e.target.value ? [e.target.value] : [],
                    })
                  }
                >
                  <option value="">Não alterar</option>
                  <option value="SALE">Compra</option>
                  <option value="RENT">Locação</option>
                </select>
              </Field>
              <Field label="Tipos de imóvel">
                <div className="actions">
                  {['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'].map((type) => (
                    <label className="check-label" key={type}>
                      <input
                        type="checkbox"
                        checked={review.types.includes(type)}
                        onChange={(e) =>
                          setReview({
                            ...review,
                            types: e.target.checked
                              ? [...review.types, type]
                              : review.types.filter(
                                  (value: string) => value !== type,
                                ),
                          })
                        }
                      />
                      {stageLabel(type)}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Bairros">
                <input
                  value={review.neighborhoods.join(', ')}
                  onChange={(e) =>
                    setReview({
                      ...review,
                      neighborhoods: e.target.value
                        .split(',')
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <div className="form-grid">
                <Field label="Orçamento mínimo (R$)">
                  <input
                    inputMode="decimal"
                    value={review.minPrice}
                    onChange={(e) =>
                      setReview({ ...review, minPrice: e.target.value })
                    }
                  />
                </Field>
                <Field label="Orçamento máximo (R$)">
                  <input
                    value={review.maxPrice}
                    onChange={(e) =>
                      setReview({ ...review, maxPrice: e.target.value })
                    }
                  />
                </Field>
                <Field label="Quartos mínimos">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={review.minBedrooms}
                    onChange={(e) =>
                      setReview({ ...review, minBedrooms: e.target.value })
                    }
                  />
                </Field>
                <Field label="Quartos máximos">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={review.maxBedrooms}
                    onChange={(e) =>
                      setReview({ ...review, maxBedrooms: e.target.value })
                    }
                  />
                </Field>
              </div>
              {apply.error != null && <ErrorPanel error={apply.error} />}
              <Button disabled={apply.isPending} onClick={() => apply.mutate()}>
                Aplicar campos revisados
              </Button>
            </>
          )}
        </Modal>
      )}
    </Card>
  );
}
