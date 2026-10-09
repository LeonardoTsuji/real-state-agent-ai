const locale = 'pt-BR';
export const timezone = 'America/Sao_Paulo';
export const money = (cents: number | null | undefined) =>
  cents == null
    ? 'Não informado'
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'BRL',
      }).format(cents / 100);
export const currency = money;
export const date = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value))
    : '—';
export const datetime = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
export const time = (value: string | Date) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
export const stageLabels: Record<string, string> = {
  NEW: 'Novo',
  CONTACTED: 'Contatado',
  QUALIFIED: 'Qualificado',
  VISIT_SCHEDULED: 'Visita agendada',
  NEGOTIATION: 'Negociação',
  WON: 'Ganho',
  LOST: 'Perdido',
  FIRST_CONTACT: 'Primeiro contato',
  QUALIFICATION: 'Qualificação & Match',
  PROPOSAL_SENT: 'Proposta enviada',
  SCHEDULED: 'Agendada',
  COMPLETED: 'Concluída',
  CANCELED: 'Cancelada',
  PENDING: 'Pendente',
  CONFIRMED: 'Confirmada',
  EXPIRED: 'Expirada',
  PAID: 'Liquidada',
  SUGGESTED: 'Sugerido',
  SENT: 'Enviado',
  INTERESTED: 'Interessado',
  REJECTED: 'Rejeitado',
  WAITING: 'Aguardando',
  ACTIVE: 'Processando',
  FAILED: 'Com falha',
  SALE: 'Venda',
  RENT: 'Locação',
  APARTMENT: 'Apartamento',
  HOUSE: 'Casa',
  LAND: 'Terreno',
  COMMERCIAL: 'Comercial',
};
export const stageLabel = (value: string) => stageLabels[value] ?? value;
export const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
export function parseMoney(value: string): number {
  const cleaned = value.replace(/R\$|\s/g, '');
  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : cleaned;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized))
    throw new Error('Informe um valor com até duas casas decimais.');
  const [units, fraction = ''] = normalized.split('.');
  const cents = Number(units) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 2147483647)
    throw new Error('Valor fora do limite permitido.');
  return cents;
}
export const toCents = parseMoney;
export function toUTC(local: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?$/.test(local))
    throw new Error('Informe data e horário válidos.');
  const instant = new Date(`${local}-03:00`);
  if (
    !Number.isFinite(instant.getTime()) ||
    localInput(instant) !== local.slice(0, 16)
  )
    throw new Error('Informe data e horário válidos.');
  return instant.toISOString();
}
export function localInput(value: string | Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
