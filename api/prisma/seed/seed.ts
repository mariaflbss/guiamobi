import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import { OFFICIAL_SJC_LINES } from './officialLines';
import { AVERAGE_BUS_SPEED_KMH, REAL_LINE_ROUTES, TERMINAL_CENTRAL } from './realLineRoutes';

/**
 * Seed de dados.
 *
 * O usuário de teste sempre é criado (necessário para testar login/US01).
 *
 * LINHAS OFICIAIS (sempre populadas, dado real): código, nome e link do PDF
 * de horário/itinerário de cada linha de São José dos Campos, publicados
 * pela própria Prefeitura (ver officialLines.ts para a lista e a fonte).
 * Ainda não incluem paradas/coordenadas/horários estruturados - a Prefeitura
 * só publica isso dentro de cada PDF, em uma tabela que não é extraível de
 * forma confiável como texto simples (ver README em
 * api/src/integrations/transit/ para os detalhes e os próximos passos).
 *
 * LINHAS DE DEMONSTRAÇÃO (só se ALLOW_DEMO_TRANSIT_DATA=true): duas linhas
 * fictícias ("DEMO-A"/"DEMO-B"), com paradas e coordenadas inventadas, só
 * para exercitar localmente o algoritmo de busca de rotas por
 * origem/destino (que depende de paradas com coordenadas). NUNCA usam
 * números de linha reais e NUNCA são criadas em produção - o próprio
 * algoritmo de busca (routes.service.ts) também ignora linhas não-oficiais
 * a menos que essa mesma variável esteja ligada.
 */

const prisma = new PrismaClient();
const allowDemoTransitData = process.env.ALLOW_DEMO_TRANSIT_DATA === 'true';

async function main() {
  console.log('🌱 Populando dados...');

  const passwordHash = await argon2.hash('12345678', {
    type: argon2.argon2id,
  });

  await prisma.user.upsert({
    where: {
      email: 'teste@guiamobi.com',
    },
    update: {},
    create: {
      name: 'Usuário Teste',
      email: 'teste@guiamobi.com',
      passwordHash,
      avatarId: 'cat',
    },
  });

  // ----- Linhas oficiais reais de São José dos Campos -----
  // Código, nome e link do PDF de horário/itinerário: dados reais,
  // publicados pela própria Prefeitura (ver officialLines.ts para a fonte).
  // Sempre populado (não depende de ALLOW_DEMO_TRANSIT_DATA, pois não é
  // demonstração). Ainda SEM paradas/coordenadas/horários estruturados -
  // ver README em api/src/integrations/transit/ para o motivo e os
  // próximos passos. Isso já habilita a busca real de linha por número/nome
  // (US06/R07); a busca por origem/destino só passa a considerar cada linha
  // quando ela tiver paradas cadastradas.
  console.log(`🌱 Populando ${OFFICIAL_SJC_LINES.length} linhas oficiais de São José dos Campos...`);
  for (const line of OFFICIAL_SJC_LINES) {
    await prisma.transitLine.upsert({
      where: { code_dataSource: { code: line.code, dataSource: 'DEV_FIXTURE' } },
      update: { name: line.name, officialSourceUrl: line.sourceUrl, isOfficialData: true },
      create: {
        code: line.code,
        name: line.name,
        officialSourceUrl: line.sourceUrl,
        isOfficialData: true,
        dataSource: 'DEV_FIXTURE',
      },
    });
  }
  console.log('✅ Linhas oficiais cadastradas (sem paradas/horários ainda).');

  // ----- Trajeto real (ida e volta) para um subconjunto verificado de linhas -----
  // Ver realLineRoutes.ts para as fontes de cada coordenada e horário.
  // Sempre populado (dado real, não depende de ALLOW_DEMO_TRANSIT_DATA).
  console.log(`🌱 Populando trajeto real para ${REAL_LINE_ROUTES.length} linha(s) verificada(s)...`);
  const terminalCentral = await upsertStop(TERMINAL_CENTRAL.name, TERMINAL_CENTRAL.latitude, TERMINAL_CENTRAL.longitude);

  for (const route of REAL_LINE_ROUTES) {
    const line = await prisma.transitLine.findUnique({
      where: { code_dataSource: { code: route.code, dataSource: 'DEV_FIXTURE' } },
    });
    if (!line) {
      console.warn(`   ⚠️  Linha ${route.code} não encontrada em officialLines.ts - pulando.`);
      continue;
    }

    const destinationStop = await upsertStop(
      route.destinationStop.name,
      route.destinationStop.latitude,
      route.destinationStop.longitude
    );

    const distanceMeters = haversineDistanceMeters(
      TERMINAL_CENTRAL.latitude,
      TERMINAL_CENTRAL.longitude,
      route.destinationStop.latitude,
      route.destinationStop.longitude
    );
    const legMinutes = Math.round((distanceMeters / 1000 / AVERAGE_BUS_SPEED_KMH) * 60);

    // Remove paradas de uma execução anterior desta mesma linha, para o
    // seed ser reexecutável sem duplicar.
    await prisma.lineStop.deleteMany({ where: { lineId: line.id } });

    // Ida e volta: Terminal Central (0) -> destino real (1) -> Terminal Central de novo (2),
    // reaproveitando a mesma parada real para representar o retorno.
    await prisma.lineStop.create({
      data: { lineId: line.id, stopId: terminalCentral.id, sequence: 0, minutesFromStart: 0 },
    });
    await prisma.lineStop.create({
      data: { lineId: line.id, stopId: destinationStop.id, sequence: 1, minutesFromStart: legMinutes },
    });
    await prisma.lineStop.create({
      data: { lineId: line.id, stopId: terminalCentral.id, sequence: 2, minutesFromStart: legMinutes * 2 },
    });

    if (route.weekdayDepartures?.length) {
      await prisma.transitDeparture.deleteMany({ where: { lineId: line.id, dayType: 'WEEKDAY' } });
      await prisma.transitDeparture.createMany({
        data: route.weekdayDepartures.map((departureTime) => ({
          lineId: line.id,
          dayType: 'WEEKDAY' as const,
          departureTime,
        })),
      });
    }

    console.log(
      `   ✓ Linha ${route.code}: Terminal Central ↔ ${route.destinationStop.name} (~${(distanceMeters / 1000).toFixed(1)} km, ~${legMinutes} min estimados por trecho)${route.weekdayDepartures ? `, ${route.weekdayDepartures.length} horários reais (dias úteis)` : ''}`
    );
  }

  if (!allowDemoTransitData) {
    console.log(
      'ℹ️  ALLOW_DEMO_TRANSIT_DATA não está "true" - linhas/paradas de demonstração NÃO foram criadas.'
    );
    console.log(
      '   Isso é o comportamento esperado para produção: sem uma fonte oficial de dados de transporte'
    );
    console.log('   integrada, o app informa "sem dados de transporte" em vez de inventar linhas.');
    return;
  }

  console.log('🌱 Populando linhas e paradas de DEMONSTRAÇÃO (não são as linhas reais de SJC)...');

  // Remove apenas dados de demonstração de uma execução anterior - nunca
  // toca nas linhas oficiais reais cadastradas acima.
  const demoLines = await prisma.transitLine.findMany({
    where: { isOfficialData: false },
    select: { id: true },
  });
  const demoLineIds = demoLines.map((l) => l.id);
  await prisma.lineStop.deleteMany({ where: { lineId: { in: demoLineIds } } });
  await prisma.transitLineStatus.deleteMany({ where: { lineId: { in: demoLineIds } } });
  await prisma.transitDeparture.deleteMany({ where: { lineId: { in: demoLineIds } } });
  await prisma.transitLine.deleteMany({ where: { id: { in: demoLineIds } } });
  // Paradas órfãs (só usadas pelas linhas de demo removidas acima)
  await prisma.transitStop.deleteMany({ where: { lineStops: { none: {} } } });

  // ----- Linha de demonstração A: Terminal Central -> UNIVAP Campus -----
  // Códigos "DEMO-A"/"DEMO-B" usados de propósito, para nunca serem
  // confundidos com números de linhas reais da cidade (ex.: a linha real
  // 315 é "Parque Interlagos / Terminal Central", uma rota diferente desta).
  const lineA = await prisma.transitLine.create({
    data: { code: 'DEMO-A', name: '[Demonstração] Terminal → Univap', isOfficialData: false },
  });

  const stopsA = [
    { name: 'Terminal Central', latitude: -23.1791, longitude: -45.8872, minutesFromStart: 0 },
    { name: 'Pça. Afonso Pena', latitude: -23.1825, longitude: -45.8841, minutesFromStart: 5 },
    { name: 'Av. Eng. S. Gualberto', latitude: -23.1858, longitude: -45.881, minutesFromStart: 10 },
    { name: 'R. Voluntários da Pátria', latitude: -23.1889, longitude: -45.8779, minutesFromStart: 13 },
    { name: 'Av. São João', latitude: -23.192, longitude: -45.8748, minutesFromStart: 17 },
    { name: 'Pça. dos Imigrantes', latitude: -23.1951, longitude: -45.8717, minutesFromStart: 21 },
    { name: 'R. Sete de Setembro', latitude: -23.1982, longitude: -45.8686, minutesFromStart: 24 },
    { name: 'UNIVAP Campus', latitude: -23.2013, longitude: -45.8655, minutesFromStart: 28 },
  ];

  await createLineWithStops(lineA.id, stopsA);

  // ----- Linha de demonstração B: Jd. Aquarius -> Centro -----
  const lineB = await prisma.transitLine.create({
    data: { code: 'DEMO-B', name: '[Demonstração] Jd. Aquarius → Centro', isOfficialData: false },
  });

  const stopsB = [
    { name: 'Jd. Aquarius', latitude: -23.2201, longitude: -45.9012, minutesFromStart: 0 },
    { name: 'Av. Andrômeda', latitude: -23.2145, longitude: -45.8965, minutesFromStart: 6 },
    { name: 'Av. Dr. João Guilhermino', latitude: -23.2088, longitude: -45.8918, minutesFromStart: 12 },
    { name: 'Pça. Afonso Pena', latitude: -23.1825, longitude: -45.8841, minutesFromStart: 24 },
    { name: 'UNIVAP Campus', latitude: -23.2013, longitude: -45.8655, minutesFromStart: 35 },
    { name: 'Terminal Centro', latitude: -23.1791, longitude: -45.8872, minutesFromStart: 42 },
  ];

  await createLineWithStops(lineB.id, stopsB);

  console.log('✅ Seed concluído: 2 linhas de demonstração cadastradas (isOfficialData=false).');
}

async function createLineWithStops(
  lineId: string,
  stops: { name: string; latitude: number; longitude: number; minutesFromStart: number }[]
) {
  for (let sequence = 0; sequence < stops.length; sequence += 1) {
    const stopData = stops[sequence];

    // Reaproveita a parada se já existir uma com o mesmo nome (paradas
    // compartilhadas entre linhas, como "Pça. Afonso Pena" e "UNIVAP Campus")
    const stop = await upsertStop(stopData.name, stopData.latitude, stopData.longitude);

    await prisma.lineStop.create({
      data: {
        lineId,
        stopId: stop.id,
        sequence,
        minutesFromStart: stopData.minutesFromStart,
      },
    });
  }
}

/** Reaproveita uma parada existente pelo nome, ou cria uma nova. */
async function upsertStop(name: string, latitude: number, longitude: number) {
  const existing = await prisma.transitStop.findFirst({ where: { name } });
  return existing ?? prisma.transitStop.create({ data: { name, latitude, longitude } });
}

/**
 * Distância em metros entre duas coordenadas (fórmula de Haversine).
 * Mesma fórmula usada em routes.service.ts, duplicada aqui só para o seed
 * não depender de importar um módulo da API em tempo de seed.
 */
function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

main()
  .catch((error) => {
    console.error('❌ Erro ao popular dados de transporte:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
