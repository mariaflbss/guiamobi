import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

/**
 * Seed de dados de transporte, usado para o algoritmo de busca de rotas
 * (Prioridade 1 da revisão) ter dados reais para consultar.
 *
 * As coordenadas abaixo são aproximadas da região de São José dos Campos/SP
 * (mesma cidade referenciada nos mockups originais - "SJC", "Univap").
 * Em produção, esses dados viriam de uma fonte oficial (GTFS da prefeitura/
 * operadora de transporte), substituindo este seed manual.
 */

const prisma = new PrismaClient();

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
 
async function main() {
  console.log('🌱 Populando linhas e paradas de transporte...');

  await prisma.lineStop.deleteMany();
  await prisma.transitLine.deleteMany();
  await prisma.transitStop.deleteMany();

  // ----- Linha 301: Terminal Central -> UNIVAP Campus -----
  const line301 = await prisma.transitLine.create({
    data: { code: '301', name: 'Terminal → Univap' },
  });

  const stops301 = [
    { name: 'Terminal Central', latitude: -23.1791, longitude: -45.8872, minutesFromStart: 0 },
    { name: 'Pça. Afonso Pena', latitude: -23.1825, longitude: -45.8841, minutesFromStart: 5 },
    { name: 'Av. Eng. S. Gualberto', latitude: -23.1858, longitude: -45.881, minutesFromStart: 10 },
    { name: 'R. Voluntários da Pátria', latitude: -23.1889, longitude: -45.8779, minutesFromStart: 13 },
    { name: 'Av. São João', latitude: -23.192, longitude: -45.8748, minutesFromStart: 17 },
    { name: 'Pça. dos Imigrantes', latitude: -23.1951, longitude: -45.8717, minutesFromStart: 21 },
    { name: 'R. Sete de Setembro', latitude: -23.1982, longitude: -45.8686, minutesFromStart: 24 },
    { name: 'UNIVAP Campus', latitude: -23.2013, longitude: -45.8655, minutesFromStart: 22 },
  ];

  await createLineWithStops(line301.id, stops301);

  // ----- Linha 315: Jd. Aquarius -> Centro -----
  const line315 = await prisma.transitLine.create({
    data: { code: '315', name: 'Jd. Aquarius → Centro' },
  });

  const stops315 = [
    { name: 'Jd. Aquarius', latitude: -23.2201, longitude: -45.9012, minutesFromStart: 0 },
    { name: 'Av. Andrômeda', latitude: -23.2145, longitude: -45.8965, minutesFromStart: 6 },
    { name: 'Av. Dr. João Guilhermino', latitude: -23.2088, longitude: -45.8918, minutesFromStart: 12 },
    { name: 'Pça. Afonso Pena', latitude: -23.1825, longitude: -45.8841, minutesFromStart: 24 },
    { name: 'UNIVAP Campus', latitude: -23.2013, longitude: -45.8655, minutesFromStart: 35 },
    { name: 'Terminal Centro', latitude: -23.1791, longitude: -45.8872, minutesFromStart: 42 },
  ];

  await createLineWithStops(line315.id, stops315);

  console.log('✅ Seed concluído: 2 linhas cadastradas.');
}

async function createLineWithStops(
  lineId: string,
  stops: { name: string; latitude: number; longitude: number; minutesFromStart: number }[]
) {
  for (let sequence = 0; sequence < stops.length; sequence += 1) {
    const stopData = stops[sequence];

    // Reaproveita a parada se já existir uma com o mesmo nome (paradas
    // compartilhadas entre linhas, como "Pça. Afonso Pena" e "UNIVAP Campus")
    const existingStop = await prisma.transitStop.findFirst({ where: { name: stopData.name } });

    const stop =
      existingStop ??
      (await prisma.transitStop.create({
        data: { name: stopData.name, latitude: stopData.latitude, longitude: stopData.longitude },
      }));

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

main()
  .catch((error) => {
    console.error('❌ Erro ao popular dados de transporte:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
