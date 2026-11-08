import i18n from '../../locales/i18n';
import { LANGUAGE_STORAGE_KEY, SECURE_STORE_KEYS } from '../../constants/config';
import { notificationsRepository } from '../../database/repositories/notificationsRepository';
import { notificationsApiService } from '../api/notificationsService';
import { connectivityService } from '../connectivity/connectivityService';
import { secureStorageService } from '../storage/secureStorageService';
import { LineNotice, LineNoticeKind, RemoteLineNotice } from '../../types/notifications';
import { getNotificationsModule } from './notificationRuntime';

/**
 * Serviço das notificações de linhas (US17).
 *
 * Como funciona (sem depender de push remoto):
 *  1. o aparelho consulta a API pelos avisos em vigor das linhas acompanhadas
 *     (em primeiro plano a cada minuto, ao voltar ao app, ao recuperar a
 *     internet e, quando o sistema permite, em segundo plano);
 *  2. cada aviso novo é gravado no SQLite (a chave impede repetição) e vira
 *     uma notificação do sistema, ou uma faixa dentro do app quando o app está aberto;
 *  3. toda falha de rede/API é silenciosa: o estado local não é alterado.
 */

export const NOTIFICATION_CHANNEL_ID = 'line-notices';
export const FOREGROUND_POLL_INTERVAL_MS = 60_000;

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unavailable';

type NoticeListener = (notices: LineNotice[], context: { appActive: boolean }) => void;
const noticeListeners = new Set<NoticeListener>();

/** Avisa a interface (provider) quando chegam avisos novos. */
export function subscribeToNewNotices(listener: NoticeListener): () => void {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
}

// Só o provider (app aberto na tela) marca o app como ativo. Numa execução em
// segundo plano ele não existe, então o padrão é "inativo" e o aviso vira
// notificação do sistema. Não usamos AppState aqui porque, em tarefas
// headless, o valor dele não é confiável.
let appForeground = false;

export function setAppForeground(active: boolean): void {
  appForeground = active;
}

// ── Texto ──────────────────────────────────────────────────────────────────

export function noticeKindLabel(kind: LineNoticeKind): string {
  return i18n.t(`notifications.kind.${kind}`);
}

export function noticeTitle(notice: Pick<LineNotice, 'kind' | 'code'>): string {
  return i18n.t('notifications.systemTitle', { code: notice.code, kind: noticeKindLabel(notice.kind) });
}

function hashText(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) hash = ((hash * 33) ^ value.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

/**
 * Transforma o aviso da API em aviso local. A chave muda quando o texto da
 * fonte muda (uma atualização do aviso é uma nova alteração) e é a mesma
 * enquanto nada muda (nunca notifica duas vezes o mesmo aviso).
 */
export function buildLocalNotice(
  remote: RemoteLineNotice,
  line: { code: string; name: string },
  now: Date = new Date()
): LineNotice {
  return {
    key: `${remote.lineId}:${remote.id}:${hashText(`${remote.headerText ?? ''}|${remote.descriptionText ?? ''}`)}`,
    lineId: remote.lineId,
    code: line.code,
    name: line.name,
    kind: remote.kind,
    title: remote.headerText?.trim() || i18n.t(`notifications.defaultTitle.${remote.kind}`),
    body: remote.descriptionText?.trim() || null,
    createdAt: now.toISOString(),
    readAt: null,
  };
}

// ── Notificações do sistema ────────────────────────────────────────────────

let handlerConfigured = false;

/** Configura (uma vez) como o sistema exibe as notificações e cria o canal do Android. */
export async function configureSystemNotifications(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications || handlerConfigured) return;
  handlerConfigured = true;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        // Com o app aberto a faixa dentro do app faz esse papel; sem duplicar.
        shouldShowBanner: false,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: i18n.t('notifications.channelName'),
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Sem notificação do sistema, o app segue avisando por dentro.
  }
}

export async function getPermissionState(): Promise<PermissionState> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return 'unavailable';
  try {
    const result = await Notifications.getPermissionsAsync();
    if (result.granted) return 'granted';
    return result.canAskAgain === false || result.status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

/** Pede a permissão do sistema. Nunca lança: negar a permissão não impede o uso do app. */
export async function requestPermission(): Promise<PermissionState> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return 'unavailable';
  try {
    await configureSystemNotifications();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.canAskAgain === false) return 'denied';
    const result = await Notifications.requestPermissionsAsync();
    return result.granted ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}

async function presentSystemNotification(notice: LineNotice): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    if ((await getPermissionState()) !== 'granted') return;
    await configureSystemNotifications();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: noticeTitle(notice),
        body: notice.body ? `${notice.title}. ${notice.body}` : notice.title,
        data: { screen: 'Notifications', lineId: notice.lineId, key: notice.key },
      },
      trigger: null,
    });
  } catch {
    // Falha ao exibir a notificação do sistema nunca chega ao usuário.
  }
}

/** Chama `onTap` quando o usuário toca numa notificação (app aberto, em segundo plano ou fechado). */
export function subscribeToNotificationTaps(onTap: () => void): () => void {
  const Notifications = getNotificationsModule();
  if (!Notifications) return () => undefined;

  try {
    const subscription = Notifications.addNotificationResponseReceivedListener(() => onTap());
    // App aberto pela notificação (estava fechado): a resposta fica guardada.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) onTap();
      })
      .catch(() => undefined);
    return () => subscription.remove();
  } catch {
    return () => undefined;
  }
}

export async function dismissAllSystemNotifications(): Promise<void> {
  const Notifications = getNotificationsModule();
  if (!Notifications) return;
  try {
    await Notifications.dismissAllNotificationsAsync();
  } catch {
    // ignorado
  }
}

// ── Verificação de avisos ──────────────────────────────────────────────────

async function getCurrentUserId(): Promise<string | null> {
  const user = await secureStorageService.getObject<{ id?: string }>(SECURE_STORE_KEYS.USER);
  return user?.id ?? null;
}

/** Em segundo plano o i18n pode estar no idioma padrão: aplica o idioma salvo. */
async function applySavedLanguage(): Promise<void> {
  try {
    const saved = await secureStorageService.getItem(LANGUAGE_STORAGE_KEY);
    if (saved && saved !== i18n.language && ['pt', 'en', 'es'].includes(saved)) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // mantém o idioma atual
  }
}

let checking: Promise<LineNotice[]> | null = null;

/**
 * Consulta os avisos das linhas acompanhadas e registra/notifica os novos.
 * Executa uma verificação por vez (chamadas simultâneas compartilham a mesma).
 * Devolve os avisos novos; em qualquer falha devolve lista vazia.
 */
export function checkLineNotices(scenario?: 'change' | 'detour' | 'interruption'): Promise<LineNotice[]> {
  if (!checking) {
    checking = runCheck(scenario)
      .catch(() => [] as LineNotice[])
      .finally(() => {
        checking = null;
      });
  }
  return checking;
}

async function runCheck(scenario?: 'change' | 'detour' | 'interruption'): Promise<LineNotice[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const preferences = await notificationsRepository.getPreferences(userId);
  if (!preferences.enabled) return [];

  const subscriptions = await notificationsRepository.findAllSubscriptions(userId);
  if (subscriptions.length === 0) return [];

  if (!(await connectivityService.isConnected().catch(() => false))) return [];

  let remote: RemoteLineNotice[];
  try {
    remote = await notificationsApiService.getLineNotices(subscriptions.map((line) => line.lineId), scenario);
  } catch {
    return [];
  }

  // O usuário pode ter desligado ou removido linhas durante a consulta.
  const [currentPrefs, currentSubs, currentUserId] = await Promise.all([
    notificationsRepository.getPreferences(userId),
    notificationsRepository.findAllSubscriptions(userId),
    getCurrentUserId(),
  ]);
  if (currentUserId !== userId || !currentPrefs.enabled) return [];

  const byLine = new Map(currentSubs.map((line) => [line.lineId, line]));
  const candidates = remote
    .filter((notice) => byLine.has(notice.lineId))
    .map((notice) => buildLocalNotice(notice, byLine.get(notice.lineId)!));

  const fresh = await notificationsRepository.insertNewNotices(userId, candidates);
  if (fresh.length === 0) return [];

  const appActive = appForeground;
  if (!appActive) {
    await applySavedLanguage();
    for (const notice of fresh) {
      await presentSystemNotification(notice);
    }
  }

  noticeListeners.forEach((listener) => {
    try {
      listener(fresh, { appActive });
    } catch {
      // um ouvinte com erro não pode derrubar a verificação
    }
  });
  return fresh;
}

// ── Sincronização silenciosa com a API ─────────────────────────────────────

let syncing: Promise<void> | null = null;

/**
 * Mantém a cópia da conta em dia: restaura do servidor se este aparelho ainda
 * não tem estado próprio, ou envia as mudanças pendentes. O estado local nunca
 * é alterado por uma falha; ela só deixa a sincronização pendente.
 */
export function syncSubscriptions(): Promise<void> {
  if (!syncing) {
    syncing = runSync()
      .catch(() => undefined)
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
}

async function runSync(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  if (!(await connectivityService.isConnected().catch(() => false))) return;

  const preferences = await notificationsRepository.getPreferences(userId);

  if (!preferences.initialized) {
    const remote = await notificationsApiService.getSubscriptions();
    await notificationsRepository.restoreFromServer(userId, remote);
    return;
  }

  if (!preferences.syncPending) return;

  const subscriptions = await notificationsRepository.findAllSubscriptions(userId);
  await notificationsApiService.replaceSubscriptions(
    preferences.enabled,
    subscriptions.map((line) => line.lineId)
  );
  await notificationsRepository.markSynced(userId, preferences.updatedAt);
}
