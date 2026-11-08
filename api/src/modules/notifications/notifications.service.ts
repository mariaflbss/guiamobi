import { prisma } from '../../database/prisma';
import { env } from '../../config/env';
import { getRealtimeProvider } from '../../integrations/gtfsRealtime';
import { ServiceAlert } from '../../integrations/gtfsRealtime/realtimeProvider.interface';

/** Tipo do aviso do ponto de vista do usuário (mesmos valores usados no app). */
export type LineNoticeKind = 'interruption' | 'detour' | 'change';

export interface LineNoticeDto {
  /** Estável enquanto a situação não muda; muda quando a situação muda. */
  id: string;
  lineId: string;
  kind: LineNoticeKind;
  /** Texto da fonte oficial. null = o app usa um texto padrão no idioma do usuário. */
  headerText: string | null;
  descriptionText: string | null;
}

export interface SubscriptionsState {
  enabled: boolean;
  lines: { lineId: string; code: string; name: string }[];
}

// Cache curto do feed de alertas: muitos aparelhos consultando a cada minuto
// não devem gerar uma chamada à operadora por consulta.
const ALERTS_CACHE_TTL_MS = 20_000;
let alertsCache: { at: number; alerts: ServiceAlert[] } | null = null;

async function loadServiceAlerts(): Promise<ServiceAlert[]> {
  const realtime = getRealtimeProvider();
  try {
    const availability = await realtime.getAvailability();
    if (!availability.serviceAlertsAvailable) return [];

    if (alertsCache && Date.now() - alertsCache.at < ALERTS_CACHE_TTL_MS) return alertsCache.alerts;
    const alerts = await realtime.getServiceAlerts();
    alertsCache = { at: Date.now(), alerts };
    return alerts;
  } catch {
    // Feed fora do ar: seguimos só com a situação operacional cadastrada.
    return alertsCache?.alerts ?? [];
  }
}

/**
 * Classifica um alerta oficial. Prioriza o campo "effect" do GTFS-Realtime;
 * quando a fonte não informa o efeito, usa o texto do próprio alerta. Nunca
 * usa a severidade: um alerta grave de atraso não é uma interrupção.
 */
export function classifyAlert(alert: Pick<ServiceAlert, 'effect' | 'headerText' | 'descriptionText'>): LineNoticeKind {
  if (alert.effect === 'NO_SERVICE') return 'interruption';
  if (alert.effect === 'DETOUR') return 'detour';
  if (alert.effect === 'OTHER') return 'change';

  const text = `${alert.headerText} ${alert.descriptionText ?? ''}`.toLocaleLowerCase('pt-BR');
  if (/desvi/.test(text)) return 'detour';
  if (/interromp|interrup|suspens|suspend|sem opera|paralis|não circula|nao circula/.test(text)) return 'interruption';
  return 'change';
}

export const notificationsService = {
  async getSubscriptions(userId: string): Promise<SubscriptionsState> {
    const [preference, subscriptions] = await Promise.all([
      prisma.userNotificationPreference.findUnique({ where: { userId } }),
      prisma.lineSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { line: { select: { id: true, code: true, name: true } } },
      }),
    ]);

    return {
      enabled: preference?.enabled ?? false,
      lines: subscriptions.map((item) => ({
        lineId: item.line.id,
        code: item.line.code,
        name: item.line.name,
      })),
    };
  },

  /**
   * Substitui o estado da conta pelo enviado pelo aparelho (o aparelho é a
   * fonte da verdade). Idempotente: repetir a chamada não muda o resultado.
   * IDs de linha que não existem mais são ignorados.
   */
  async replaceSubscriptions(userId: string, enabled: boolean, lineIds: string[]): Promise<SubscriptionsState> {
    const uniqueIds = Array.from(new Set(lineIds));
    const validLines = uniqueIds.length
      ? await prisma.transitLine.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } })
      : [];
    const validIds = validLines.map((line) => line.id);

    await prisma.$transaction([
      prisma.userNotificationPreference.upsert({
        where: { userId },
        create: { userId, enabled },
        update: { enabled },
      }),
      prisma.lineSubscription.deleteMany({ where: { userId, lineId: { notIn: validIds } } }),
      ...validIds.map((lineId) =>
        prisma.lineSubscription.upsert({
          where: { userId_lineId: { userId, lineId } },
          create: { userId, lineId },
          update: {},
        })
      ),
    ]);

    return this.getSubscriptions(userId);
  },

  /**
   * Avisos em vigor para as linhas informadas: situação operacional cadastrada
   * (atrasada/indisponível), cenário de teste local e alertas oficiais do
   * GTFS-Realtime. Sem fonte configurada a lista é vazia: nada é inventado.
   */
  async getLineNotices(lineIds: string[], testScenario?: 'change' | 'detour' | 'interruption'): Promise<LineNoticeDto[]> {
    if (lineIds.length === 0) return [];

    const lines = await prisma.transitLine.findMany({
      where: { id: { in: lineIds } },
      select: { id: true, code: true, gtfsRouteId: true, status: { select: { status: true, delayMinutes: true, reason: true, updatedAt: true } } },
    });

    const alerts = await loadServiceAlerts();
    const notices: LineNoticeDto[] = [];

    for (const line of lines) {
      // 1) Cenário de teste local determinístico. O parâmetro da rota é usado
      // apenas em desenvolvimento; o MOCK_TRANSIT_SCENARIO continua disponível
      // para testes de integração sem a interface.
      const envScenario = env.MOCK_TRANSIT_SCENARIO;
      const envKind =
        envScenario === `delayed-${line.code}` ? 'change' :
        envScenario === `unavailable-${line.code}` ? 'interruption' :
        envScenario === `detour-${line.code}` ? 'detour' : undefined;
      const scenarioKind = env.NODE_ENV !== 'production' ? testScenario ?? envKind : envKind;
      if (scenarioKind) {
        const scenarioId = `mock:${scenarioKind}:${line.id}`;
        const scenarioTitle =
          scenarioKind === 'change'
            ? 'Simulação: alteração na linha'
            : scenarioKind === 'interruption'
              ? 'Simulação: interrupção da linha'
              : 'Simulação: desvio na linha';
        notices.push({
          id: scenarioId,
          lineId: line.id,
          kind: scenarioKind,
          headerText: scenarioTitle,
          descriptionText: 'Cenário de teste local da US17.',
        });
      }

      // 2) Situação operacional cadastrada.
      if (line.status && line.status.status !== 'OPERATIONAL') {
        const delayed = line.status.status === 'DELAYED';
        const delayText = delayed && line.status.delayMinutes ? `Atraso de cerca de ${line.status.delayMinutes} min.` : null;
        notices.push({
          id: `status:${line.status.status}:${line.status.updatedAt.getTime()}`,
          lineId: line.id,
          kind: delayed ? 'change' : 'interruption',
          headerText: null,
          descriptionText: [delayText, line.status.reason].filter(Boolean).join(' ') || null,
        });
      }

      // 3) Alertas oficiais (GTFS-Realtime Service Alerts).
      if (line.gtfsRouteId) {
        for (const alert of alerts) {
          if (!alert.affectedLineIds.includes(line.gtfsRouteId)) continue;
          notices.push({
            id: `alert:${alert.id}`,
            lineId: line.id,
            kind: classifyAlert(alert),
            headerText: alert.headerText,
            descriptionText: alert.descriptionText,
          });
        }
      }
    }

    return notices;
  },
};
