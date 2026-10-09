import { PrismaClient } from '../dist/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import { demoDatabaseURL } from './demo-database.mjs';
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: demoDatabaseURL() }),
});
const id = (name) => {
  const h = createHash('sha256')
    .update(`copilot-demo-v1:${name}`)
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const passwordHash = await argon2.hash('DemoCopilot2026!', {
  type: argon2.argon2id,
});
try {
  const marina = await prisma.broker.upsert({
    where: { email: 'marina@copilot.demo' },
    update: { name: 'Marina Costa', role: 'BROKER', creci: '248.910-F' },
    create: {
      id: id('marina'),
      name: 'Marina Costa',
      email: 'marina@copilot.demo',
      passwordHash,
      role: 'BROKER',
      creci: '248.910-F',
    },
  });
  const lucas = await prisma.broker.upsert({
    where: { email: 'lucas@copilot.demo' },
    update: { name: 'Lucas Mendes', role: 'OPERATOR' },
    create: {
      id: id('lucas'),
      name: 'Lucas Mendes',
      email: 'lucas@copilot.demo',
      passwordHash,
      role: 'OPERATOR',
    },
  });
  const leads = [
    [
      'rafael',
      'Rafael Almeida',
      '11987654321',
      'rafael.almeida@example.com',
      'QUALIFIED',
      'Investidor · proximidade ao metrô',
      'Indicação',
    ],
    [
      'beatriz',
      'Beatriz Mendonça',
      '11991238844',
      'beatriz@example.com',
      'VISIT_SCHEDULED',
      'Família · primeira aquisição',
      'Indicação',
    ],
    [
      'carlos',
      'Carlos Eduardo Silveira',
      '11999887766',
      'carlos@example.com',
      'CONTACTED',
      'Studio para renda de locação',
      'Portal',
    ],
    [
      'juliana',
      'Juliana Rios',
      '11971234567',
      'juliana@example.com',
      'QUALIFIED',
      'Executiva de tecnologia · tutora do Theo',
      'Portal',
    ],
    [
      'marcelo',
      'Marcelo Prado',
      '11976543210',
      'marcelo@example.com',
      'NEGOTIATION',
      'Proposta em análise',
      'Indicação',
    ],
    [
      'thiago',
      'Thiago Prado',
      '11965432100',
      'thiago@example.com',
      'QUALIFIED',
      'Interesse na Vila Mariana',
      'Portal',
    ],
  ];
  for (const [key, name, phone, email, stage, profile, source] of leads)
    await prisma.lead.upsert({
      where: { id: id(key) },
      update: {},
      create: {
        id: id(key),
        brokerId: marina.id,
        name,
        phone,
        email,
        stage,
        profile,
        source,
        notes: 'Cadastro sintético para demonstração do Corretor Copilot.',
      },
    });
  const properties = [
    {
      key: 'mirante',
      title: 'Apartamento Edifício Mirante Paulista',
      code: 'AP-204',
      priceCents: 62000000,
      neighborhood: 'Vila Mariana',
      address: 'Rua Domingos de Morais, 1240 · AP-204',
      areaM2: 68,
      bedrooms: 2,
      suites: 1,
      bathrooms: 2,
      parkingSpaces: 1,
      condominiumCents: 68000,
      iptuCents: 14500,
      image: 1,
      amenities: [
        'Varanda gourmet',
        'Aceita pets',
        'Próximo ao metrô',
        'Portaria 24h',
      ],
    },
    {
      key: 'alameda',
      title: 'Alameda dos Pássaros',
      code: 'AP-112',
      priceCents: 89000000,
      neighborhood: 'Moema',
      address: 'Alameda dos Pássaros, 112',
      areaM2: 84,
      bedrooms: 3,
      suites: 1,
      bathrooms: 2,
      parkingSpaces: 2,
      condominiumCents: 98000,
      iptuCents: 21000,
      image: 2,
      amenities: ['Varanda integrada', 'Academia', 'Piscina'],
    },
    {
      key: 'studio',
      title: 'Studio Perdizes Prime',
      code: 'ST-105',
      priceCents: 49000000,
      neighborhood: 'Perdizes',
      address: 'Rua Cardoso de Almeida, 920',
      areaM2: 35,
      bedrooms: 1,
      suites: 0,
      bathrooms: 1,
      parkingSpaces: 0,
      condominiumCents: 49000,
      iptuCents: 9900,
      image: 3,
      amenities: ['Coworking', 'Academia', 'Lavanderia'],
    },
    {
      key: 'casa',
      title: 'Casa Alto de Pinheiros Jardim',
      code: 'CA-402',
      priceCents: 240000000,
      neighborhood: 'Alto de Pinheiros',
      address: 'Rua Alberto Faria, 402',
      areaM2: 280,
      bedrooms: 4,
      suites: 3,
      bathrooms: 5,
      parkingSpaces: 3,
      condominiumCents: 0,
      iptuCents: 125000,
      image: 4,
      amenities: ['Piscina', 'Jardim', 'Espaço gourmet'],
    },
    {
      key: 'moema',
      title: 'Cobertura Duplex Moema · Edifício Pássaros',
      code: 'CB-804',
      priceCents: 145000000,
      neighborhood: 'Moema',
      address: 'Av. Rouxinol, 720 · Cobertura 1801',
      areaM2: 142,
      bedrooms: 3,
      suites: 3,
      bathrooms: 4,
      parkingSpaces: 2,
      condominiumCents: 189000,
      iptuCents: 62000,
      image: 5,
      amenities: [
        'Terraço privativo',
        'Jacuzzi',
        'Vista panorâmica',
        'Academia',
        'Gerador',
        'Aceita pets',
      ],
    },
    {
      key: 'jardins',
      title: 'Edifício Jardim Paulista Classic',
      code: 'AP-610',
      priceCents: 120000000,
      neighborhood: 'Jardim Paulista',
      address: 'Alameda Lorena, 610',
      areaM2: 115,
      bedrooms: 3,
      suites: 1,
      bathrooms: 3,
      parkingSpaces: 2,
      condominiumCents: 115000,
      iptuCents: 42000,
      image: 6,
      amenities: ['Piso de madeira', 'Ampla iluminação', 'Portaria 24h'],
    },
  ];
  for (const p of properties) {
    const { key, image, ...data } = p;
    await prisma.property.upsert({
      where: { id: id(key) },
      update: {
        media:
          key === 'moema'
            ? Array.from(
                { length: 6 },
                (_, i) => `/assets/dossier-${i + 1}.jpg`,
              )
            : [`/assets/property-${image}.jpg`],
      },
      create: {
        id: id(key),
        brokerId: marina.id,
        ...data,
        purpose: 'SALE',
        city: 'São Paulo',
        type: key === 'casa' ? 'HOUSE' : 'APARTMENT',
        subtype:
          key === 'moema'
            ? 'PENTHOUSE'
            : key === 'studio'
              ? 'STUDIO'
              : 'STANDARD',
        availability: 'AVAILABLE',
        description:
          'Imóvel de demonstração, com ficha técnica e imagens locais. Revise os critérios do seu cliente e agende uma visita.',
        media:
          key === 'moema'
            ? Array.from(
                { length: 6 },
                (_, i) => `/assets/dossier-${i + 1}.jpg`,
              )
            : [`/assets/property-${image}.jpg`],
        accessInfo: {
          concierge: key === 'mirante' ? 'Seu Antenor' : 'Valdir',
          extension: '102',
          keys: 'Chaves na portaria',
          petsAllowed: true,
        },
      },
    });
  }
  for (const [key, budget, neighborhoods, bedrooms] of [
    ['rafael', 65000000, ['Vila Mariana', 'Saúde'], 2],
    ['juliana', 150000000, ['Vila Mariana', 'Moema'], 2],
    ['beatriz', 250000000, ['Alto de Pinheiros'], 4],
    ['thiago', 85000000, ['Vila Mariana'], 2],
  ])
    await prisma.leadPreference.upsert({
      where: { leadId: id(key) },
      update: {},
      create: {
        id: id(`pref-${key}`),
        brokerId: marina.id,
        leadId: id(key),
        purposes: ['SALE'],
        types: ['APARTMENT'],
        maxPriceCents: budget,
        neighborhoods,
        minBedrooms: bedrooms,
        minParkingSpaces: 1,
      },
    });
  for (const [key, property, score] of [
    ['rafael', 'mirante', 96],
    ['juliana', 'mirante', 94],
    ['juliana', 'moema', 92],
  ])
    await prisma.leadPropertyMatch.upsert({
      where: {
        leadId_propertyId: { leadId: id(key), propertyId: id(property) },
      },
      update: {},
      create: {
        id: id(`match-${key}-${property}`),
        brokerId: marina.id,
        leadId: id(key),
        propertyId: id(property),
        score,
        status: 'INTERESTED',
      },
    });
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  for (const [key, lead, property, hour, status] of [
    ['morning', 'carlos', 'studio', 10, 'COMPLETED'],
    ['rafael-visit', 'rafael', 'mirante', 14, 'SCHEDULED'],
    ['juliana-anchor', 'juliana', 'moema', 16, 'SCHEDULED'],
  ]) {
    const startAt = new Date(
      `${day}T${String(hour).padStart(2, '0')}:00:00-03:00`,
    );
    const endAt = new Date(startAt.getTime() + 3600000);
    await prisma.visit.upsert({
      where: { id: id(`${key}:${day}`) },
      update: {},
      create: {
        id: id(`${key}:${day}`),
        brokerId: marina.id,
        leadId: id(lead),
        propertyId: id(property),
        startAt,
        endAt,
        status,
        idempotencyKey: `demo:${key}:${day}`,
        notes: 'Visita presencial · retirada de chave na portaria.',
        ...(status === 'COMPLETED'
          ? {
              checkedInAt: startAt,
              feedback: {
                interest: 'MODERATE',
                rating: 4,
                notes:
                  'Gostou da área de lazer e pediu documentação do condomínio.',
              },
            }
          : {}),
      },
    });
  }
  for (const [key, title, dueHours] of [
    ['rafael', 'Confirmar interesse após a visita', 24],
    ['juliana', 'Preparar comparativo Mirante Paulista e Moema', 12],
    ['thiago', 'Enviar imóveis na Vila Mariana', 36],
  ])
    await prisma.task.upsert({
      where: { id: id(`task-${key}`) },
      update: {},
      create: {
        id: id(`task-${key}`),
        brokerId: marina.id,
        leadId: id(key),
        title,
        dueAt: new Date(Date.now() + dueHours * 3600000),
      },
    });
  for (const [key, text] of [
    [
      'rafael',
      'Demonstrou interesse em apartamento com varanda e proximidade ao metrô.',
    ],
    [
      'juliana',
      'Gostaria de comparar o Mirante Paulista com a cobertura em Moema.',
    ],
  ])
    await prisma.interaction.upsert({
      where: { id: id(`interaction-${key}`) },
      update: {},
      create: {
        id: id(`interaction-${key}`),
        brokerId: marina.id,
        leadId: id(key),
        type: 'WHATSAPP',
        occurredAt: new Date(),
        summary: text,
        channel: 'WhatsApp (simulação)',
      },
    });
  const conversation = await prisma.conversation.upsert({
    where: { id: id('rafael-conversation') },
    update: {},
    create: {
      id: id('rafael-conversation'),
      brokerId: marina.id,
      leadId: id('rafael'),
    },
  });
  for (const [index, role, body] of [
    [
      0,
      'USER',
      'Rafael procura apartamento com 2 quartos na Vila Mariana e até R$ 650 mil.',
    ],
    [
      1,
      'ASSISTANT',
      'Este ambiente usa demonstração local. Revise as preferências e abra o catálogo para comparar imóveis; confirme qualquer agendamento manualmente.',
    ],
  ])
    await prisma.message.upsert({
      where: { idempotencyKey: `demo:message:${index}` },
      update: {},
      create: {
        id: id(`message-${index}`),
        brokerId: marina.id,
        conversationId: conversation.id,
        idempotencyKey: `demo:message:${index}`,
        role,
        body,
        status: 'SENT',
        sentAt: new Date(),
      },
    });
  for (const [key, property, stage, value] of [
    ['rafael', 'mirante', 'QUALIFICATION', 62000000],
    ['juliana', 'moema', 'VISIT_SCHEDULED', 145000000],
    ['marcelo', 'jardins', 'QUALIFICATION', 120000000],
    ['beatriz', 'casa', 'VISIT_SCHEDULED', 240000000],
  ])
    await prisma.opportunity.upsert({
      where: { id: id(`deal-${key}`) },
      update: {},
      create: {
        id: id(`deal-${key}`),
        brokerId: marina.id,
        leadId: id(key),
        propertyId: id(property),
        alternativePropertyId: key === 'juliana' ? id('mirante') : null,
        stage,
        title: `${leads.find((x) => x[0] === key)[1]} · ${properties.find((x) => x.key === property).code}`,
        estimatedValueCents: value,
        commissionBps: 600,
      },
    });
  const job = await prisma.asyncJob.upsert({
    where: { idempotencyKey: 'demo:failed-job' },
    update: {},
    create: {
      id: id('failed-job'),
      type: 'CALENDAR_SYNC',
      aggregateType: 'visit',
      aggregateId: id(`rafael-visit:${day}`),
      idempotencyKey: 'demo:failed-job',
      payload: { visitId: id(`rafael-visit:${day}`) },
      status: 'FAILED',
      attempts: 3,
      maxAttempts: 3,
      failureCode: 'TIMEOUT',
      failureMessage: 'A integração simulada excedeu o tempo limite.',
      startedAt: new Date(Date.now() - 80000),
      finishedAt: new Date(Date.now() - 5000),
    },
  });
  await prisma.outboxEvent.upsert({
    where: { jobId: job.id },
    update: {},
    create: { jobId: job.id, status: 'PUBLISHED', publishedAt: new Date() },
  });
  console.log(
    'Demonstração preparada em corretor_copilot_demo (sem apagar dados).',
  );
  console.log(
    'Corretora: marina@copilot.demo | Operador: lucas@copilot.demo | Senha: DemoCopilot2026!',
  );
  void lucas;
} finally {
  await prisma.$disconnect();
}
