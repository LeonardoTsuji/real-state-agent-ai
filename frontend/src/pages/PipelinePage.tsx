import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/session";
import { money, parseMoney, stageLabel } from "../lib/format";
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
type Deal = {
  id: string;
  title: string;
  leadId: string;
  propertyId?: string;
  stage: string;
  estimatedValueCents: number;
  commissionBps: number;
};
type Metrics = {
  total: number;
  vgvCents: number;
  expectedCommissionCents: number;
  conversionPercent: number;
  goalProgressPercent: number;
  monthlyGoalCents: number;
  wonCommissionCents: number;
  byStage: {
    stage: string;
    count: number;
    valueCents: number;
    commissionCents: number;
  }[];
};
const stages = [
  "FIRST_CONTACT",
  "QUALIFICATION",
  "VISIT_SCHEDULED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
];
export default function PipelinePage() {
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [table, setTable] = useState(false);
  const [mobileStage, setMobileStage] = useState("FIRST_CONTACT");
  const [modal, setModal] = useState(false);
  const [formError, setFormError] = useState<unknown>();
  const data = useQuery({
    queryKey: ["pipeline", q, stage],
    queryFn: () =>
      api.get<{ items: Deal[]; metrics: Metrics }>(
        `/commercial/pipeline?${new URLSearchParams({ ...(q ? { q } : {}), ...(stage ? { stage } : {}) })}`,
      ),
  });
  const leads = useQuery({
    queryKey: ["leads", "deal-form"],
    queryFn: () =>
      api.get<{ items: { id: string; name: string }[] }>("/leads?limit=100"),
    enabled: modal,
  });
  const properties = useQuery({
    queryKey: ["properties", "deal-form"],
    queryFn: () =>
      api.get<{ items: { id: string; title: string; priceCents: number }[] }>(
        "/properties?limit=100",
      ),
    enabled: modal,
  });
  const create = useMutation({
    mutationFn: (body: unknown) =>
      api.post("/commercial/opportunities", body, crypto.randomUUID()),
    onSuccess: () => {
      setModal(false);
      void client.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/commercial/opportunities/${id}`, { stage }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["pipeline"] }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setFormError(undefined);
      create.mutate({
        title: f.get("title") || undefined,
        leadId: f.get("leadId"),
        propertyId: f.get("propertyId") || undefined,
        alternativePropertyId: f.get("alternativePropertyId") || undefined,
        estimatedValueCents: parseMoney(String(f.get("value"))),
        commissionBps: Math.round(Number(f.get("commission")) * 100),
      });
    } catch (err) {
      setFormError(err);
    }
  }
  const metrics = data.data?.metrics;
  return (
    <div className="page-stack">
      <PageHeader
        title="Funil de vendas"
        subtitle="Do primeiro contato à conquista. Veja seus negócios em movimento."
        actions={
          <Button onClick={() => setModal(true)}>
            <Icon name="add" />
            Nova oportunidade
          </Button>
        }
      />
      <div className="metric-grid pipeline-metrics">
        {[
          ["VGV em carteira", money(metrics?.vgvCents)],
          ["Comissão prevista", money(metrics?.expectedCommissionCents)],
          [
            "Negócios ativos",
            String(
              data.data?.items.filter(
                (d) => d.stage !== "WON" && d.stage !== "LOST",
              ).length || 0,
            ),
          ],
          ["Conversão", `${metrics?.conversionPercent || 0}%`],
          ["Meta mensal", `${metrics?.goalProgressPercent || 0}%`],
        ].map(([label, value]) => (
          <Card key={label}>
            <span className="metric-label">{label}</span>
            <div className="metric-value">
              {value.startsWith("R$") ? (
                <>
                  <span>R$</span>
                  <span>{value.slice(3)}</span>
                </>
              ) : (
                value
              )}
            </div>
            <small className="muted">
              {label === "Meta mensal"
                ? `${money(metrics?.wonCommissionCents)} de ${money(metrics?.monthlyGoalCents)}`
                : "Dados da sua carteira"}
            </small>
          </Card>
        ))}
      </div>
      <Card>
        <div className="toolbar">
          <input
            className="input"
            aria-label="Buscar negócios"
            placeholder="Buscar oportunidade..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            aria-label="Filtrar etapa"
            value={stage}
            onChange={(e) => {
              setStage(e.target.value);
              if (e.target.value) setMobileStage(e.target.value);
            }}
          >
            <option value="">Todos os estágios</option>
            {stages.map((s) => (
              <option value={s} key={s}>
                {stageLabel(s)}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => setTable(!table)}>
            <Icon name={table ? "view_kanban" : "table_rows"} />
            {table ? "Kanban" : "Tabela"}
          </Button>
        </div>
      </Card>
      {move.isError && <ErrorPanel error={move.error} />}{" "}
      <div className="copilot-banner">
        <Icon name="auto_awesome" />
        <div>
          <strong>Seu próximo contato faz diferença</strong>
          <p>
            {data.data?.items.filter((d) => d.stage === "PROPOSAL_SENT")
              .length || 0}{" "}
            oportunidades com proposta enviada. Revise as condições e organize
            os próximos acompanhamentos.
          </p>
        </div>
        <Link to="/tarefas">
          <Button variant="copilot">Organizar próximos contatos</Button>
        </Link>
      </div>
      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorPanel error={data.error} onRetry={() => void data.refetch()} />
      ) : !data.data?.items.length ? (
        <Empty
          title="Seu próximo negócio começa aqui"
          description="Crie uma oportunidade para acompanhar a negociação."
        />
      ) : table ? (
        <Card>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Oportunidade</th>
                  <th>Estágio</th>
                  <th>Valor</th>
                  <th>Comissão</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.data.items.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>
                      <Badge>{stageLabel(d.stage)}</Badge>
                    </td>
                    <td>{money(d.estimatedValueCents)}</td>
                    <td>
                      {money(
                        Math.round(
                          (d.estimatedValueCents * d.commissionBps) / 10000,
                        ),
                      )}
                    </td>
                    <td>
                      <Link to={`/negocios/${d.id}`}>Abrir negociação →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <>
          <div className="pipeline-tabs stage-tabs">
            {stages
              .filter((s) => !stage || stage === s)
              .map((s) => (
                <Button
                  variant={mobileStage === s ? "primary" : "secondary"}
                  key={s}
                  onClick={() => setMobileStage(s)}
                >
                  {stageLabel(s)}
                </Button>
              ))}
          </div>
          <div className="pipeline-board">
            {stages
              .filter((s) => !stage || s === stage)
              .map((s) => (
                <section
                  className={`pipeline-column ${mobileStage === s ? "mobile-active" : ""}`}
                  key={s}
                >
                  <h3>
                    {stageLabel(s)}{" "}
                    <Badge>
                      {data.data!.items.filter((d) => d.stage === s).length}
                    </Badge>
                  </h3>
                  <p
                    className="muted"
                    style={{ fontSize: 11, marginBottom: 14 }}
                  >
                    VGV{" "}
                    {money(
                      metrics?.byStage.find((c) => c.stage === s)?.valueCents,
                    )}{" "}
                    · Comissão{" "}
                    {money(
                      metrics?.byStage.find((c) => c.stage === s)
                        ?.commissionCents,
                    )}
                  </p>
                  {data
                    .data!.items.filter((d) => d.stage === s)
                    .map((d) => (
                      <article className="deal-card" key={d.id}>
                        <small className="muted">Oportunidade ativa</small>
                        <Link to={`/negocios/${d.id}`}>
                          <strong>{d.title}</strong>
                        </Link>
                        <div className="amount">
                          {money(d.estimatedValueCents)}
                        </div>
                        <p className="muted">
                          Comissão:{" "}
                          {money(
                            Math.round(
                              (d.estimatedValueCents * d.commissionBps) / 10000,
                            ),
                          )}
                        </p>
                        <select
                          className="input"
                          aria-label={`Mover ${d.title}`}
                          value={d.stage}
                          disabled={move.isPending || d.stage === "WON"}
                          onChange={(e) =>
                            move.mutate({ id: d.id, stage: e.target.value })
                          }
                        >
                          {stages.map((next) => (
                            <option
                              value={next}
                              key={next}
                              disabled={
                                next === "WON" || next === "PROPOSAL_SENT"
                              }
                            >
                              {stageLabel(next)}
                            </option>
                          ))}
                        </select>
                        <small className="muted">
                          Proposta e aceite são confirmados dentro do negócio.
                        </small>
                      </article>
                    ))}
                </section>
              ))}
          </div>
        </>
      )}
      {modal && (
        <Modal title="Nova oportunidade" onClose={() => setModal(false)}>
          <form className="page-stack" onSubmit={submit}>
            <Field label="Título (opcional)">
              <input name="title" className="input" />
            </Field>
            <Field label="Cliente">
              <select name="leadId" className="input" required>
                <option value="">Selecione o lead</option>
                {leads.data?.items.map((l) => (
                  <option value={l.id} key={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Imóvel principal">
              <select name="propertyId" className="input">
                <option value="">Selecionar depois</option>
                {properties.data?.items.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title} · {money(p.priceCents)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Alternativa (opcional)">
              <select name="alternativePropertyId" className="input">
                <option value="">Sem alternativa</option>
                {properties.data?.items.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Valor estimado em R$">
                <input
                  name="value"
                  className="input"
                  required
                  placeholder="1.380.000,00"
                />
              </Field>
              <Field label="Comissão (%)">
                <input
                  name="commission"
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  defaultValue={6}
                />
              </Field>
            </div>
            {(create.isError || formError !== undefined) && (
              <ErrorPanel error={formError || create.error} />
            )}
            <Button disabled={create.isPending} type="submit">
              Criar oportunidade
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
