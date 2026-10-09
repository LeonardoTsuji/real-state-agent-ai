import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/session";
import { money, parseMoney } from "../lib/format";
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
type PropertyRow = {
  id: string;
  title: string;
  code?: string;
  priceCents: number;
  city: string;
  neighborhood: string;
  bedrooms: number;
  parkingSpaces: number;
  areaM2?: number;
  purpose: string;
  type: string;
  compatibility?: { score: number | null };
  media?: string[];
  address?: string;
  condominiumCents?: number;
  iptuCents?: number;
  description?: string;
  availability?: string;
  amenities?: string[];
};
export default function PropertiesPage() {
  const client = useQueryClient();
  const [search, setSearch] = useSearchParams();
  const leadId = search.get("leadId") || "";
  const [q, setQ] = useState("");
  const [purpose, setPurpose] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("newest");
  const [price, setPrice] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [rooms, setRooms] = useState("");
  const [parking, setParking] = useState("");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"create" | "import" | null>(null);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{
    id: string;
    report?: {
      accepted: number;
      rows: { line: number; accepted: boolean; reasons?: string[] }[];
    };
  }>();
  const [importPreview, setImportPreview] = useState(false);
  const [formError, setFormError] = useState<unknown>();
  const importKey = useRef({ text: "", key: crypto.randomUUID() });
  const [associate, setAssociate] = useState<PropertyRow | null>(null);
  const [selectedLead, setSelectedLead] = useState(leadId);
  const [manualScore, setManualScore] = useState(50);
  const params = new URLSearchParams({ page: String(page), limit: "12", sort });
  if (q) params.set("q", q);
  if (purpose) params.set("purpose", purpose);
  if (type) params.set("type", type);
  if (price) params.set("maxPriceCents", price);
  if (leadId) params.set("leadId", leadId);
  if (neighborhood) params.set("neighborhood", neighborhood);
  if (rooms) params.set("minBedrooms", rooms);
  if (parking) params.set("minParkingSpaces", parking);
  const properties = useQuery({
    queryKey: ["properties", params.toString()],
    queryFn: () =>
      api.get<{ items: PropertyRow[]; total: number }>(`/properties?${params}`),
  });
  const leads = useQuery({
    queryKey: ["leads", "association"],
    queryFn: () =>
      api.get<{ items: { id: string; name: string }[] }>("/leads?limit=100"),
  });
  const create = useMutation({
    mutationFn: (body: unknown) => api.post("/properties", body),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ["properties"] });
    },
  });
  const association = useMutation({
    mutationFn: () =>
      api.post(`/leads/${selectedLead}/matches`, {
        propertyId: associate!.id,
        score: manualScore,
      }),
    onSuccess: () => {
      setAssociate(null);
      void client.invalidateQueries({ queryKey: ["leads"] });
    },
  });
  const importer = useMutation({
    mutationFn: () => {
      if (importKey.current.text !== importText)
        importKey.current = { text: importText, key: crypto.randomUUID() };
      return api.post<{ id: string }>(
        "/imports/properties",
        {
          idempotencyKey: importKey.current.key,
          rows: importText
            .trim()
            .split(/\r?\n/)
            .slice(1)
            .filter(Boolean)
            .map((line) => {
              const [
                title,
                priceCents,
                city,
                neighborhood,
                bedrooms,
                parkingSpaces,
              ] = line.split(";");
              return {
                title,
                priceCents: Number(priceCents),
                city,
                neighborhood,
                bedrooms: Number(bedrooms),
                parkingSpaces: Number(parkingSpaces),
                purpose: "SALE",
                type: "APARTMENT",
              };
            }),
        },
        importKey.current.key,
      );
    },
    onSuccess: (r) => {
      setImportResult(r);
      void client.invalidateQueries({ queryKey: ["properties"] });
    },
  });
  const importStatus = useQuery({
    queryKey: ["property-import", importResult?.id],
    queryFn: () =>
      api.get<NonNullable<typeof importResult>>(
        `/imports/properties/${importResult?.id}`,
      ),
    enabled: !!importResult?.id,
    refetchInterval: (query) => (query.state.data?.report ? false : 2000),
  });
  useEffect(() => {
    if (importStatus.data?.report)
      void client.invalidateQueries({ queryKey: ["properties"] });
  }, [client, importStatus.data?.report]);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setFormError(undefined);
      create.mutate({
        title: f.get("title"),
        description: f.get("description") || undefined,
        purpose: f.get("purpose"),
        type: f.get("type"),
        priceCents: parseMoney(String(f.get("price"))),
        city: f.get("city"),
        neighborhood: f.get("neighborhood"),
        bedrooms: Number(f.get("bedrooms")),
        parkingSpaces: Number(f.get("parkingSpaces")),
      });
    } catch (error) {
      setFormError(error);
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Catálogo de imóveis"
        subtitle="Seu portfólio, conectado às necessidades de cada cliente."
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal("import")}>
              <Icon name="upload" />
              Importar imóveis
            </Button>
            <Button onClick={() => setModal("create")}>
              <Icon name="add" />
              Novo imóvel
            </Button>
          </>
        }
      />
      <Card>
        <div className="toolbar">
          <input
            className="input"
            placeholder="Código, condomínio, endereço ou palavra-chave..."
            aria-label="Buscar imóveis"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Finalidade"
            value={purpose}
            onChange={(e) => {
              setPurpose(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Finalidade: todas</option>
            <option value="SALE">Venda</option>
            <option value="RENT">Locação</option>
          </select>
          <select
            className="input"
            aria-label="Tipo"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tipo: todos</option>
            <option value="APARTMENT">Apartamento</option>
            <option value="HOUSE">Casa</option>
            <option value="COMMERCIAL">Comercial</option>
            <option value="LAND">Terreno</option>
          </select>
          <select
            className="input"
            aria-label="Faixa de preço"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas as faixas</option>
            <option value="65000000">Até R$ 650.000</option>
            <option value="100000000">Até R$ 1.000.000</option>
            <option value="200000000">Até R$ 2.000.000</option>
          </select>
        </div>
        <div className="toolbar" style={{ marginTop: 14 }}>
          <select
            className="input"
            aria-label="Compatibilidade com cliente"
            value={leadId}
            onChange={(e) => {
              const params = new URLSearchParams(search);
              if (e.target.value) params.set("leadId", e.target.value);
              else params.delete("leadId");
              setSearch(params);
              setPage(1);
            }}
          >
            <option value="">Compatibilidade: selecionar cliente</option>
            {leads.data?.items.map((l) => (
              <option value={l.id} key={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            aria-label="Bairro"
            placeholder="Bairro..."
            value={neighborhood}
            onChange={(e) => {
              setNeighborhood(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="input"
            aria-label="Mínimo de quartos"
            value={rooms}
            onChange={(e) => {
              setRooms(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Quartos: todos</option>
            {[1, 2, 3, 4].map((n) => (
              <option value={n} key={n}>
                {n}+ quartos
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Mínimo de vagas"
            value={parking}
            onChange={(e) => {
              setParking(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Vagas: todas</option>
            {[1, 2, 3, 4].map((n) => (
              <option value={n} key={n}>
                {n}+ vagas
              </option>
            ))}
          </select>
          <Button
            variant="secondary"
            onClick={() => {
              setQ("");
              setType("");
              setPurpose("");
              setPrice("");
              setNeighborhood("");
              setRooms("");
              setParking("");
              setPage(1);
              setSearch({});
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </Card>
      {leadId && (
        <div className="copilot-banner">
          <Icon name="auto_awesome" />
          <div>
            <strong>Compatibilidade com o lead selecionado</strong>
            <p>
              A compatibilidade considera as preferências registradas do
              cliente.
            </p>
          </div>
          <Link to={`/leads/${leadId}`}>Voltar ao lead</Link>
        </div>
      )}
      <div className="toolbar">
        <span className="muted">
          {properties.data?.total || 0} imóveis encontrados
        </span>
        <select
          className="input"
          aria-label="Ordenar imóveis"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Mais recentes</option>
          <option value="price_asc">Menor preço</option>
          <option value="price_desc">Maior preço</option>
          <option value="area_desc">Maior área</option>
        </select>
      </div>
      {properties.isLoading ? (
        <Loading />
      ) : properties.isError ? (
        <ErrorPanel
          error={properties.error}
          onRetry={() => void properties.refetch()}
        />
      ) : !properties.data?.items.length ? (
        <Empty
          title="Nenhum imóvel encontrado"
          description="Ajuste os filtros ou cadastre um imóvel."
        />
      ) : (
        <>
          <div className="property-grid">
            {properties.data.items.map((p, i) => (
              <article className="property-card" key={p.id}>
                <div className="property-image">
                  <Link to={`/imoveis/${p.id}`}>
                    <img
                      src={
                        p.media?.[0] || `/assets/property-${(i % 6) + 1}.jpg`
                      }
                      alt={p.title}
                    />
                  </Link>
                  <Badge>
                    {p.compatibility?.score != null
                      ? `${p.compatibility.score}% de compatibilidade`
                      : "Portfólio exclusivo"}
                  </Badge>
                  <Badge className="property-code">
                    {p.code || "Disponível"}
                  </Badge>
                  <div className="photo-price">
                    <small>{p.purpose === "SALE" ? "VENDA" : "LOCAÇÃO"}</small>
                    <div>{money(p.priceCents)}</div>
                  </div>
                </div>
                <div className="property-body">
                  <h3>{p.title}</h3>
                  <small className="muted">
                    <Icon name="location_on" />
                    {p.address || `${p.neighborhood} · ${p.city}`}
                  </small>
                  <div className="property-specs">
                    <span>
                      <Icon name="square_foot" />
                      {p.areaM2 || "—"} m²
                    </span>
                    <span>
                      <Icon name="bed" />
                      {p.bedrooms}
                    </span>
                    <span>
                      <Icon name="directions_car" />
                      {p.parkingSpaces}
                    </span>
                  </div>
                  <p className="property-charges">
                    Condomínio:{" "}
                    <strong>
                      {p.condominiumCents
                        ? money(p.condominiumCents)
                        : "Sob consulta"}
                    </strong>{" "}
                    · IPTU:{" "}
                    <strong>
                      {p.iptuCents ? money(p.iptuCents) : "Sob consulta"}
                    </strong>
                  </p>
                  {!p.compatibility && (
                    <p className="property-description muted">
                      {p.description ||
                        "Conheça os detalhes e agende uma visita acompanhada."}
                    </p>
                  )}
                  {p.compatibility && (
                    <div className="match-score">
                      <strong>
                        {p.compatibility.score === null
                          ? "Preferências não definidas"
                          : `${p.compatibility.score}% de compatibilidade`}
                      </strong>
                      <span className="muted">
                        {" "}
                        · pelas preferências do cliente
                      </span>
                    </div>
                  )}
                  <div className="property-footer">
                    <Link to={`/imoveis/${p.id}`}>Ver dossiê</Link>
                    <Link
                      to={`/agenda?propertyId=${p.id}${leadId ? `&leadId=${leadId}` : ""}`}
                    >
                      <Button variant="secondary">
                        <Icon name="calendar_month" />
                        Visita
                      </Button>
                    </Link>
                    <Button
                      variant="copilot"
                      onClick={() => {
                        setAssociate(p);
                        setSelectedLead(leadId);
                        setManualScore(50);
                      }}
                    >
                      Associar lead
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="pagination">
            <span>
              {properties.data.total} imóveis · Página {page}
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
                disabled={page * 12 >= properties.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
      {modal === "create" && (
        <Modal title="Novo imóvel" onClose={() => setModal(null)}>
          <form className="page-stack" onSubmit={submit}>
            <Field label="Título">
              <input className="input" name="title" required maxLength={160} />
            </Field>
            <div className="form-grid">
              <Field label="Finalidade">
                <select className="input" name="purpose">
                  <option value="SALE">Venda</option>
                  <option value="RENT">Locação</option>
                </select>
              </Field>
              <Field label="Tipo">
                <select className="input" name="type">
                  <option value="APARTMENT">Apartamento</option>
                  <option value="HOUSE">Casa</option>
                  <option value="COMMERCIAL">Comercial</option>
                  <option value="LAND">Terreno</option>
                </select>
              </Field>
              <Field label="Preço em R$">
                <input
                  className="input"
                  name="price"
                  required
                  inputMode="decimal"
                  pattern="[0-9.]+(,[0-9]{1,2})?"
                />
              </Field>
              <Field label="Cidade">
                <input className="input" name="city" required />
              </Field>
              <Field label="Bairro">
                <input className="input" name="neighborhood" required />
              </Field>
              <Field label="Quartos">
                <input
                  className="input"
                  name="bedrooms"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={2}
                />
              </Field>
              <Field label="Vagas">
                <input
                  className="input"
                  name="parkingSpaces"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={1}
                />
              </Field>
            </div>
            <Field label="Descrição">
              <textarea className="input" name="description" />
            </Field>
            {(create.isError || formError !== undefined) && (
              <ErrorPanel error={formError || create.error} />
            )}
            <Button type="submit" disabled={create.isPending}>
              Salvar imóvel
            </Button>
          </form>
        </Modal>
      )}
      {associate && (
        <Modal
          title="Associar imóvel ao lead"
          onClose={() => setAssociate(null)}
        >
          <div className="page-stack">
            <strong>{associate.title}</strong>
            <p className="muted">
              Avalie a afinidade deste imóvel com o cliente antes de confirmar.
              Sua avaliação fica disponível no detalhe do lead.
            </p>
            <Field label="Lead">
              <select
                className="input"
                value={selectedLead}
                onChange={(e) => setSelectedLead(e.target.value)}
              >
                <option value="">Selecione o cliente</option>
                {leads.data?.items.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </Field>
            {leads.isError && <ErrorPanel error={leads.error} />}{" "}
            <Field label="Afinidade manual (0 a 100)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                step={1}
                value={manualScore}
                onChange={(event) => setManualScore(Number(event.target.value))}
              />
            </Field>
            {association.isError && <ErrorPanel error={association.error} />}
            <Button
              disabled={
                !selectedLead ||
                !Number.isInteger(manualScore) ||
                manualScore < 0 ||
                manualScore > 100 ||
                association.isPending
              }
              onClick={() => association.mutate()}
            >
              Confirmar associação
            </Button>
          </div>
        </Modal>
      )}
      {modal === "import" && (
        <Modal title="Importar imóveis" onClose={() => setModal(null)}>
          <div className="page-stack">
            <p className="muted">
              CSV: título;preço em centavos;cidade;bairro;quartos;vagas.
              Finalidade venda e tipo apartamento.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setImportText(await f.text());
                  setImportPreview(false);
                  setImportResult(undefined);
                }
              }}
            />
            <textarea
              className="input"
              rows={6}
              aria-label="CSV de imóveis"
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
                setImportPreview(false);
                setImportResult(undefined);
              }}
            />
            {importer.isError && <ErrorPanel error={importer.error} />}{" "}
            {importStatus.isError && <ErrorPanel error={importStatus.error} />}
            {importResult !== undefined &&
              (importStatus.data?.report ? (
                <div className="page-stack">
                  <div className="toast">
                    {importStatus.data.report.accepted} imóveis importados.
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Linha</th>
                          <th>Resultado</th>
                          <th>Detalhes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importStatus.data.report.rows.map((r) => (
                          <tr key={r.line}>
                            <td>{r.line}</td>
                            <td>{r.accepted ? "Importado" : "Revisar"}</td>
                            <td>{r.reasons?.join(", ") || "Dados válidos"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p role="status" className="muted">
                  Aguardando processamento da importação...
                </p>
              ))}
            {importPreview && (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Preço</th>
                      <th>Cidade/Bairro</th>
                      <th>Quartos/Vagas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importText
                      .trim()
                      .split(/\r?\n/)
                      .slice(1)
                      .filter(Boolean)
                      .map((line, i) => {
                        const [
                          title,
                          price,
                          city,
                          neighborhood,
                          rooms,
                          parking,
                        ] = line.split(";");
                        return (
                          <tr key={i}>
                            <td>{title || "Campo obrigatório ausente"}</td>
                            <td>{money(Number(price))}</td>
                            <td>
                              {city} / {neighborhood}
                            </td>
                            <td>
                              {rooms} / {parking}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
            <Button
              variant="secondary"
              disabled={!importText.trim() || importer.isPending}
              onClick={() => setImportPreview(true)}
            >
              Visualizar linhas
            </Button>
            <Button
              disabled={!importPreview || importer.isPending || !!importResult}
              onClick={() => importer.mutate()}
            >
              Confirmar importação
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
