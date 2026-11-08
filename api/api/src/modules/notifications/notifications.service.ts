import { prisma } from '../../database/prisma';
import { getRealtimeProvider } from '../../integrations/gtfsRealtime';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  priority: 'default' | 'high';
  channelId: string;
};

export const notificationsService = {
  async registerDevice(userId: string, expoPushToken: string, platform: string) {
    return prisma.pushDevice.upsert({
      where: { expoPushToken },
      create: { userId, expoPushToken, platform },
      update: { userId, platform },
    });
  },

  async unregisterDevices(userId: string) {
    await prisma.pushDevice.deleteMany({ where: { userId } });
  },

  async listSubscriptions(userId: string) {
    const items = await prisma.lineNotificationSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        line: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      lineId: item.line.id,
      lineCode: item.line.code,
      lineName: item.line.name,
      createdAt: item.createdAt.toISOString(),
    }));
  },

  async subscribeToLine(userId: string, lineId: string) {
    const line = await prisma.transitLine.findUnique({
      where: { id: lineId },
      select: { id: true, code: true, name: true },
    });

    if (!line) {
      throw new Error('Linha não encontrada.');
    }

    await prisma.lineNotificationSubscription.upsert({
      where: { userId_lineId: { userId, lineId } },
      create: { userId, lineId },
      update: {},
    });

    return {
      lineId: line.id,
      lineCode: line.code,
      lineName: line.name,
    };
  },

  async unsubscribeFromLine(userId: string, lineId: string) {
    await prisma.lineNotificationSubscription.deleteMany({
      where: { userId, lineId },
    });
  },

  /**
   * Consulta os Service Alerts oficiais e envia somente para usuários
   * explicitamente inscritos na linha afetada. A rotina não inventa alertas:
   * sem GTFS-Realtime configurado, nenhuma notificação é gerada.
   */
  async checkServiceAlerts() {
    const subscriptions = await prisma.lineNotificationSubscription.findMany({
      include: {
        line: {
          select: { id: true, code: true, name: true, gtfsRouteId: true },
        },
        user: {
          select: {
            id: true,
            pushDevices: {
              select: { id: true, expoPushToken: true },
            },
          },
        },
      },
    });

    if (!subscriptions.length) return { checked: 0, sent: 0 };

    const realtime = getRealtimeProvider();
    const availability = await realtime.getAvailability();
    if (!availability.serviceAlertsAvailable) return { checked: 0, sent: 0 };

    let sent = 0;
    const checked = new Set<string>();
    const messages: Array<{ message: PushMessage; userId: string; lineId: string; alertId: string }> = [];

    for (const subscription of subscriptions) {
      const { line } = subscription;
      if (!line.gtfsRouteId || !subscription.user.pushDevices.length) continue;

      const key = line.id;
      if (!checked.has(key)) {
        checked.add(key);
      }

      let alerts;
      try {
        alerts = await realtime.getServiceAlerts(line.gtfsRouteId);
      } catch (error) {
        console.warn(`[Notifications] Falha ao consultar alertas da linha ${line.code}:`, error);
        continue;
      }

      for (const alert of alerts) {
        const alreadyDelivered = await prisma.notificationDelivery.findUnique({
          where: {
            userId_lineId_alertId: {
              userId: subscription.user.id,
              lineId: line.id,
              alertId: alert.id,
            },
          },
          select: { id: true },
        });

        if (alreadyDelivered) continue;

        const body = alert.descriptionText
          ? `${alert.headerText}: ${alert.descriptionText}`
          : alert.headerText;

        for (const device of subscription.user.pushDevices) {
          messages.push({
            userId: subscription.user.id,
            lineId: line.id,
            alertId: alert.id,
            message: {
              to: device.expoPushToken,
              title: `Linha ${line.code}`,
              body,
              data: { lineId: line.id, alertId: alert.id, type: 'service-alert' },
              sound: 'default',
              priority: alert.severity === 'SEVERE' ? 'high' : 'default',
              channelId: 'service-alerts',
            },
          });
        }
      }
    }

    if (!messages.length) return { checked: checked.size, sent: 0 };

    // O Expo aceita lotes de mensagens. Mantemos lotes pequenos para evitar
    // payloads excessivos e para facilitar a identificação de tokens inválidos.
    for (let index = 0; index < messages.length; index += 100) {
      const batch = messages.slice(index, index + 100);

      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch.map((item) => item.message)),
        });

        if (!response.ok) {
          console.warn(`[Notifications] Expo Push Service respondeu ${response.status}.`);
          continue;
        }

        const result = await response.json() as {
          data?: Array<{ status: string; details?: { error?: string } }>;
        };

        for (let i = 0; i < batch.length; i += 1) {
          const item = batch[i];
          const ticket = result.data?.[i];

          if (ticket?.details?.error === 'DeviceNotRegistered') {
            await prisma.pushDevice.deleteMany({
              where: { expoPushToken: item.message.to },
            });
            continue;
          }

          if (ticket?.status === 'ok') {
            const created = await prisma.notificationDelivery.createMany({
              data: [{
                userId: item.userId,
                lineId: item.lineId,
                alertId: item.alertId,
              }],
              skipDuplicates: true,
            });
            sent += created.count;
          }
        }
      } catch (error) {
        console.warn('[Notifications] Falha ao enviar lote ao Expo Push Service:', error);
      }
    }

    return { checked: checked.size, sent };
  },
};
