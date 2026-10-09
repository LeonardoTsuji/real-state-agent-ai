import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, useSession } from '../lib/session';
import { datetime, stageLabel } from '../lib/format';
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Modal,
  Icon,
  Loading,
  ErrorPanel,
  Empty,
} from '../components/ui';
interface Job {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}
interface Metric {
  queue: string;
  type: string;
  status: string;
  count: number;
  attempts: number;
  averageDurationMs: number | null;
}
interface AiMetric {
  operation: string;
  status: string;
  resultCode: string | null;
  modelVersion: string | null;
  promptVersion: string | null;
  calls: number;
  tokens: number;
  averageDurationMs: number | null;
}
const types: Record<string, string> = {
  CALENDAR_SYNC: 'Sincronização de calendário',
  SEND_MESSAGE: 'Envio de mensagem simulado',
  VISIT_REMINDER: 'Lembrete de visita',
  FOLLOW_UP: 'Follow-up',
  IMPORT_PROPERTIES: 'Importação de imóveis',
  RESERVATION_EXPIRY: 'Expiração de pré-reserva',
};
export default function OperationsPage() {
  const { user, refreshIdentity } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [verified, setVerified] = useState(false);
  const [identityError, setIdentityError] = useState<unknown>(null);
  const [visible, setVisible] = useState(
    document.visibilityState === 'visible',
  );
  const [replay, setReplay] = useState<Job | null>(null);
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState('');
  const metrics = location.pathname.endsWith('/metricas');
  const match = location.pathname.match(/\/jobs\/([^/]+)$/);
  const id = match?.[1];
  const permitted = user?.permissions.includes('operations:read') ?? false;
  const allowed = verified && permitted;
  useEffect(() => {
    let active = true;
    setVerified(false);
    refreshIdentity().then(
      () => {
        if (active) setVerified(true);
      },
      (e) => {
        if (active) setIdentityError(e);
      },
    );
    const visibility = () => {
      setVisible(document.visibilityState === 'visible');
      if (document.visibilityState === 'visible') {
        setVerified(false);
        void refreshIdentity().then(
          () => {
            if (active) setVerified(true);
          },
          (e) => {
            if (active) setIdentityError(e);
          },
        );
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [location.pathname]);
  const forbidden = (error: unknown) =>
    error instanceof ApiError && error.status === 403;
  const jobs = useQuery({
    queryKey: ['operations', 'jobs'],
    queryFn: ({ signal }) =>
      api.get<Job[]>('/operations/jobs?limit=50', signal),
    enabled: allowed && !metrics && !id,
    refetchInterval: (q) =>
      visible && allowed && !forbidden(q.state.error) ? 10000 : false,
  });
  const detail = useQuery({
    queryKey: ['operations', 'job', id],
    queryFn: ({ signal }) => api.get<Job>(`/operations/jobs/${id}`, signal),
    enabled: allowed && !!id,
    refetchInterval: (q) =>
      visible && allowed && !forbidden(q.state.error) ? 10000 : false,
  });
  const processing = useQuery({
    queryKey: ['operations', 'metrics'],
    queryFn: ({ signal }) => api.get<Metric[]>('/operations/metrics', signal),
    enabled: allowed && metrics,
    refetchInterval: (q) =>
      visible && allowed && !forbidden(q.state.error) ? 10000 : false,
  });
  const ai = useQuery({
    queryKey: ['operations', 'metrics', 'ai'],
    queryFn: ({ signal }) =>
      api.get<AiMetric[]>('/operations/metrics/ai', signal),
    enabled: allowed && metrics,
    refetchInterval: (q) =>
      visible && allowed && !forbidden(q.state.error) ? 10000 : false,
  });
  useEffect(() => {
    if (
      [jobs.error, detail.error, processing.error, ai.error].some(forbidden)
    ) {
      setVerified(false);
      setReplay(null);
      void qc.cancelQueries({ queryKey: ['operations'] });
      qc.removeQueries({ queryKey: ['operations'] });
    }
  }, [jobs.error, detail.error, processing.error, ai.error]);
  const reenque = useMutation({
    mutationFn: () => api.post(`/operations/jobs/${replay!.id}/replay`),
    onSuccess: () => {
      setReplay(null);
      setNotice(
        'Job reenfileirado. Acompanhe o resultado na fila operacional.',
      );
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['operations'] }),
  });
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
    } catch {
      setNotice('Selecione o identificador para copiá-lo manualmente.');
    }
  };
  const openReplay = async (job: Job) => {
    try {
      const fresh = await api.get<Job>(`/operations/jobs/${job.id}`);
      if (fresh.status !== 'FAILED') {
        setNotice('O estado do job mudou. Atualize os detalhes.');
        return;
      }
      setReplay(fresh);
    } catch (e) {
      setIdentityError(e);
    }
  };
  if (!permitted)
    return (
      <div className="page-stack">
        <PageHeader
          title="Acesso restrito"
          subtitle="Esta área exige permissões operacionais."
        />
        <Card>
          <div className="empty-state">
            <Icon name="lock" size={54} />
            <h2>Permissão negada</h2>
            <p className="muted">
              Seu perfil permite gerenciar sua própria carteira. Dados
              operacionais foram descartados.
            </p>
            <Badge>{user?.name} · Corretor</Badge>
            <Button onClick={() => navigate('/leads')}>
              <Icon name="arrow_back" />
              Voltar para leads
            </Button>
            <p className="small muted">
              A liberação de acesso é administrada pelo responsável técnico,
              fora desta interface.
            </p>
          </div>
        </Card>
      </div>
    );
  if (identityError && !verified)
    return (
      <ErrorPanel
        error={identityError}
        onRetry={() =>
          void refreshIdentity().then(() => {
            setVerified(true);
            setIdentityError(null);
          })
        }
      />
    );
  if (!verified) return <Loading />;
  const updatedAt = Math.max(
    jobs.dataUpdatedAt,
    detail.dataUpdatedAt,
    processing.dataUpdatedAt,
    ai.dataUpdatedAt,
  );
  return (
    <div className="page-stack">
      <PageHeader
        title={
          metrics
            ? 'Métricas da Aplicação'
            : id
              ? 'Detalhes do Processamento'
              : 'Jobs recentes'
        }
        subtitle={
          <span>
            Visão global ·{' '}
            {updatedAt
              ? `Atualizado ${datetime(new Date(updatedAt))}`
              : 'Aguardando atualização'}{' '}
            · {visible ? 'Atualização automática ativa' : 'Atualização pausada'}
          </span>
        }
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              void qc.invalidateQueries({ queryKey: ['operations'] })
            }
          >
            <Icon name="refresh" />
            Atualizar
          </Button>
        }
      />
      <div className="tabs">
        <Link
          className={`tab ${!metrics ? 'active' : ''}`}
          to="/operacoes/jobs"
        >
          Jobs recentes
        </Link>
        <Link
          className={`tab ${metrics ? 'active' : ''}`}
          to="/operacoes/metricas"
        >
          Métricas
        </Link>
      </div>
      {notice && (
        <p className="success-panel" role="status">
          {notice}
        </p>
      )}
      {identityError != null && verified && (
        <ErrorPanel error={identityError} />
      )}
      {metrics ? (
        <>
          <h2>Processamentos</h2>
          {processing.isPending ? (
            <Loading />
          ) : processing.error ? (
            <ErrorPanel error={processing.error} />
          ) : (
            <>
              <div className="grid-4 metrics">
                {['COMPLETED', 'ACTIVE', 'WAITING', 'FAILED'].map((s) => (
                  <Card className="metric" key={s}>
                    <span className="label">{stageLabel(s)}</span>
                    <strong>
                      {processing.data
                        ?.filter((m) => m.status === s)
                        .reduce((sum, m) => sum + m.count, 0) ?? 0}
                    </strong>
                  </Card>
                ))}
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tipo de processamento</th>
                      <th>Status</th>
                      <th>Contagem</th>
                      <th>Tentativas</th>
                      <th>Duração média</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processing.data?.map((m, i) => (
                      <tr key={i}>
                        <td>{types[m.type] ?? m.type}</td>
                        <td>
                          <Badge tone={m.status}>{stageLabel(m.status)}</Badge>
                        </td>
                        <td>{m.count}</td>
                        <td>{m.attempts}</td>
                        <td>
                          {m.averageDurationMs == null
                            ? 'Indisponível'
                            : `${(m.averageDurationMs / 1000).toFixed(2)} s`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!processing.data?.length && (
                  <Empty title="Nenhum processamento registrado" />
                )}
              </div>
            </>
          )}
          <div className="section-title">
            <h2>Inteligência Artificial</h2>
            <Badge>Últimas 24 horas · Todo o ambiente</Badge>
          </div>
          {ai.isPending ? (
            <Loading />
          ) : ai.error ? (
            <ErrorPanel error={ai.error} />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Operação</th>
                    <th>Estado</th>
                    <th>Chamadas / Tokens</th>
                    <th>Modelo / Prompt</th>
                    <th>Duração média</th>
                  </tr>
                </thead>
                <tbody>
                  {ai.data?.map((m, i) => (
                    <tr key={i}>
                      <td>{m.operation}</td>
                      <td>{m.status}</td>
                      <td>
                        {m.calls} / {m.tokens}
                      </td>
                      <td>
                        {m.modelVersion ?? '—'} / {m.promptVersion ?? '—'}
                      </td>
                      <td>
                        {m.averageDurationMs == null
                          ? 'Indisponível'
                          : `${m.averageDurationMs.toFixed(0)} ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ai.data?.length && (
                <Empty title="Nenhuma chamada de IA na janela" />
              )}
            </div>
          )}
        </>
      ) : id ? (
        detail.isPending ? (
          <Loading />
        ) : detail.error ? (
          <ErrorPanel error={detail.error} />
        ) : (
          <>
            <Link to="/operacoes/jobs">← Voltar para jobs</Link>
            <Card>
              <div className="section-title">
                <h2>{types[detail.data!.type] ?? detail.data!.type}</h2>
                <Badge tone={detail.data!.status}>
                  {stageLabel(detail.data!.status)}
                </Badge>
              </div>
              <dl className="definition-list">
                <div className="full-width">
                  <dt>Identificador completo</dt>
                  <dd className="status-line">
                    {detail.data!.id}
                    <button
                      className="icon-button"
                      aria-label="Copiar ID do job"
                      onClick={() => void copy(detail.data!.id)}
                    >
                      <Icon name="content_copy" size={14} />
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Tentativas / Limite</dt>
                  <dd>
                    {detail.data!.attempts} / {detail.data!.maxAttempts}
                  </dd>
                </div>
                <div>
                  <dt>Próxima tentativa</dt>
                  <dd>{datetime(detail.data!.nextRetryAt)}</dd>
                </div>
                <div>
                  <dt>Criação</dt>
                  <dd>{datetime(detail.data!.createdAt)}</dd>
                </div>
                <div>
                  <dt>Início</dt>
                  <dd>{datetime(detail.data!.startedAt)}</dd>
                </div>
                <div>
                  <dt>Fim</dt>
                  <dd>{datetime(detail.data!.finishedAt)}</dd>
                </div>
                <div>
                  <dt>Código da falha</dt>
                  <dd>{detail.data!.failureCode ?? '—'}</dd>
                </div>
              </dl>
              {detail.data!.failureMessage && (
                <div className="error-panel" style={{ marginTop: 20 }}>
                  <Icon name="warning" />
                  {detail.data!.failureMessage}
                </div>
              )}
              <div className="notice" style={{ margin: '20px 0' }}>
                Diagnóstico sanitizado. Payloads, credenciais e dados internos
                não são exibidos.
              </div>
              {detail.data!.status === 'FAILED' &&
                user?.permissions.includes('operations:replay') && (
                  <Button onClick={() => void openReplay(detail.data!)}>
                    <Icon name="refresh" />
                    Reenfileirar job
                  </Button>
                )}
            </Card>
          </>
        )
      ) : jobs.isPending ? (
        <Loading />
      ) : jobs.error ? (
        <ErrorPanel error={jobs.error} onRetry={() => void jobs.refetch()} />
      ) : (
        <>
          <div className="notice">
            Exibindo até 50 jobs recentes. A consulta tem alcance global.
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Identificador</th>
                  <th>Tipo de processamento</th>
                  <th>Status</th>
                  <th>Tentativas</th>
                  <th>Próxima tentativa</th>
                  <th>Data de criação</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {jobs.data?.map((j) => (
                  <tr key={j.id}>
                    <td>
                      <div className="status-line">
                        <span>{j.id.slice(0, 8)}…</span>
                        <button
                          className="icon-button"
                          aria-label={`Copiar job ${j.id}`}
                          onClick={() => void copy(j.id)}
                        >
                          <Icon name="content_copy" size={13} />
                        </button>
                        {copied === j.id && (
                          <small role="status">Copiado</small>
                        )}
                      </div>
                    </td>
                    <td>{types[j.type] ?? j.type}</td>
                    <td>
                      <Badge tone={j.status}>{stageLabel(j.status)}</Badge>
                    </td>
                    <td>
                      {j.attempts} / {j.maxAttempts}
                    </td>
                    <td>{datetime(j.nextRetryAt)}</td>
                    <td>{datetime(j.createdAt)}</td>
                    <td>
                      <Link to={`/operacoes/jobs/${j.id}`}>Ver detalhes →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!jobs.data?.length && <Empty title="Nenhum job recente" />}
          </div>
        </>
      )}
      {replay && (
        <Modal
          title="Reenfileirar processamento?"
          onClose={() => setReplay(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setReplay(null)}>
                Cancelar
              </Button>
              <Button
                disabled={reenque.isPending}
                onClick={() => reenque.mutate()}
              >
                Confirmar reenvio
              </Button>
            </>
          }
        >
          <p>
            Este job será colocado novamente na fila para uma nova tentativa.
          </p>
          <dl className="definition-list">
            <div className="full-width">
              <dt>ID do job</dt>
              <dd>{replay.id}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{types[replay.type] ?? replay.type}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>Com falha</dd>
            </div>
          </dl>
          {reenque.error && <ErrorPanel error={reenque.error} />}
        </Modal>
      )}
    </div>
  );
}
