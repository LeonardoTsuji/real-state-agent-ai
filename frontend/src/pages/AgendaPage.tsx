import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/session";
import { datetime, localInput, toUTC, stageLabel } from "../lib/format";
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
} from "../components/ui";
import "./pages.css";
type VisitRow = {
  id: string;
  leadId: string;
  propertyId: string;
  startAt: string;
  endAt: string;
  status: string;
  lead?: { name: string };
  property?: { title: string };
  notes?: string;
};
type ReservationRow = VisitRow & {
  expiresAt: string;
  strategy: string;
  messageStatus?: string | null;
};
type BlockRow = { id: string; title: string; startAt: string; endAt: string };
export default function AgendaPage() {
  const client = useQueryClient();
  const [search] = useSearchParams();
  const [week, setWeek] = useState(0);
  const [view, setView] = useState<"day" | "week">("day");
  const [modal, setModal] = useState<"visit" | "reserve" | "block" | null>(
    null,
  );
  const [status, setStatus] = useState("");
  const [selectedVisit, setSelectedVisit] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState<unknown>();
  const [slot, setSlot] = useState<{ startAt: string; endAt: string } | null>(
    null,
  );
  const commandKeys = useRef(new Map<string, string>());
  const now = new Date(new Date().getTime() - 3 * 3600000);
  const base = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      view === "day"
        ? now.getUTCDate() + week
        : now.getUTCDate() - ((now.getUTCDay() + 6) % 7) + week * 7,
      3,
    ),
  );
  const from = base.toISOString(),
    to = new Date(
      base.getTime() + (view === "day" ? 1 : 7) * 86400000,
    ).toISOString();
  const agenda = useQuery({
    queryKey: ["agenda", from, to],
    queryFn: () =>
      api.get<{
        visits: VisitRow[];
        reservations: ReservationRow[];
        blocks: BlockRow[];
      }>(
        `/agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });
  const leads = useQuery({
    queryKey: ["leads", "form"],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          name: string;
          email?: string;
          phone?: string;
          preference?: { maxPriceCents?: number; neighborhoods?: string[] };
        }[];
      }>("/leads?limit=100"),
  });
  const properties = useQuery({
    queryKey: ["properties", "form"],
    queryFn: () =>
      api.get<{
        items: {
          id: string;
          title: string;
          address?: string;
          priceCents?: number;
          areaM2?: number;
        }[];
      }>("/properties?limit=100"),
  });
  const create = useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) => {
      const signature = JSON.stringify({ path, body });
      if (!commandKeys.current.has(signature))
        commandKeys.current.set(signature, crypto.randomUUID());
      return api.post(path, body, commandKeys.current.get(signature));
    },
    onSuccess: () => {
      setModal(null);
      commandKeys.current.clear();
      setSlot(null);
      setNotice("Horário registrado com sucesso.");
      void client.invalidateQueries({ queryKey: ["agenda"] });
    },
  });
  const decide = useMutation({
    mutationFn: ({
      id,
      confirmed,
      event,
    }: {
      id: string;
      confirmed?: boolean;
      event?: "NO_RESPONSE" | "SEND_FAILED";
    }) =>
      api.post(
        `/scheduling/reservations/${id}/simulate-response`,
        event ? { event } : { confirmed },
        crypto.randomUUID(),
      ),
    onSuccess: (_result, variables) => {
      setNotice(
        variables.event === "SEND_FAILED"
          ? "Falha de envio simulada. A pré-reserva continua válida até expirar."
          : variables.event === "NO_RESPONSE"
            ? "Ausência de resposta simulada. O horário foi liberado."
            : "Resposta do cliente registrada.",
      );
      void client.invalidateQueries({ queryKey: ["agenda"] });
    },
  });
  const unblock = useMutation({
    mutationFn: (id: string) => api.delete(`/scheduling/blocks/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["agenda"] }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    let times: { startAt: string; endAt: string };
    try {
      setFormError(undefined);
      times = {
        startAt: toUTC(String(f.get("startAt"))),
        endAt: toUTC(String(f.get("endAt"))),
      };
      if (times.endAt <= times.startAt)
        throw new Error("O término deve ser depois do início.");
      if (
        modal === "reserve" &&
        f.get("strategy") === "RESCHEDULE" &&
        !f.get("visitId")
      )
        throw new Error("Selecione a visita que será antecipada.");
    } catch (error) {
      setFormError(error);
      return;
    }
    if (modal === "block")
      create.mutate({
        path: "/scheduling/blocks",
        body: { ...times, title: f.get("title") },
      });
    else if (modal === "reserve")
      create.mutate({
        path: "/scheduling/reservations",
        body: {
          ...times,
          leadId: f.get("leadId"),
          propertyId: f.get("propertyId"),
          strategy: f.get("strategy"),
          visitId: f.get("visitId") || undefined,
          message: f.get("message") || undefined,
        },
      });
    else
      create.mutate({
        path: "/visits",
        body: {
          ...times,
          leadId: f.get("leadId"),
          propertyId: f.get("propertyId"),
          notes: f.get("notes") || undefined,
        },
      });
  }
  const days = Array.from(
    { length: view === "day" ? 1 : 7 },
    (_, i) => new Date(base.getTime() + i * 86400000),
  );
  const visits =
    agenda.data?.visits.filter((v) => !status || v.status === status) || [];
  const focused =
    visits.find((v) => v.id === selectedVisit) ||
    visits.find((v) => v.leadId === search.get("leadId")) ||
    visits.find((v) => v.status === "SCHEDULED");
  const focusedLead = leads.data?.items.find((l) => l.id === focused?.leadId);
  const focusedProperty = properties.data?.items.find(
    (p) => p.id === focused?.propertyId,
  );
  return (
    <div className="page-stack">
      <PageHeader
        title="Agenda de visitas"
        subtitle="Organize seu dia, conecte clientes e transforme visitas em oportunidades."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal("block")}>
              Bloquear horário
            </Button>
            <Button onClick={() => setModal("visit")}>
              <Icon name="add" />
              Agendar visita
            </Button>
          </>
        }
      />
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <div className="toolbar">
        <div className="actions">
          <Button
            variant={view === "day" ? "primary" : "secondary"}
            onClick={() => {
              setView("day");
              setWeek(0);
            }}
          >
            Dia
          </Button>
          <Button
            variant={view === "week" ? "primary" : "secondary"}
            onClick={() => {
              setView("week");
              setWeek(0);
            }}
          >
            Semana
          </Button>
        </div>
        <div className="actions">
          <Button variant="secondary" onClick={() => setWeek((w) => w - 1)}>
            ←
          </Button>
          <Button variant="secondary" onClick={() => setWeek(0)}>
            Hoje
          </Button>
          <Button variant="secondary" onClick={() => setWeek((w) => w + 1)}>
            →
          </Button>
        </div>
        <strong>
          {new Intl.DateTimeFormat("pt-BR", {
            month: "long",
            year: "numeric",
            timeZone: "America/Sao_Paulo",
          }).format(base)}
        </strong>
        <select
          className="input"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status da visita"
        >
          <option value="">Todas as visitas</option>
          <option value="SCHEDULED">Agendadas</option>
          <option value="COMPLETED">Concluídas</option>
          <option value="CANCELED">Canceladas</option>
        </select>
      </div>
      {agenda.isLoading ? (
        <Loading />
      ) : agenda.isError ? (
        <ErrorPanel
          error={agenda.error}
          onRetry={() => void agenda.refetch()}
        />
      ) : (
        <div className="agenda-layout">
          <Card>
            <div className={view === "day" ? "agenda-timeline" : "agenda-days"}>
              {days.map((day) => (
                <div className="agenda-day" key={day.toISOString()}>
                  <small className="muted">
                    {new Intl.DateTimeFormat("pt-BR", {
                      weekday: "short",
                      timeZone: "America/Sao_Paulo",
                    })
                      .format(day)
                      .toUpperCase()}
                  </small>
                  <h2>
                    {view === "day"
                      ? new Intl.DateTimeFormat("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        }).format(day)
                      : day.getUTCDate()}
                  </h2>
                  {visits
                    .filter(
                      (v) =>
                        new Date(v.startAt).getTime() >= day.getTime() &&
                        new Date(v.startAt).getTime() <
                          day.getTime() + 86400000,
                    )
                    .map((v) => (
                      <div
                        className={`agenda-event ${v.status === "CANCELED" ? "cancelled" : ""}`}
                        key={v.id}
                      >
                        <small>
                          {new Intl.DateTimeFormat("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "America/Sao_Paulo",
                          }).format(new Date(v.startAt))}
                        </small>
                        <Link to={`/visitas/${v.id}`}>
                          <strong>{v.lead?.name || "Visita agendada"}</strong>
                        </Link>
                        <Button
                          variant="secondary"
                          onClick={() => setSelectedVisit(v.id)}
                        >
                          Ver detalhes
                        </Button>
                        <small>{v.property?.title || "Ver imóvel"}</small>
                        <Badge>
                          {v.status === "COMPLETED"
                            ? "Concluída"
                            : v.status === "CANCELED"
                              ? "Cancelada"
                              : "Confirmada"}
                        </Badge>
                        {v.status === "CANCELED" && (
                          <Button
                            variant="copilot"
                            onClick={() => {
                              setSlot({ startAt: v.startAt, endAt: v.endAt });
                              setModal("reserve");
                            }}
                          >
                            Propor encaixe
                          </Button>
                        )}
                      </div>
                    ))}
                  {agenda.data?.blocks
                    .filter(
                      (b) =>
                        new Date(b.startAt).getTime() >= day.getTime() &&
                        new Date(b.startAt).getTime() <
                          day.getTime() + 86400000,
                    )
                    .map((b) => (
                      <div className="agenda-event" key={b.id}>
                        <strong>{b.title}</strong>
                        <small>Bloqueio pessoal</small>
                        <Button
                          variant="secondary"
                          disabled={unblock.isPending}
                          onClick={() => unblock.mutate(b.id)}
                        >
                          Liberar
                        </Button>
                      </div>
                    ))}
                </div>
              ))}
            </div>
            {!visits.length && (
              <Empty
                title={
                  view === "day"
                    ? "Nenhuma visita neste dia"
                    : "Nenhuma visita nesta semana"
                }
                description="Planeje uma nova visita para começar."
              />
            )}
          </Card>
          <div className="page-stack">
            {focused && (
              <Card>
                <h2>Detalhes do agendamento</h2>
                <Badge
                  tone={focused.status === "SCHEDULED" ? "primary" : "success"}
                >
                  {focused.status === "SCHEDULED"
                    ? "Visita presencial"
                    : focused.status === "CANCELED"
                      ? "Visita cancelada"
                      : "Visita concluída"}
                </Badge>
                <div className="person-cell" style={{ marginTop: 20 }}>
                  <span className="avatar">
                    {(focused.lead?.name || "Cliente")
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>{focused.lead?.name}</strong>
                    <small className="muted">
                      {focusedLead?.phone ||
                        focusedLead?.email ||
                        "Contato no detalhe do lead"}
                    </small>
                  </div>
                </div>
                <div className="match-score">
                  <small className="muted">IMÓVEL SELECIONADO</small>
                  <h3 style={{ margin: "10px 0" }}>
                    {focused.property?.title}
                  </h3>
                  <p className="muted">
                    {focusedProperty?.address || "Veja localização no dossiê"}
                  </p>
                  <Link to={`/imoveis/${focused.propertyId}`}>
                    Abrir dossiê completo →
                  </Link>
                </div>
                <p>
                  <strong>Data e início</strong>
                  <br />
                  {datetime(focused.startAt)}
                </p>
                <p>
                  <strong>Término</strong>
                  <br />
                  {datetime(focused.endAt)}
                </p>
                <p>
                  <strong>Observações operacionais</strong>
                  <br />
                  {focused.notes || "Nenhuma observação registrada."}
                </p>
                <div className="actions">
                  <Link to={`/visitas/${focused.id}?action=complete`}>
                    <Button disabled={focused.status !== "SCHEDULED"}>
                      Concluir visita
                    </Button>
                  </Link>
                  <Link to={`/visitas/${focused.id}?action=reschedule`}>
                    <Button
                      variant="secondary"
                      disabled={focused.status !== "SCHEDULED"}
                    >
                      Remarcar
                    </Button>
                  </Link>
                  <Link to={`/visitas/${focused.id}?action=cancel`}>
                    <Button
                      variant="danger"
                      disabled={focused.status !== "SCHEDULED"}
                    >
                      Cancelar
                    </Button>
                  </Link>
                </div>
              </Card>
            )}
            <div className="copilot-banner">
              <Icon name="auto_awesome" />
              <div>
                <strong>Encaixe inteligente</strong>
                <p className="muted">
                  Um horário livre pode aproximar seu cliente do imóvel ideal.
                </p>
                <Button variant="copilot" onClick={() => setModal("reserve")}>
                  Propor encaixe
                </Button>
              </div>
            </div>
            <Card>
              <h2>Pré-reservas</h2>
              <Badge>WhatsApp simulado</Badge>
              {!agenda.data?.reservations.length ? (
                <p className="muted">Nenhum convite aguardando resposta.</p>
              ) : (
                agenda.data.reservations.map((r) => (
                  <div className="agenda-event" key={r.id}>
                    <strong>
                      {r.lead?.name ||
                        leads.data?.items.find((l) => l.id === r.leadId)
                          ?.name ||
                        "Cliente"}
                    </strong>
                    <small>
                      {r.property?.title ||
                        properties.data?.items.find(
                          (p) => p.id === r.propertyId,
                        )?.title}
                    </small>
                    <p>{datetime(r.startAt)}</p>
                    <Badge>{stageLabel(r.status)}</Badge>
                    {r.messageStatus && (
                      <Badge
                        tone={
                          r.messageStatus === "FAILED" ? "danger" : "neutral"
                        }
                      >
                        {r.messageStatus === "FAILED"
                          ? "Falha no envio simulado"
                          : r.messageStatus === "SENT"
                            ? "Convite enviado · simulado"
                            : "Convite na fila · simulado"}
                      </Badge>
                    )}
                    <small>Validade: {datetime(r.expiresAt)}</small>
                    {r.status === "PENDING" && (
                      <div className="actions">
                        <Button
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, confirmed: true })
                          }
                        >
                          Simular aceite
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, confirmed: false })
                          }
                        >
                          Simular recusa
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, event: "NO_RESPONSE" })
                          }
                        >
                          Simular ausência de resposta
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={decide.isPending}
                          onClick={() =>
                            decide.mutate({ id: r.id, event: "SEND_FAILED" })
                          }
                        >
                          Simular falha no envio
                        </Button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </Card>
            {decide.isError && <ErrorPanel error={decide.error} />}{" "}
            {unblock.isError && <ErrorPanel error={unblock.error} />}
            <Card>
              <h2>Seu dia, com clareza</h2>
              <p>
                <strong>
                  {visits.filter((v) => v.status === "SCHEDULED").length}
                </strong>{" "}
                visitas agendadas
              </p>
              <p>
                <strong>
                  {visits.filter((v) => v.status === "COMPLETED").length}
                </strong>{" "}
                visitas concluídas
              </p>
              <p className="muted">Datas e horários no fuso de São Paulo.</p>
            </Card>
          </div>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "visit"
              ? "Agendar visita"
              : modal === "block"
                ? "Bloquear horário"
                : "Propor encaixe inteligente"
          }
          onClose={() => setModal(null)}
        >
          <form className="page-stack" onSubmit={submit}>
            {modal === "block" ? (
              <Field label="Título do bloqueio">
                <input
                  name="title"
                  className="input"
                  required
                  maxLength={120}
                />
              </Field>
            ) : (
              <>
                <Field label="Cliente">
                  <select
                    className="input"
                    name="leadId"
                    required
                    defaultValue={search.get("leadId") || ""}
                  >
                    <option value="">Selecione o lead</option>
                    {leads.data?.items.map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Imóvel">
                  <select
                    className="input"
                    name="propertyId"
                    required
                    defaultValue={search.get("propertyId") || ""}
                  >
                    <option value="">Selecione o imóvel</option>
                    {properties.data?.items.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <div className="form-grid">
              <Field label="Início (São Paulo)">
                <input
                  type="datetime-local"
                  name="startAt"
                  defaultValue={slot ? localInput(slot.startAt) : undefined}
                  className="input"
                  required
                />
              </Field>
              <Field label="Término (São Paulo)">
                <input
                  type="datetime-local"
                  name="endAt"
                  defaultValue={slot ? localInput(slot.endAt) : undefined}
                  className="input"
                  required
                />
              </Field>
            </div>
            {modal === "reserve" ? (
              <>
                <Field label="Estratégia">
                  <select name="strategy" className="input">
                    <option value="ADD_PROPERTY">
                      Adicionar outro imóvel ao roteiro
                    </option>
                    <option value="RESCHEDULE">
                      Antecipar visita existente
                    </option>
                  </select>
                </Field>
                <Field label="Visita a antecipar (opcional)">
                  <select name="visitId" className="input">
                    <option value="">Nenhuma</option>
                    {agenda.data?.visits
                      .filter((v) => v.status === "SCHEDULED")
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.lead?.name} · {datetime(v.startAt)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Mensagem do convite">
                  <textarea
                    name="message"
                    className="input"
                    defaultValue="Olá! Temos um horário disponível para conhecer este imóvel. Podemos confirmar?"
                  />
                </Field>
                <div className="notice">
                  Envio via WhatsApp simulado. A pré-reserva dura até 45
                  minutos, limitada ao início da visita.
                </div>
              </>
            ) : (
              modal === "visit" && (
                <Field label="Observações operacionais">
                  <textarea name="notes" className="input" maxLength={2000} />
                </Field>
              )
            )}
            {(leads.isError || properties.isError) && (
              <ErrorPanel error={leads.error || properties.error} />
            )}{" "}
            {(create.isError || formError !== undefined) && (
              <ErrorPanel error={formError || create.error} />
            )}
            <Button type="submit" disabled={create.isPending}>
              {create.isPending
                ? "Registrando..."
                : modal === "reserve"
                  ? "Confirmar envio simulado"
                  : modal === "block"
                    ? "Bloquear horário"
                    : "Confirmar agendamento"}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
