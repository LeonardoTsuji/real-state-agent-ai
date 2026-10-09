import type { LlmInput, LlmOutput } from './llm.adapter.js';

type PropertyType = 'APARTMENT' | 'HOUSE' | 'LAND' | 'COMMERCIAL';
export type DemoPreferences = {
  schemaVersion: 'v1';
  purpose: 'SALE' | 'RENT' | null;
  types: PropertyType[];
  neighborhoods: string[];
  minPriceCents: number | null;
  maxPriceCents: number | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  confidence: number;
  uncertainty: string[];
  needsClarification: boolean;
};
const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const neighborhoodNames = [
  'Vila Mariana',
  'Moema',
  'Pinheiros',
  'Jardins',
  'Perdizes',
  'Itaim Bibi',
  'Vila Madalena',
  'Brooklin',
  'Campo Belo',
  'Santana',
  'Tatuapé',
  'Água Branca',
  'Bela Vista',
  'Paraíso',
];
const moneyToken =
  '(?:r\\$\\s*)?(\\d[\\d.,]*)(?:\\s*(milhoes?|milhao|mil|mi))?';
function cents(value: string, unit?: string): number | null {
  if (
    !unit &&
    !value.includes('.') &&
    !value.includes(',') &&
    Number(value) < 1000
  )
    return null;
  const decimal = unit
    ? Number(value.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.'))
    : Number(value.replace(/\./g, '').replace(',', '.'));
  const multiplier = unit ? (unit === 'mil' ? 1000 : 1000000) : 1;
  const result = Math.round(decimal * multiplier * 100);
  return Number.isSafeInteger(result) && result >= 0 && result <= 2147483647
    ? result
    : null;
}
/** Demo rules only recognize explicit phrases; they do not infer facts from a model. */
export function extractDemoPreferences(message: string): DemoPreferences {
  const text = normalized(message);
  const result: DemoPreferences = {
    schemaVersion: 'v1',
    purpose: null,
    types: [],
    neighborhoods: [],
    minPriceCents: null,
    maxPriceCents: null,
    minBedrooms: null,
    maxBedrooms: null,
    confidence: 0,
    uncertainty: [],
    needsClarification: false,
  };
  const buy = /\b(comprar|compra|venda)\b/.test(text),
    rent = /\b(alugar|aluguel|locacao|arrendar)\b/.test(text);
  if (buy && rent)
    result.uncertainty.push('Confirme se deseja comprar ou alugar.');
  else result.purpose = buy ? 'SALE' : rent ? 'RENT' : null;
  const types: Array<[PropertyType, RegExp]> = [
    ['APARTMENT', /\b(apartamento|apartamentos|apto|aptos)\b/],
    ['HOUSE', /\b(casa|casas|sobrado|sobrados)\b/],
    ['LAND', /\b(terreno|terrenos|lote|lotes)\b/],
    ['COMMERCIAL', /\b(comercial|comerciais|sala comercial|loja|lojas)\b/],
  ];
  for (const [type, pattern] of types)
    if (pattern.test(text)) {
      const mention = pattern.exec(text)!;
      if (
        /\b(nao|sem|exceto)\b[^,;.]{0,22}$/.test(
          text.slice(Math.max(0, mention.index - 25), mention.index),
        )
      )
        result.uncertainty.push(
          'Revise os tipos de imóvel mencionados com restrições.',
        );
      else result.types.push(type);
    }
  result.neighborhoods = neighborhoodNames.filter((name) =>
    new RegExp(`\\b${normalized(name)}\\b`).test(text),
  );
  const neighborhood =
    /\bbairro\s+([a-z][a-z ]{1,60}?)(?=\s+(?:com|ate|de|para|e\s+\d)|[,.;!?]|$)/.exec(
      message.toLowerCase(),
    );
  if (neighborhood && !result.neighborhoods.length)
    result.neighborhoods.push(neighborhood[1]!.trim());
  const range = new RegExp(
    `\\bentre\\s+${moneyToken}\\s+e\\s+${moneyToken}`,
  ).exec(text);
  if (range) {
    result.minPriceCents = cents(range[1]!, range[2] ?? range[4]);
    result.maxPriceCents = cents(range[3]!, range[4] ?? range[2]);
  } else {
    const maximum = new RegExp(
      `(?:\\bate|\\bno maximo|\\bmaximo de|\\borcamento(?: de|:)?|\\bteto(?: de|:)?)\\s*${moneyToken}`,
    ).exec(text);
    const minimum = new RegExp(
      `(?:\\ba partir de|\\bminimo de|\\bacima de)\\s*${moneyToken}`,
    ).exec(text);
    if (maximum) result.maxPriceCents = cents(maximum[1]!, maximum[2]);
    if (minimum) result.minPriceCents = cents(minimum[1]!, minimum[2]);
  }
  if (
    /\b(barato|acessivel|caro|negociavel)\b/.test(text) ||
    (/\br\$|\bmil(?:hao|hoes)?\b/.test(text) &&
      result.minPriceCents === null &&
      result.maxPriceCents === null)
  )
    result.uncertainty.push(
      'Informe o orçamento mínimo ou máximo de forma explícita.',
    );
  const bedroomRange =
    /\bentre\s+(\d{1,2})\s+e\s+(\d{1,2})\s+(?:quartos?|dormitorios?)\b/.exec(
      text,
    );
  const bedrooms =
    /(?:(pelo menos|minimo de|a partir de|ate|no maximo)\s+)?(\d{1,2})\s+(?:quartos?|dormitorios?)\b/.exec(
      text,
    );
  if (bedroomRange) {
    result.minBedrooms = Number(bedroomRange[1]);
    result.maxBedrooms = Number(bedroomRange[2]);
  } else if (bedrooms) {
    const count = Number(bedrooms[2]);
    if (['ate', 'no maximo'].includes(bedrooms[1] ?? ''))
      result.maxBedrooms = count;
    else if (bedrooms[1]) result.minBedrooms = count;
    else result.minBedrooms = result.maxBedrooms = count;
  }
  if (
    (result.minPriceCents !== null &&
      result.maxPriceCents !== null &&
      result.minPriceCents > result.maxPriceCents) ||
    (result.minBedrooms !== null &&
      result.maxBedrooms !== null &&
      result.minBedrooms > result.maxBedrooms)
  ) {
    result.minPriceCents =
      result.maxPriceCents =
      result.minBedrooms =
      result.maxBedrooms =
        null;
    result.uncertainty.push(
      'A faixa informada está invertida; confirme os limites.',
    );
  }
  const recognized =
    result.purpose !== null ||
    result.types.length > 0 ||
    result.neighborhoods.length > 0 ||
    result.maxPriceCents !== null ||
    result.minPriceCents !== null ||
    result.minBedrooms !== null ||
    result.maxBedrooms !== null;
  if (!recognized)
    result.uncertainty.push(
      'Não reconheci preferências explícitas. Informe finalidade, tipo, bairro, orçamento ou quartos.',
    );
  result.needsClarification = result.uncertainty.length > 0;
  result.confidence = recognized ? (result.needsClarification ? 0.4 : 0.8) : 0;
  return result;
}
const answer = (text: string): LlmOutput => ({
  text: `Demonstração: ${text}`,
  calls: [],
  totalTokens: 0,
  output: [],
});
function call(name: string, args: Record<string, unknown>): LlmOutput {
  const callId = `demo-${name}`;
  const argumentsText = JSON.stringify(args);
  return {
    text: '',
    totalTokens: 0,
    calls: [{ callId, name, arguments: argumentsText }],
    output: [
      {
        type: 'function_call',
        call_id: callId,
        name,
        arguments: argumentsText,
      },
    ],
  };
}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
export function respondDemo(input: LlmInput): LlmOutput {
  const latestUser = input.input.findLastIndex(
    (item) => 'role' in item && item.role === 'user',
  );
  const user = input.input[latestUser];
  const message =
    user && 'content' in user && typeof user.content === 'string'
      ? user.content
      : '';
  const toolResult = input.input
    .slice(latestUser + 1)
    .findLast((item) => item.type === 'function_call_output');
  if (toolResult && toolResult.type === 'function_call_output') {
    let result: Record<string, unknown> | undefined;
    try {
      result = record(
        typeof toolResult.output === 'string'
          ? (JSON.parse(toolResult.output) as unknown)
          : undefined,
      );
    } catch {
      return answer(
        'Não consegui interpretar a consulta. Use o catálogo ou a agenda para continuar.',
      );
    }
    if (result?.error)
      return answer(
        'A consulta não pôde ser concluída. Revise os dados no catálogo ou na agenda.',
      );
    if (toolResult.call_id === 'demo-schedule_visit')
      return answer(
        'A proposta de visita está pendente. Revise o cartão e confirme ou rejeite; a visita será criada somente após sua confirmação.',
      );
    const items = Array.isArray(result?.items)
      ? (result.items as unknown[])
      : [];
    const names = items
      .slice(0, 3)
      .map((item) => record(item)?.title)
      .filter((title): title is string => typeof title === 'string');
    return answer(
      names.length
        ? `Encontrei no seu catálogo: ${names.join('; ')}. Abra Imóveis para revisar detalhes e disponibilidade. A consulta não alterou o cadastro.`
        : 'Não encontrei imóveis com esses filtros no seu catálogo. Revise as preferências ou busque no catálogo.',
    );
  }
  const text = normalized(message);
  const available = (name: string) =>
    input.tools.some((tool) => tool.name === name);
  if (
    /\b(agende|agendar|marcar|proponha)\b/.test(text) &&
    /\bvisita\b/.test(text)
  ) {
    const propertyId =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.exec(
        message,
      )?.[0];
    const dates =
      message.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/g) ?? [];
    if (
      propertyId &&
      dates.length === 2 &&
      Date.parse(dates[1]!) > Date.parse(dates[0]) &&
      available('schedule_visit')
    )
      return call('schedule_visit', {
        propertyId,
        startAt: dates[0],
        endAt: dates[1],
      });
    return answer(
      'Para agendar, use Nova visita na Agenda e selecione imóvel, data e horário. Também posso preparar uma proposta se você informar o ID do imóvel e início e fim em UTC. A confirmação será sempre sua.',
    );
  }
  if (
    /\b(buscar|busque|encontrar|encontre|procuro|pesquisar|pesquise|quero ver)\b/.test(
      text,
    ) &&
    available('search_properties')
  ) {
    const pref = extractDemoPreferences(message);
    if (pref.needsClarification)
      return answer(
        `${pref.uncertainty.join(' ')} Você pode revisar os campos em Preferências.`,
      );
    return call('search_properties', {
      purpose: pref.purpose,
      type: pref.types[0] ?? null,
      neighborhood: pref.neighborhoods[0] ?? null,
      minPriceCents: pref.minPriceCents,
      maxPriceCents: pref.maxPriceCents,
      minBedrooms: pref.minBedrooms,
    });
  }
  return answer(
    'Posso consultar imóveis com critérios explícitos, por exemplo “Busque apartamentos em Moema até R$ 800 mil”, ou orientar uma visita. Para registrar preferências, use Extrair preferências e revise os campos antes de salvar. As mensagens ficam neste histórico.',
  );
}
