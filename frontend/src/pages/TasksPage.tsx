import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../lib/session';
import type { Task, Lead, Page, CursorPage } from '../lib/types';
import { datetime, localInput, toUTC, stageLabel } from '../lib/format';
import {
  PageHeader,
  Card,
  Button,
  Icon,
  Badge,
  Modal,
  Field,
  Loading,
  Empty,
  ErrorPanel,
} from '../components/ui';
export default function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(!!params.get('leadId'));
  const [confirm, setConfirm] = useState<{ task: Task; status: string } | null>(
    null,
  );
  const status = params.get('status') ?? 'PENDING';
  const leadId = params.get('leadId') ?? '';
  const query = useInfiniteQuery({
    queryKey: ['tasks', status, leadId],
    initialPageParam: '',
    queryFn: ({ pageParam, signal }) =>
      api.get<CursorPage<Task>>(
        `/tasks?status=${status}${leadId ? `&leadId=${leadId}` : ''}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        signal,
      ),
    getNextPageParam: (d) => d.nextCursor ?? undefined,
  });
  const leads = useQuery({
    queryKey: ['leads', 'task-select'],
    queryFn: () => api.get<Page<Lead>>('/leads?limit=100'),
  });
  const form = useForm({
    defaultValues: {
      leadId,
      title: '',
      dueAt: localInput(new Date(Date.now() + 86400000)),
    },
  });
  const create = useMutation({
    mutationFn: (d: { leadId: string; title: string; dueAt: string }) =>
      api.post('/tasks', { ...d, dueAt: toUTC(d.dueAt) }),
    onSuccess: () => {
      setOpen(false);
      form.reset({
        leadId,
        title: '',
        dueAt: localInput(new Date(Date.now() + 86400000)),
      });
    },
  });
  const change = useMutation({
    mutationFn: () =>
      api.patch(`/tasks/${confirm!.task.id}/status`, {
        status: confirm!.status,
      }),
    onSuccess: () => setConfirm(null),
  });
  const items = query.data?.pages.flatMap((d) => d.items) ?? [];
  return (
    <div className="page-stack">
      <PageHeader
        title="Tarefas & Próximas Ações"
        subtitle="Organize follow-ups e acompanhe os compromissos com seus leads."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Icon name="add" />
            Nova tarefa
          </Button>
        }
      />
      <Card>
        <div className="toolbar">
          <div className="tabs">
            {['PENDING', 'COMPLETED', 'CANCELED'].map((s) => (
              <button
                key={s}
                className={`tab ${status === s ? 'active' : ''}`}
                onClick={() =>
                  setParams((p) => {
                    p.set('status', s);
                    return p;
                  })
                }
              >
                {stageLabel(s)}
              </button>
            ))}
          </div>
          <select
            aria-label="Filtrar tarefas por lead"
            value={leadId}
            onChange={(e) =>
              setParams((p) => {
                if (e.target.value) p.set('leadId', e.target.value);
                else p.delete('leadId');
                return p;
              })
            }
          >
            <option value="">Todos os leads</option>
            {leads.data?.items.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </Card>
      <Card>
        {query.isPending ? (
          <Loading />
        ) : query.error ? (
          <ErrorPanel
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : !items.length ? (
          <Empty
            title="Nenhuma tarefa neste filtro"
            description="Crie uma tarefa para acompanhar o próximo passo do seu lead."
          />
        ) : (
          items.map((t) => (
            <div className="task-row" key={t.id}>
              <div>
                <div className="status-line">
                  <strong>{t.title}</strong>
                  <Badge tone={t.status}>{stageLabel(t.status)}</Badge>
                  {t.status === 'PENDING' && new Date(t.dueAt) < new Date() && (
                    <Badge tone="danger">Vencida</Badge>
                  )}
                </div>
                <p className="muted small" style={{ marginTop: 8 }}>
                  <Link to={`/leads/${t.leadId}`}>
                    {t.lead?.name ?? 'Abrir lead'}
                  </Link>{' '}
                  · Vence {datetime(t.dueAt)}
                </p>
              </div>
              {t.status === 'PENDING' && (
                <div className="actions">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirm({ task: t, status: 'CANCELED' })}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => setConfirm({ task: t, status: 'COMPLETED' })}
                  >
                    <Icon name="check" />
                    Concluir
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
        {query.hasNextPage && (
          <Button
            variant="secondary"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Carregar mais
          </Button>
        )}
      </Card>
      {open && (
        <Modal title="Criar tarefa" onClose={() => setOpen(false)}>
          <form
            className="stack"
            onSubmit={form.handleSubmit((d) => create.mutate(d))}
          >
            <Field label="Lead">
              <select required {...form.register('leadId')}>
                <option value="">Selecione um lead</option>
                {leads.data?.items.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Título">
              <input required maxLength={200} {...form.register('title')} />
            </Field>
            <Field label="Vencimento · Horário de Brasília">
              <input
                type="datetime-local"
                required
                {...form.register('dueAt')}
              />
            </Field>
            {create.error && <ErrorPanel error={create.error} />}
            <Button type="submit" disabled={create.isPending}>
              Criar tarefa
            </Button>
          </form>
        </Modal>
      )}
      {confirm && (
        <Modal
          title={`${confirm.status === 'COMPLETED' ? 'Concluir' : 'Cancelar'} tarefa?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Voltar
              </Button>
              <Button
                disabled={change.isPending}
                onClick={() => change.mutate()}
              >
                Confirmar
              </Button>
            </>
          }
        >
          <p>{confirm.task.title}</p>
          <p className="muted small">
            Essa mudança é definitiva para a tarefa.
          </p>
          {change.error && <ErrorPanel error={change.error} />}
        </Modal>
      )}
    </div>
  );
}
