import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/session';
import { money, datetime, stageLabel } from '../lib/format';
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorPanel,
  Field,
  Icon,
  Loading,
  Modal,
  PageHeader,
} from '../components/ui';
import './pages.css';
type LeadRow = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  stage: string;
  notes?: string;
  preference?: { maxPriceCents?: number; neighborhoods?: string[] };
  lastInteraction?: { occurredAt: string; summary: string };
};
const stages = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VISIT_SCHEDULED',
  'NEGOTIATION',
  'WON',
  'LOST',
];
export default function LeadsPage() {
  const client = useQueryClient();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [budget, setBudget] = useState('');
  const [period, setPeriod] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<'create' | 'import' | null>(null);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<{
    items: { line: number; status: string; errors?: string[] }[];
    total: number;
    created: number;
    failed: number;
    preview: boolean;
  } | null>(null);
  const importKey = useRef({ csv: '', key: crypto.randomUUID() });
  const params = new URLSearchParams({ page: String(page), limit: '20' });
  if (q) params.set('q', q);
  if (stage) params.set('stage', stage);
  if (budget) params.set('maxPriceCents', budget);
  if (period)
    params.set(
      'lastInteractionFrom',
      new Date(Date.now() - Number(period) * 86400000).toISOString(),
    );
  const leads = useQuery({
    queryKey: ['leads', q, stage, budget, period, page],
    queryFn: () =>
      api.get<{ items: LeadRow[]; total: number; page: number; limit: number }>(
        `/leads?${params}`,
      ),
  });
  const counts = useQuery({
    queryKey: ['leads', 'funnel-counts'],
    queryFn: () => api.get<{ stage: string; count: number }[]>('/leads/funnel'),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post('/leads', body),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ['leads'] });
    },
  });
  const importRows = () => {
    const lines = csv.trim().split(/\r?\n/);
    return lines
      .slice(1)
      .filter(Boolean)
      .map((line) => {
        const [name, email, phone, notes] = line.split(';');
        return {
          name,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
        };
      });
  };
  const importer = useMutation({
    mutationFn: (isPreview: boolean) => {
      if (importKey.current.csv !== csv)
        importKey.current = { csv, key: crypto.randomUUID() };
      return api.post<typeof preview>(
        '/leads/import',
        { rows: importRows(), preview: isPreview },
        isPreview ? undefined : importKey.current.key,
      );
    },
    onSuccess: (result) => {
      setPreview(result);
      void client.invalidateQueries({ queryKey: ['leads'] });
    },
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    create.mutate({
      name: f.get('name'),
      email: f.get('email') || undefined,
      phone: f.get('phone') || undefined,
      notes: f.get('notes') || undefined,
    });
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Sua carteira de leads"
        subtitle="Relacionamentos organizados. O próximo bom negócio começa aqui."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setModal('import');
                setPreview(null);
              }}
            >
              <Icon name="upload" />
              Importar leads
            </Button>
            <Button onClick={() => setModal('create')}>
              <Icon name="add" />
              Novo lead
            </Button>
          </>
        }
      />
      <div className="copilot-banner">
        <Icon name="auto_awesome" />
        <div>
          <strong>Copilot · Sua carteira em movimento</strong>
          <p className="muted">
            Abra um lead para revisar preferências, encontrar imóveis
            compatíveis e preparar o próximo contato.
          </p>
        </div>
        <Link to="/funil">
          <Button variant="copilot">
            Ver funil <Icon name="arrow_forward" />
          </Button>
        </Link>
      </div>
      <Card>
        <div className="toolbar">
          <input
            className="input"
            aria-label="Buscar leads"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Faixa de orçamento"
            value={budget}
            onChange={(e) => {
              setBudget(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as faixas de valor</option>
            <option value="50000000">Até R$ 500.000</option>
            <option value="100000000">Até R$ 1.000.000</option>
            <option value="250000000">Até R$ 2.500.000</option>
          </select>
          <select
            className="input"
            aria-label="Última interação"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as interações</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
        </div>
        <div className="stage-tabs">
          <Button
            variant={stage ? 'secondary' : 'primary'}
            onClick={() => {
              setStage('');
              setPage(1);
            }}
          >
            Todos{' '}
            {counts.data
              ? `(${counts.data.reduce((sum, s) => sum + s.count, 0)})`
              : ''}
          </Button>
          {stages.map((s) => (
            <Button
              key={s}
              variant={stage === s ? 'primary' : 'secondary'}
              onClick={() => {
                setStage(s);
                setPage(1);
              }}
            >
              {stageLabel(s)}{' '}
              {counts.data
                ? `(${counts.data.find((c) => c.stage === s)?.count || 0})`
                : ''}
            </Button>
          ))}
        </div>
      </Card>
      {leads.isLoading ? (
        <Loading />
      ) : leads.isError ? (
        <ErrorPanel error={leads.error} onRetry={() => void leads.refetch()} />
      ) : !leads.data?.items.length ? (
        <Empty
          title="Nenhum lead encontrado"
          description="Cadastre seu primeiro lead ou ajuste os filtros."
        />
      ) : (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Canais de contato</th>
                  <th>Estágio do funil</th>
                  <th>Preferência / perfil</th>
                  <th>Última interação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {leads.data.items.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="person-cell">
                        <span className="avatar">
                          {lead.name
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <div>
                          <strong>{lead.name}</strong>
                          <small className="muted">
                            {lead.notes?.slice(0, 50) || 'Perfil em construção'}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {lead.phone && <div>{lead.phone}</div>}
                      <small className="muted">
                        {lead.email || 'Sem e-mail'}
                      </small>
                    </td>
                    <td>
                      <Badge>{stageLabel(lead.stage)}</Badge>
                    </td>
                    <td>
                      {lead.preference?.maxPriceCents
                        ? money(lead.preference.maxPriceCents)
                        : 'Orçamento a definir'}
                      <br />
                      <small className="muted">
                        {lead.preference?.neighborhoods?.join(', ') ||
                          'Região a definir'}
                      </small>
                    </td>
                    <td>
                      {lead.lastInteraction
                        ? datetime(lead.lastInteraction.occurredAt)
                        : 'Sem interação'}
                      <br />
                      <small className="muted">
                        {lead.lastInteraction?.summary.slice(0, 50)}
                      </small>
                    </td>
                    <td>
                      <Link to={`/leads/${lead.id}`}>
                        <Button variant="secondary">
                          Ver lead <Icon name="arrow_forward" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span className="muted">
              {leads.data.total} leads · Página {page}
            </span>
            <div className="actions">
              <Button
                variant="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page * 20 >= leads.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Card>
      )}
      {modal === 'create' && (
        <Modal title="Novo lead" onClose={() => setModal(null)}>
          <form onSubmit={submit} className="page-stack">
            <Field label="Nome completo">
              <input name="name" className="input" required maxLength={120} />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" className="input" />
            </Field>
            <Field label="Telefone (com DDD)">
              <input
                name="phone"
                className="input"
                pattern="[+]?[0-9]{8,20}"
                placeholder="5511999999999"
              />
            </Field>
            <Field label="Observações">
              <textarea name="notes" className="input" maxLength={2000} />
            </Field>
            <p className="muted">Informe ao menos um canal de contato.</p>
            {create.isError && <ErrorPanel error={create.error} />}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Salvando...' : 'Cadastrar lead'}
            </Button>
          </form>
        </Modal>
      )}
      {modal === 'import' && (
        <Modal title="Importar leads por CSV" onClose={() => setModal(null)}>
          <div className="page-stack">
            <p className="muted">
              Arquivo com cabeçalho nome;e-mail;telefone;observações. Revise
              antes de gravar.
            </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setCsv(await file.text());
                  setPreview(null);
                }
              }}
            />
            <textarea
              className="input"
              rows={7}
              aria-label="Conteúdo CSV"
              value={csv}
              onChange={(e) => {
                setCsv(e.target.value);
                setPreview(null);
              }}
              placeholder={'nome;email;telefone;observações\n'}
            />
            {importer.isError && <ErrorPanel error={importer.error} />}
            <Button
              variant="secondary"
              disabled={!csv.trim() || importer.isPending}
              onClick={() => importer.mutate(true)}
            >
              Validar e visualizar
            </Button>
            {preview && (
              <>
                <p>
                  {preview.total} linhas ·{' '}
                  {preview.preview
                    ? preview.items.filter((i) => i.status === 'VALID').length
                    : preview.created}{' '}
                  {preview.preview ? 'válidas' : 'criadas'} · {preview.failed}{' '}
                  com erro
                </p>
                {preview.items.map((item) => (
                  <p key={item.line}>
                    Linha {item.line}: {item.status} {item.errors?.join(', ')}
                  </p>
                ))}
                <Button
                  disabled={
                    importer.isPending || preview.failed > 0 || !preview.preview
                  }
                  onClick={() => importer.mutate(false)}
                >
                  {preview.preview
                    ? 'Confirmar importação'
                    : 'Importação concluída'}
                </Button>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
