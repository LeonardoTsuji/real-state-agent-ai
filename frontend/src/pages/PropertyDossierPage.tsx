import { useState, type FormEvent } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/session';
import { money, parseMoney } from '../lib/format';
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
type Property = {
  id: string;
  title: string;
  description?: string;
  priceCents: number;
  city: string;
  neighborhood: string;
  bedrooms: number;
  parkingSpaces: number;
  areaM2?: number;
  suites?: number;
  bathrooms?: number;
  condominiumCents?: number;
  iptuCents?: number;
  amenities?: string[];
  address?: string;
  code?: string;
  media?: string[];
  accessNotes?: string;
  purpose: string;
  type: string;
  availability?: string;
  subtype?: string;
};
export default function PropertyDossierPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [search] = useSearchParams();
  const leadId = search.get('leadId');
  const [gallery, setGallery] = useState<number | null>(null);
  const [entry, setEntry] = useState(30);
  const [term, setTerm] = useState(360);
  const [rate, setRate] = useState(10.5);
  const [modal, setModal] = useState<'edit' | 'delete' | null>(null);
  const [formError, setFormError] = useState<unknown>();
  const property = useQuery({
    queryKey: ['property', id],
    queryFn: () => api.get<Property>(`/properties/${id}`),
  });
  const match = useQuery({
    queryKey: ['compatibility', id, leadId],
    queryFn: () =>
      api.get<{
        score: number | null;
        criteria: { label: string; matched: boolean }[];
      }>(`/properties/${id}/compatibility?leadId=${leadId}`),
    enabled: !!leadId,
  });
  const doc = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/commercial/documents', {
        kind: 'DOSSIER',
        title: `Dossiê · ${property.data?.title}`,
        propertyId: id,
      }),
  });
  const update = useMutation({
    mutationFn: (body: unknown) => api.patch(`/properties/${id}`, body),
    onSuccess: () => {
      setModal(null);
      void client.invalidateQueries({ queryKey: ['property', id] });
      void client.invalidateQueries({ queryKey: ['properties'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/properties/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['properties'] });
      navigate('/imoveis');
    },
  });
  if (property.isLoading) return <Loading />;
  if (property.isError)
    return (
      <ErrorPanel
        error={property.error}
        onRetry={() => void property.refetch()}
      />
    );
  const p = property.data!;
  const images = p.media?.length
    ? p.media
    : Array.from({ length: 5 }, (_, i) => `/assets/dossier-${i + 1}.jpg`);
  const principal = Math.round(p.priceCents * (1 - entry / 100));
  const monthlyRate = Math.pow(1 + rate / 100, 1 / 12) - 1;
  const amortization = principal / term;
  const first = Math.round(amortization + principal * monthlyRate);
  const last = Math.round(amortization + amortization * monthlyRate);
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      setFormError(undefined);
      update.mutate({
        title: f.get('title'),
        description: f.get('description') || null,
        priceCents: parseMoney(String(f.get('price'))),
        city: f.get('city'),
        neighborhood: f.get('neighborhood'),
        address: f.get('address') || null,
        code: f.get('code') || null,
        purpose: f.get('purpose'),
        type: f.get('type'),
        subtype: f.get('subtype') || null,
        availability: f.get('availability'),
        areaM2: f.get('area') ? Number(f.get('area')) : null,
        bedrooms: Number(f.get('bedrooms')),
        parkingSpaces: Number(f.get('parkingSpaces')),
        suites: Number(f.get('suites')),
        bathrooms: Number(f.get('bathrooms')),
        condominiumCents: f.get('condominium')
          ? parseMoney(String(f.get('condominium')))
          : null,
        iptuCents: f.get('iptu') ? parseMoney(String(f.get('iptu'))) : null,
        amenities: String(f.get('amenities'))
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        accessNotes: f.get('accessNotes') || null,
      });
    } catch (error) {
      setFormError(error);
    }
  }
  return (
    <div className="page-stack">
      <div className="toolbar">
        <Link to="/imoveis">← Catálogo de imóveis</Link>
        <Badge>Dossiê exclusivo · interno</Badge>
        <Badge>Mídia demonstrativa</Badge>
      </div>
      <PageHeader
        title={p.title}
        subtitle={`${p.address || p.neighborhood} · ${p.city} ${p.code ? '· ' + p.code : ''}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setModal('edit')}>
              <Icon name="edit" />
              Editar imóvel
            </Button>
            <Button
              variant="danger"
              onClick={() => setModal('delete')}
              aria-label="Excluir imóvel"
            >
              <Icon name="delete" />
            </Button>
            <Button
              variant="secondary"
              onClick={() => doc.mutate()}
              disabled={doc.isPending}
            >
              <Icon name="picture_as_pdf" />
              Gerar dossiê
            </Button>
            <Link
              to={`/agenda?propertyId=${p.id}${leadId ? `&leadId=${leadId}` : ''}`}
            >
              <Button>
                <Icon name="calendar_month" />
                Agendar visita
              </Button>
            </Link>
          </>
        }
      />
      {doc.isError && <ErrorPanel error={doc.error} />}{' '}
      {doc.data && (
        <Link to={`/documentos/${doc.data.id}`}>Abrir dossiê gerado</Link>
      )}
      <div className="dossier-hero">
        <img
          src={images[0]}
          alt={`${p.title} · vista principal`}
          onClick={() => setGallery(0)}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setGallery(0);
          }}
        />
        <div className="dossier-thumbs">
          {images.slice(1, 5).map((image, i) => (
            <img
              src={image}
              alt={`Ambiente ${i + 2}`}
              key={image}
              onClick={() => setGallery(i + 1)}
            />
          ))}
        </div>
      </div>
      <Button variant="secondary" onClick={() => setGallery(0)}>
        <Icon name="photo_library" />
        Ver galeria completa
      </Button>
      <div className="dossier-layout">
        <div className="page-stack">
          <Card>
            <h2>Um novo capítulo começa aqui</h2>
            <p>
              {p.description ||
                'Conheça os ambientes, os detalhes e as possibilidades deste imóvel em uma visita acompanhada.'}
            </p>
            <div className="amenities">
              <div className="feature">
                <Icon name="square_foot" />
                {p.areaM2 || '—'} m² úteis
              </div>
              <div className="feature">
                <Icon name="bed" />
                {p.bedrooms} dormitórios
              </div>
              <div className="feature">
                <Icon name="directions_car" />
                {p.parkingSpaces} vagas
              </div>
              <div className="feature">
                <Icon name="bathtub" />
                {p.bathrooms || '—'} banheiros
              </div>
              <div className="feature">
                <Icon name="king_bed" />
                {p.suites || '—'} suítes
              </div>
              <div className="feature">
                <Icon name="location_on" />
                {p.neighborhood}
              </div>
            </div>
          </Card>
          <Card>
            <h2>Conforto em cada detalhe</h2>
            <div className="amenities">
              {(
                p.amenities || [
                  'Ambientes ilustrativos',
                  'Visita acompanhada',
                  'Informações sob consulta',
                ]
              ).map((a) => (
                <div className="feature" key={a}>
                  <Icon name="check_circle" />
                  {a}
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2>Localização e acesso</h2>
            <p>{p.address || `${p.neighborhood}, ${p.city}`}</p>
            <div className="notice">
              Mapa e tour demonstrativos. O acesso à portaria é combinado pelo
              corretor.
            </div>
            <p className="muted">
              {p.accessNotes ||
                'Consulte disponibilidade, chaves e regras de acesso antes da visita.'}
            </p>
          </Card>
          {match.data && (
            <Card>
              <h2>
                {match.data.score === null
                  ? 'Preferências a definir'
                  : `${match.data.score}% de compatibilidade`}
              </h2>
              <p className="muted">
                Cálculo determinístico com base nas preferências do cliente.
              </p>
              {match.data.criteria.map((c) => (
                <p key={c.label}>
                  <Icon name={c.matched ? 'check_circle' : 'info'} />
                  {c.label}
                </p>
              ))}
            </Card>
          )}
        </div>
        <div className="page-stack">
          <Card>
            <Badge>
              {p.purpose === 'RENT'
                ? 'Disponível para locação'
                : 'Disponível para venda'}
            </Badge>
            <p className="muted">Investimento</p>
            <div className="property-price">{money(p.priceCents)}</div>
            <p>
              Condomínio{' '}
              <strong>
                {p.condominiumCents
                  ? money(p.condominiumCents)
                  : 'Sob consulta'}
              </strong>
            </p>
            <p>
              IPTU{' '}
              <strong>
                {p.iptuCents ? money(p.iptuCents) : 'Sob consulta'}
              </strong>
            </p>
            <Link
              to={`/agenda?propertyId=${p.id}${leadId ? `&leadId=${leadId}` : ''}`}
            >
              <Button>Quero conhecer</Button>
            </Link>
          </Card>
          <Card>
            <h2>Simule seu financiamento</h2>
            <p className="muted">
              Estimativa SAC ajustável. Valores sujeitos às condições de
              crédito.
            </p>
            <Field label={`Entrada · ${entry}%`}>
              <input
                type="range"
                min={10}
                max={90}
                step={5}
                value={entry}
                onChange={(e) => setEntry(Number(e.target.value))}
              />
            </Field>
            <p>{money(Math.round((p.priceCents * entry) / 100))}</p>
            <Field label="Prazo em meses">
              <select
                className="input"
                value={term}
                onChange={(e) => setTerm(Number(e.target.value))}
              >
                {[120, 180, 240, 300, 360, 420].map((t) => (
                  <option value={t} key={t}>
                    {t} meses
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Taxa anual (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={50}
                step="0.1"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
              />
            </Field>
            <hr />
            <p>
              Financiamento <strong>{money(principal)}</strong>
            </p>
            <p>
              Primeira parcela <strong>{money(first)}</strong>
            </p>
            <p>
              Última parcela <strong>{money(last)}</strong>
            </p>
            <Badge>Simulação · sem aprovação de crédito</Badge>
          </Card>
        </div>
      </div>
      {modal === 'delete' && (
        <Modal title="Excluir imóvel" onClose={() => setModal(null)}>
          <div className="page-stack">
            <p>
              Confirme a exclusão de <strong>{p.title}</strong>. Visitas ativas
              podem impedir esta operação.
            </p>
            {remove.isError && <ErrorPanel error={remove.error} />}
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Confirmar exclusão
            </Button>
          </div>
        </Modal>
      )}
      {modal === 'edit' && (
        <Modal title="Editar imóvel" onClose={() => setModal(null)}>
          <form className="page-stack" onSubmit={submit}>
            <Field label="Título">
              <input
                className="input"
                name="title"
                required
                maxLength={160}
                defaultValue={p.title}
              />
            </Field>
            <div className="form-grid">
              <Field label="Código">
                <input className="input" name="code" defaultValue={p.code} />
              </Field>
              <Field label="Preço em R$">
                <input
                  className="input"
                  name="price"
                  required
                  defaultValue={(p.priceCents / 100)
                    .toFixed(2)
                    .replace('.', ',')}
                />
              </Field>
              <Field label="Finalidade">
                <select
                  className="input"
                  name="purpose"
                  defaultValue={p.purpose}
                >
                  <option value="SALE">Venda</option>
                  <option value="RENT">Locação</option>
                </select>
              </Field>
              <Field label="Tipo">
                <select className="input" name="type" defaultValue={p.type}>
                  <option value="APARTMENT">Apartamento</option>
                  <option value="HOUSE">Casa</option>
                  <option value="COMMERCIAL">Comercial</option>
                  <option value="LAND">Terreno</option>
                </select>
              </Field>
              <Field label="Subtipo">
                <input
                  className="input"
                  name="subtype"
                  defaultValue={p.subtype}
                  placeholder="Cobertura, studio..."
                />
              </Field>
              <Field label="Disponibilidade">
                <select
                  className="input"
                  name="availability"
                  defaultValue={p.availability || 'AVAILABLE'}
                >
                  <option value="AVAILABLE">Disponível</option>
                  <option value="RESERVED">Reservado</option>
                  <option value="SOLD">Vendido</option>
                  <option value="RENTED">Locado</option>
                </select>
              </Field>
              <Field label="Cidade">
                <input
                  className="input"
                  name="city"
                  required
                  defaultValue={p.city}
                />
              </Field>
              <Field label="Bairro">
                <input
                  className="input"
                  name="neighborhood"
                  required
                  defaultValue={p.neighborhood}
                />
              </Field>
              <Field label="Área útil em m²">
                <input
                  className="input"
                  name="area"
                  type="number"
                  min={1}
                  step="0.01"
                  defaultValue={p.areaM2}
                />
              </Field>
              <Field label="Dormitórios">
                <input
                  className="input"
                  name="bedrooms"
                  type="number"
                  min={0}
                  max={100}
                  required
                  defaultValue={p.bedrooms}
                />
              </Field>
              <Field label="Vagas">
                <input
                  className="input"
                  name="parkingSpaces"
                  type="number"
                  min={0}
                  max={100}
                  required
                  defaultValue={p.parkingSpaces}
                />
              </Field>
              <Field label="Suítes">
                <input
                  className="input"
                  name="suites"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={p.suites || 0}
                />
              </Field>
              <Field label="Banheiros">
                <input
                  className="input"
                  name="bathrooms"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={p.bathrooms || 0}
                />
              </Field>
              <Field label="Condomínio em R$">
                <input
                  className="input"
                  name="condominium"
                  defaultValue={
                    p.condominiumCents
                      ? (p.condominiumCents / 100).toFixed(2).replace('.', ',')
                      : ''
                  }
                />
              </Field>
              <Field label="IPTU em R$">
                <input
                  className="input"
                  name="iptu"
                  defaultValue={
                    p.iptuCents
                      ? (p.iptuCents / 100).toFixed(2).replace('.', ',')
                      : ''
                  }
                />
              </Field>
            </div>
            <Field label="Endereço">
              <input
                className="input"
                name="address"
                defaultValue={p.address}
              />
            </Field>
            <Field label="Descrição">
              <textarea
                className="input"
                name="description"
                defaultValue={p.description}
                rows={4}
              />
            </Field>
            <Field label="Comodidades (uma por linha)">
              <textarea
                className="input"
                name="amenities"
                defaultValue={p.amenities?.join('\n')}
                rows={3}
              />
            </Field>
            <Field label="Informações de acesso">
              <textarea
                className="input"
                name="accessNotes"
                defaultValue={p.accessNotes}
              />
            </Field>
            {(formError !== undefined || update.isError) && (
              <ErrorPanel error={formError || update.error} />
            )}
            <Button type="submit" disabled={update.isPending}>
              Salvar alterações
            </Button>
          </form>
        </Modal>
      )}
      {gallery !== null && (
        <Modal title={`${p.title} · Galeria`} onClose={() => setGallery(null)}>
          <div className="gallery-modal">
            <img
              src={images[gallery]}
              alt={`${p.title} ambiente ${gallery + 1}`}
            />
            <div className="pagination">
              <Button
                variant="secondary"
                onClick={() =>
                  setGallery((gallery + images.length - 1) % images.length)
                }
              >
                Anterior
              </Button>
              <span>
                {gallery + 1} / {images.length}
              </span>
              <Button
                variant="secondary"
                onClick={() => setGallery((gallery + 1) % images.length)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
