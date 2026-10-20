import { prisma } from '../../database/prisma';
import { MovementCheckBody } from './movement.schema';

// Regra da US13: movimentação é estimada pela concentração de usuários ativos
// do próprio GuiaMobi em torno da parada, e não pela quantidade de linhas.
export const MOVEMENT_CONFIG = {
  radiusMeters: 200,
  activeWindowMinutes: 5,
  highMovementMinUsers: 2,
} as const;

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

export async function checkMovement(userId: string, input: MovementCheckBody) {
  const radiusMeters = input.radiusMeters ?? MOVEMENT_CONFIG.radiusMeters;
  const activeSince = new Date(Date.now() - MOVEMENT_CONFIG.activeWindowMinutes * 60_000);

  // Armazenamos apenas a última posição de cada usuário ativo. A posição é
  // usada exclusivamente para calcular concentração; o endpoint nunca devolve
  // a posição ou identidade dos demais usuários.
  await prisma.userPresence.upsert({
    where: { userId },
    create: {
      userId,
      latitude: input.latitude,
      longitude: input.longitude,
      updatedAt: new Date(),
    },
    update: {
      latitude: input.latitude,
      longitude: input.longitude,
      updatedAt: new Date(),
    },
  });

  const latitudeDelta = radiusMeters / 111_320;
  const longitudeDelta = radiusMeters / (111_320 * Math.max(Math.cos(toRadians(input.targetLatitude)), 0.2));

  const candidates = await prisma.userPresence.findMany({
    where: {
      updatedAt: { gte: activeSince },
      latitude: { gte: input.targetLatitude - latitudeDelta, lte: input.targetLatitude + latitudeDelta },
      longitude: { gte: input.targetLongitude - longitudeDelta, lte: input.targetLongitude + longitudeDelta },
    },
    select: { latitude: true, longitude: true },
  });

  const targetLat = toRadians(input.targetLatitude);
  const targetLng = toRadians(input.targetLongitude);
  const earthRadius = 6_371_000;

  const activeUsers = candidates.filter((candidate) => {
    const lat = toRadians(candidate.latitude);
    const lng = toRadians(candidate.longitude);
    const dLat = lat - targetLat;
    const dLng = lng - targetLng;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(targetLat) * Math.cos(lat) * Math.sin(dLng / 2) ** 2;
    const distance = 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distance <= radiusMeters;
  }).length;

  return {
    activeUsers,
    highMovement: activeUsers >= MOVEMENT_CONFIG.highMovementMinUsers,
    radiusMeters,
  };
}
