import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/session";
import { datetime, stageLabel, localInput, toUTC } from "../lib/format";
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
} from "../components/ui";
import "./pages.css";
type Visit = {
  id: string;
  leadId: string;
  propertyId: string;
  startAt: string;
  endAt: string;
  status: string;
  notes?: string;
  lead?: { name: string };
  property?: { title: string; address?: string; neighborhood?: string };
  checkedInAt?: string;
  checkIn?: { at?: string };
  checklist?: Record<string, boolean>;
  feedback?: Record<string, unknown>;
  feedbackDraft?: Record<string, unknown>;
};
export default function VisitPage() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [modal, setModal] = useState<
    "cancel" | "reschedule" | "complete" | null
  >(() => {
    const action = search.get("action");
    return action === "cancel" ||
      action === "reschedule" ||
      action === "complete"
      ? action
      : null;
  });
  const [rating, setRating] = useState(4);
  const [feedback, setFeedback] = useState("");
  const [localChecklist, setLocalChecklist] = useState<Record<
    string,
    boolean
  > | null>(null);
  const [notice, setNotice] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [formError, setFormError] = useState<unknown>();
  const commandKeys = useRef(new Map<string, string>());
  const visit = useQuery({
    queryKey: ["visit", id],
    queryFn: () => api.get<Visit>(`/visits/${id}`),
  });
  const leadState = useQuery({
    queryKey: ["lead-stage", visit.data?.leadId],
    queryFn: () => api.get<{ stage: string }>(`/leads/${visit.data?.leadId}`),
    enabled: !!visit.data?.leadId,
  });
  useEffect(() => {
    if (visit.data) {
      setLocalChecklist(null);
      setFeedback(
        String(
          visit.data.feedbackDraft?.notes || visit.data.feedback?.notes || "",
        ),
      );
      setRating(
        Number(
          visit.data.feedbackDraft?.rating || visit.data.feedback?.rating || 4,
        ),
      );
    }
  }, [visit.data?.id]);
  const report = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/commercial/documents", {
        kind: "VISIT_REPORT",
        visitId: id,
        title: `Relatório de visita · ${visit.data?.lead?.name || "Cliente"}`,
      }),
    onSuccess: (d) => navigate(`/documentos/${d.id}`),
  });
  const mutation = useMutation({
    mutationFn: ({
      path,
      body,
      patch,
    }: {
      path: string;
      body: unknown;
      patch?: boolean;
    }) => {
      const signature = JSON.stringify({ path, body });
      if (!commandKeys.current.has(signature))
        commandKeys.current.set(signature, crypto.randomUUID());
      return patch
        ? api.patch(path, body)
        : api.post(path, body, commandKeys.current.get(signature));
    },
    onSuccess: () => {
      setModal(null);
      commandKeys.current.clear();
      setNotice("Informações registradas com sucesso.");
      void client.invalidateQueries({ queryKey: ["visit", id] });
      void client.invalidateQueries({ queryKey: ["agenda"] });
    },
  });
  if (visit.isLoading) return <Loading />;
  if (visit.isError)
    return (
      <ErrorPanel error={visit.error} onRetry={() => void visit.refetch()} />
    );
  const v = visit.data!;
  const active = v.status === "SCHEDULED";
  const checked = !!(v.checkedInAt || v.checkIn?.at);
  const checklist = localChecklist ?? v.checklist ?? {};
  const transitions: Record<string, string[]> = {
    NEW: ["CONTACTED", "LOST"],
    CONTACTED: ["QUALIFIED", "LOST"],
    QUALIFIED: ["VISIT_SCHEDULED", "NEGOTIATION", "LOST"],
    VISIT_SCHEDULED: ["QUALIFIED", "NEGOTIATION", "LOST"],
    NEGOTIATION: ["WON", "LOST"],
    WON: [],
    LOST: ["CONTACTED"],
  };
  const nextStages = leadState.data
    ? transitions[leadState.data.stage] || []
    : [];
  const items = [
    "Conhecer ambientes e iluminação",
    "Conferir acabamento e conservação",
    "Avaliar localização e acesso",
    "Verificar condomínio e despesas",
    "Revisar necessidades do cliente",
  ];
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setFormError(undefined);
    if (
      modal === "reschedule" &&
      String(f.get("endAt")) <= String(f.get("startAt"))
    ) {
      setFormError(new Error("O término deve ser depois do início."));
      return;
    }
    if (modal === "cancel")
      mutation.mutate({
        path: `/visits/${id}/cancel`,
        body: { reason: f.get("reason") },
      });
    if (modal === "reschedule")
      mutation.mutate({
        path: `/visits/${id}`,
        patch: true,
        body: {
          startAt: toUTC(String(f.get("startAt"))),
          endAt: toUTC(String(f.get("endAt"))),
          reason: f.get("reason"),
        },
      });
    if (modal === "complete") {
      const nextStage = f.get("nextStage");
      const title = f.get("taskTitle");
      mutation.mutate({
        path: `/visits/${id}/complete`,
        body: {
          feedback: {
            rating,
            notes: feedback,
            interest: f.get("interest"),
            positivePoints: f.get("positivePoints"),
            concerns: f.get("concerns"),
          },
          nextStage: nextStage || undefined,
          task: title
            ? {
                title,
                dueAt: toUTC(String(f.get("dueAt"))),
              }
            : undefined,
        },
      });
    }
  }
  return (
    <div className="page-stack">
      <Link to="/agenda">← Voltar para a agenda</Link>
      <PageHeader
        title={
          v.status === "COMPLETED" ? "Visita concluída" : "Detalhes da visita"
        }
        subtitle={datetime(v.startAt)}
        actions={
          <>
            <Button
              variant="secondary"
              disabled={report.isPending}
              onClick={() => report.mutate()}
            >
              Gerar relatório
            </Button>
            <Button
              variant="secondary"
              disabled={!active}
              onClick={() => setModal("reschedule")}
            >
              Remarcar
            </Button>
            <Button
              variant="danger"
              disabled={!active}
              onClick={() => setModal("cancel")}
            >
              Cancelar visita
            </Button>
          </>
        }
      />
      {report.isError && <ErrorPanel error={report.error} />}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <div className="visit-hero">
        <Badge>
          {v.status === "COMPLETED"
            ? "Visita concluída"
            : v.status === "CANCELED"
              ? "Visita cancelada"
              : "Visita confirmada"}
        </Badge>
        <h1>{v.property?.title || "Visita ao imóvel"}</h1>
        <p>
          <Icon name="person" />
          {v.lead?.name || "Cliente"} · <Icon name="location_on" />
          {v.property?.address ||
            v.property?.neighborhood ||
            "Localização no dossiê"}
        </p>
        <p>
          {datetime(v.startAt)} → {datetime(v.endAt)}
        </p>
        <div className="actions">
          <Link to={`/leads/${v.leadId}`}>
            <Button variant="secondary">Ver lead</Button>
          </Link>
          <Link to={`/imoveis/${v.propertyId}`}>
            <Button variant="secondary">Ver dossiê</Button>
          </Link>
        </div>
      </div>
      <div className="dossier-layout">
        <div className="page-stack">
          <Card>
            <h2>Check-in no local</h2>
            <p className="muted">
              Registre a chegada para iniciar sua visita acompanhada.
            </p>
            {checked ? (
              <div className="toast">
                Presença registrada ·{" "}
                {datetime(v.checkedInAt || v.checkIn?.at || v.startAt)}
              </div>
            ) : (
              <div className="actions">
                <Button
                  disabled={!active || mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      path: `/visits/${id}/check-in`,
                      body: { mode: "MANUAL" },
                    })
                  }
                >
                  <Icon name="location_on" />
                  Confirmar chegada
                </Button>
                <Button
                  variant="secondary"
                  disabled={!active || mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      path: `/visits/${id}/check-in`,
                      body: { mode: "SIMULATED_LOCATION" },
                    })
                  }
                >
                  Simular localização
                </Button>
              </div>
            )}
            <p className="muted">
              Localização demonstrativa; sem captura de GPS.
            </p>
          </Card>
          <Card>
            <h2>Roteiro da visita</h2>
            <p className="muted">Um olhar completo para ajudar na decisão.</p>
            <div className="checklist">
              {items.map((item, i) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={!!checklist[String(i)]}
                    disabled={!active || mutation.isPending}
                    onChange={(e) => {
                      const previous = client.getQueryData<Visit>([
                        "visit",
                        id,
                      ]);
                      const items = {
                        ...checklist,
                        [String(i)]: e.target.checked,
                      };
                      setLocalChecklist(items);
                      client.setQueryData(["visit", id], {
                        ...v,
                        checklist: items,
                      });
                      mutation.mutate(
                        {
                          path: `/visits/${id}/checklist`,
                          patch: true,
                          body: { items },
                        },
                        {
                          onError: () => {
                            setLocalChecklist(previous?.checklist ?? null);
                            client.setQueryData(["visit", id], previous);
                          },
                        },
                      );
                    }}
                  />
                  {item}
                </label>
              ))}
            </div>
          </Card>
          <Card>
            <h2>Registro da experiência</h2>
            <div className="notice">
              Fotos, áudio e transcrição são assets de demonstração.
            </div>
            <div className="toolbar">
              <img
                src="/assets/property-1.jpg"
                width={150}
                alt="Ambiente demonstrativo"
              />
              <img
                src="/assets/property-2.jpg"
                width={150}
                alt="Outro ambiente demonstrativo"
              />
            </div>
            <p className="muted">
              Use o feedback abaixo para registrar a opinião do cliente.
            </p>
            <textarea
              className="input"
              rows={4}
              aria-label="Rascunho de feedback"
              placeholder="Percepções, pontos positivos e dúvidas..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
            <div className="actions">
              <Button
                variant="secondary"
                disabled={!active || mutation.isPending}
                onClick={() =>
                  mutation.mutate({
                    path: `/visits/${id}/feedback-draft`,
                    patch: true,
                    body: { feedback: { rating, notes: feedback } },
                  })
                }
              >
                Salvar rascunho
              </Button>
              <Button
                disabled={!active || mutation.isPending}
                onClick={() => setModal("complete")}
              >
                Concluir visita e avaliar <Icon name="arrow_forward" />
              </Button>
            </div>
            {v.feedbackDraft && (
              <p className="muted">
                Rascunho salvo:{" "}
                {String(v.feedbackDraft.notes || "Sem observações")}
              </p>
            )}
            {v.feedback && (
              <div className="page-stack">
                <h3>Feedback registrado</h3>
                <div className="toolbar">
                  <Badge tone="success">
                    {String(v.feedback.rating || "—")} / 5 estrelas
                  </Badge>
                  <Badge>
                    {v.feedback.interest === "HIGH"
                      ? "Interesse alto"
                      : v.feedback.interest === "MEDIUM"
                        ? "Interesse moderado"
                        : "Interesse baixo"}
                  </Badge>
                </div>
                <p>
                  {String(v.feedback.notes || "Sem observações adicionais")}
                </p>
                {!!v.feedback.positivePoints && (
                  <p>
                    <strong>Pontos positivos:</strong>{" "}
                    {String(v.feedback.positivePoints)}
                  </p>
                )}
                {!!v.feedback.concerns && (
                  <p>
                    <strong>Pontos de atenção:</strong>{" "}
                    {String(v.feedback.concerns)}
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
        <div className="page-stack">
          <Card>
            <h2>Resumo da visita</h2>
            <p>
              <strong>Cliente</strong>
              <br />
              {v.lead?.name || "Ver detalhe do lead"}
            </p>
            <p>
              <strong>Imóvel</strong>
              <br />
              {v.property?.title || "Ver dossiê"}
            </p>
            <p>
              <strong>Início</strong>
              <br />
              {datetime(v.startAt)}
            </p>
            <p>
              <strong>Término</strong>
              <br />
              {datetime(v.endAt)}
            </p>
            <p>
              <strong>Observações</strong>
              <br />
              {v.notes || "Nenhuma observação"}
            </p>
            <Badge>Portaria e calendário simulados</Badge>
          </Card>
          <div className="copilot-banner">
            <Icon name="auto_awesome" />
            <div>
              <strong>O próximo passo importa</strong>
              <p>
                Ao concluir, você pode atualizar o estágio do lead e criar um
                acompanhamento.
              </p>
            </div>
          </div>
        </div>
      </div>
      {(mutation.isError || formError !== undefined) && (
        <ErrorPanel error={formError || mutation.error} />
      )}{" "}
      {modal && (
        <Modal
          title={
            modal === "cancel"
              ? "Cancelar visita"
              : modal === "reschedule"
                ? "Remarcar visita"
                : "Concluir visita · Feedback"
          }
          onClose={() => setModal(null)}
        >
          <form className="page-stack" onSubmit={submit}>
            {modal === "cancel" ? (
              <>
                <p>
                  O horário será liberado. O motivo pessoal não altera
                  automaticamente a afinidade ou o estágio do lead.
                </p>
                <Field label="Motivo do cancelamento">
                  <textarea
                    name="reason"
                    className="input"
                    required
                    maxLength={1000}
                    placeholder="Descreva o motivo..."
                  />
                </Field>
              </>
            ) : modal === "reschedule" ? (
              <>
                <Field label="Novo início (São Paulo)">
                  <input
                    name="startAt"
                    defaultValue={localInput(v.startAt)}
                    type="datetime-local"
                    className="input"
                    required
                  />
                </Field>
                <Field label="Novo término (São Paulo)">
                  <input
                    name="endAt"
                    defaultValue={localInput(v.endAt)}
                    type="datetime-local"
                    className="input"
                    required
                  />
                </Field>
                <Field label="Motivo">
                  <textarea name="reason" className="input" required />
                </Field>
              </>
            ) : (
              <>
                <Field label="Avaliação geral">
                  <div className="feedback-rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        className={rating === n ? "selected" : ""}
                        type="button"
                        key={n}
                        onClick={() => setRating(n)}
                        aria-label={`${n} estrelas`}
                      >
                        {n} ★
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Interesse do cliente">
                  <select className="input" name="interest">
                    <option value="HIGH">Alto · deseja avançar</option>
                    <option value="MEDIUM">Médio · precisa avaliar</option>
                    <option value="LOW">Baixo · buscar alternativas</option>
                  </select>
                </Field>
                <Field label="Pontos positivos">
                  <textarea className="input" name="positivePoints" />
                </Field>
                <Field label="Pontos de atenção">
                  <textarea className="input" name="concerns" />
                </Field>
                <Field label="Observações">
                  <textarea
                    className="input"
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                  />
                </Field>
                <Field label="Atualizar estágio (opcional)">
                  <select
                    name="nextStage"
                    className="input"
                    disabled={!leadState.data}
                  >
                    <option value="">Manter estágio atual</option>
                    {nextStages.map((s) => (
                      <option value={s} key={s}>
                        {stageLabel(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Próxima tarefa (opcional)">
                  <input
                    name="taskTitle"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="input"
                    placeholder="Enviar proposta comparativa"
                  />
                </Field>
                <Field label="Prazo da tarefa (São Paulo)">
                  <input
                    name="dueAt"
                    type="datetime-local"
                    className="input"
                    required={!!taskTitle.trim()}
                  />
                </Field>
              </>
            )}
            {(mutation.isError || formError !== undefined) && (
              <ErrorPanel error={formError || mutation.error} />
            )}
            <Button
              variant={modal === "cancel" ? "danger" : "primary"}
              type="submit"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Salvando..."
                : modal === "cancel"
                  ? "Confirmar cancelamento"
                  : modal === "reschedule"
                    ? "Confirmar remarcação"
                    : "Concluir e registrar feedback"}
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
