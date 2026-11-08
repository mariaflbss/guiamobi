import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuthContext } from './AuthContext';
import { useAccessibility } from './AccessibilityContext';
import { notificationsRepository } from '../database/repositories/notificationsRepository';
import { connectivityService } from '../services/connectivity/connectivityService';
import {
  FOREGROUND_POLL_INTERVAL_MS,
  PermissionState,
  checkLineNotices,
  configureSystemNotifications,
  dismissAllSystemNotifications,
  getPermissionState,
  noticeKindLabel,
  requestPermission,
  setAppForeground,
  subscribeToNewNotices,
  subscribeToNotificationTaps,
  syncSubscriptions,
} from '../services/notifications/notificationService';
import { shouldBackgroundRun, updateBackgroundRegistration } from '../services/notifications/backgroundTask';
import { openNotificationsScreen } from '../navigation/navigationRef';
import { LineNotice, LineSubscription } from '../types/notifications';

interface NotificationsContextValue {
  /** true depois da primeira leitura do que está salvo no aparelho. */
  isLoaded: boolean;
  /** Chave geral de notificações. */
  enabled: boolean;
  subscriptions: LineSubscription[];
  notices: LineNotice[];
  unreadCount: number;
  /** Estado da permissão do sistema (negada não impede o uso: os avisos aparecem no app). */
  permission: PermissionState;
  /** Aviso recém-chegado, exibido como faixa enquanto o app está aberto. */
  banner: LineNotice | null;
  isFollowing: (lineId: string) => boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  follow: (line: LineSubscription) => Promise<void>;
  unfollow: (lineId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissBanner: () => void;
  refreshNow: (scenario?: 'change' | 'detour' | 'interruption') => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

/**
 * Estado das notificações de linhas (US17), compartilhado por todo o app.
 *
 * O estado vem do SQLite (por usuário), então sobrevive a sair e voltar à
 * tela, fechar o app e reabrir. A verificação de avisos roda em qualquer tela
 * (inclusive durante o acompanhamento da viagem) enquanto houver linhas
 * acompanhadas e a chave geral estiver ligada. Falhas de rede/API são
 * silenciosas.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuthContext();
  const { announce } = useAccessibility();
  const userId = user?.id ?? null;

  const [isLoaded, setIsLoaded] = useState(false);
  const [enabled, setEnabledState] = useState(false);
  const [subscriptions, setSubscriptions] = useState<LineSubscription[]>([]);
  const [notices, setNotices] = useState<LineNotice[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState<PermissionState>('undetermined');
  const [banner, setBanner] = useState<LineNotice | null>(null);

  const userIdRef = useRef<string | null>(userId);
  userIdRef.current = userId;
  const announceRef = useRef(announce);
  announceRef.current = announce;
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Relê tudo do SQLite. Ignora o resultado se a conta mudou no meio do caminho. */
  const reload = useCallback(async () => {
    const forUser = userIdRef.current;
    if (!forUser) return;
    try {
      const [preferences, lines, items, unread] = await Promise.all([
        notificationsRepository.getPreferences(forUser),
        notificationsRepository.findAllSubscriptions(forUser),
        notificationsRepository.findNotices(),
        notificationsRepository.countUnread(),
      ]);
      if (userIdRef.current !== forUser) return;
      setEnabledState(preferences.enabled);
      setSubscriptions(lines);
      setNotices(items);
      setUnreadCount(unread);
    } catch {
      // Leitura local falhou: mantém o que já está na tela.
    }
  }, []);

  const refreshPermission = useCallback(async () => {
    setPermission(await getPermissionState());
  }, []);

  /** Sincroniza com a API (silencioso) e verifica avisos novos. */
  const syncAndCheck = useCallback(async () => {
    await syncSubscriptions();
    await reload(); // pode ter restaurado o estado vindo da conta
    await checkLineNotices();
  }, [reload]);

  // Carga inicial / troca de conta.
  useEffect(() => {
    setIsLoaded(false);
    setEnabledState(false);
    setSubscriptions([]);
    setNotices([]);
    setUnreadCount(0);
    setBanner(null);
    if (!userId) return;

    let cancelled = false;
    void (async () => {
      await configureSystemNotifications();
      await reload();
      if (cancelled) return;
      setIsLoaded(true);
      void refreshPermission();
      void syncAndCheck();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, reload, refreshPermission, syncAndCheck]);

  const hasActiveSubscriptions = Boolean(userId) && enabled && subscriptions.length > 0;

  // Verificação periódica enquanto o app está aberto (em qualquer tela).
  useEffect(() => {
    if (!hasActiveSubscriptions) return;
    const timer = setInterval(() => {
      void checkLineNotices();
    }, FOREGROUND_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasActiveSubscriptions]);

  // Volta ao app: atualiza permissão, sincroniza e verifica na hora.
  useEffect(() => {
    if (!userId) return;
    setAppForeground(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      setAppForeground(state === 'active');
      if (state === 'active') {
        void refreshPermission();
        void syncAndCheck();
      }
    });
    return () => {
      subscription.remove();
      setAppForeground(false);
    };
  }, [userId, refreshPermission, syncAndCheck]);

  // Internet voltou: sincroniza pendências e verifica avisos.
  useEffect(() => {
    if (!userId) return;
    let wasOnline: boolean | null = null;
    void connectivityService.isConnected().then((online) => {
      wasOnline = online;
    }).catch(() => undefined);
    return connectivityService.subscribe((online) => {
      if (online && wasOnline === false) void syncAndCheck();
      wasOnline = online;
    });
  }, [userId, syncAndCheck]);

  // Avisos novos: atualiza a lista e mostra a faixa dentro do app.
  useEffect(() => {
    if (!userId) return;
    return subscribeToNewNotices((fresh, context) => {
      void reload();
      if (!context.appActive || fresh.length === 0) return;

      const latest = fresh[0];
      setBanner(latest);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => setBanner(null), 10_000);

      const spoken = fresh.length > 1
        ? t('notifications.announceMany', { count: fresh.length })
        : t('notifications.announceOne', { code: latest.code, kind: noticeKindLabel(latest.kind), title: latest.title });
      announceRef.current(spoken, { haptic: 'warning' });
    });
  }, [userId, reload, t]);

  // Toque numa notificação do sistema abre a tela de Notificações.
  useEffect(() => {
    if (!userId) return;
    return subscribeToNotificationTaps(() => openNotificationsScreen());
  }, [userId]);

  // Tarefa em segundo plano só existe enquanto há o que verificar.
  useEffect(() => {
    if (!userId || !isLoaded) return;
    void shouldBackgroundRun().then(updateBackgroundRegistration);
  }, [userId, isLoaded, enabled, subscriptions.length]);

  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const turnOnIfNeeded = useCallback(async () => {
    // Pedir permissão do sistema nunca bloqueia: se negada, os avisos seguem no app.
    setPermission(await requestPermission());
    await notificationsRepository.setEnabled(true);
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    try {
      if (next) {
        await turnOnIfNeeded();
      } else {
        await notificationsRepository.setEnabled(false);
        setBanner(null);
        void dismissAllSystemNotifications();
      }
    } catch {
      // Falha local: a tela relê o estado real abaixo.
    }
    await reload();
    void syncAndCheck();
  }, [turnOnIfNeeded, reload, syncAndCheck]);

  const follow = useCallback(async (line: LineSubscription) => {
    try {
      await notificationsRepository.addSubscription(line);
      const preferences = await notificationsRepository.getPreferences();
      if (!preferences.enabled) await turnOnIfNeeded();
    } catch {
      // Falha local: a tela relê o estado real abaixo.
    }
    await reload();
    void syncAndCheck();
  }, [turnOnIfNeeded, reload, syncAndCheck]);

  const unfollow = useCallback(async (lineId: string) => {
    try {
      await notificationsRepository.removeSubscription(lineId);
    } catch {
      // Falha local: a tela relê o estado real abaixo.
    }
    await reload();
    void syncSubscriptions();
  }, [reload]);

  const markAllRead = useCallback(async () => {
    try {
      await notificationsRepository.markAllRead();
    } catch {
      // ignorado
    }
    await reload();
  }, [reload]);

  const dismissBanner = useCallback(() => setBanner(null), []);

  const refreshNow = useCallback(async (scenario?: 'change' | 'detour' | 'interruption') => {
    await syncSubscriptions();
    await reload();
    await checkLineNotices(scenario);
    await reload();
  }, [reload]);

  const followingIds = useMemo(() => new Set(subscriptions.map((line) => line.lineId)), [subscriptions]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      isLoaded,
      enabled,
      subscriptions,
      notices,
      unreadCount,
      permission,
      banner,
      isFollowing: (lineId: string) => followingIds.has(lineId),
      setEnabled,
      follow,
      unfollow,
      markAllRead,
      dismissBanner,
      refreshNow,
    }),
    [isLoaded, enabled, subscriptions, notices, unreadCount, permission, banner, followingIds, setEnabled, follow, unfollow, markAllRead, dismissBanner, refreshNow]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications deve ser usado dentro de um NotificationsProvider');
  return context;
}
