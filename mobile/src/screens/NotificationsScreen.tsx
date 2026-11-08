import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, Plus, RefreshCw, Search } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { Icon } from '../components/Icon';
import { Card } from '../components/Card';
import { InlineMessage } from '../components/InlineMessage';
import { RouteBadge } from '../components/RouteBadge';
import { SettingSwitchRow } from '../components/SettingCard';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { useConnectivity } from '../hooks/useConnectivity';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { routesService } from '../services/api/routesService';
import { noticeKindLabel } from '../services/notifications/notificationService';
import { AppStackParamList } from '../navigation/types';
import { LineSearchResult } from '../types/routes';
import { LineNotice } from '../types/notifications';

type Props = NativeStackScreenProps<AppStackParamList, 'Notifications'>;

/**
 * Notificações (US17): chave geral, linhas acompanhadas (adicionar/remover) e
 * avisos recentes de alterações, desvios e interrupções. Tudo vem do SQLite do
 * aparelho, então o estado é o mesmo ao sair e voltar à tela. Nenhuma
 * mensagem técnica (token, Expo Go, erro de API) é exibida aqui.
 */
export function NotificationsScreen({ navigation }: Props) {
  const { t, i18n } = useTranslation();
  const { theme, announce } = useAccessibility();
  const {
    enabled,
    subscriptions,
    notices,
    permission,
    isLoaded,
    isFollowing,
    setEnabled,
    follow,
    unfollow,
    markAllRead,
    refreshNow,
  } = useNotifications();
  const { isConnected } = useConnectivity();
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LineSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Avisos que ainda não estavam lidos quando a tela abriu continuam em destaque nesta visita.
  const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
  useStatusBarStyle('light');
  const c = theme.colors;

  // Os avisos não lidos ficam em destaque durante esta visita (calculado uma vez, quando o estado local carrega)...
  const highlightComputed = useRef(false);
  useEffect(() => {
    if (!isLoaded || highlightComputed.current) return;
    highlightComputed.current = true;
    setHighlighted(new Set(notices.filter((notice) => !notice.readAt).map((notice) => notice.key)));
  }, [isLoaded, notices]);

  // ...e são marcados como lidos ao sair da tela.
  useFocusEffect(
    useCallback(
      () => () => {
        void markAllRead();
      },
      [markAllRead]
    )
  );

  // Busca de linhas com debounce (mesmo padrão da aba Rotas).
  useEffect(() => {
    const term = query.trim();
    if (!adding || !term) {
      setResults([]);
      setSearching(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      routesService
        .searchLines(term)
        .then((items) => {
          if (!cancelled) setResults(items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
            setSearched(true);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, adding]);

  async function toggleEnabled(next: boolean) {
    await setEnabled(next);
    announce(t(next ? 'notifications.enabledAnnounce' : 'notifications.disabledAnnounce'), { haptic: 'success' });
  }

  async function followLine(line: LineSearchResult) {
    await follow({ lineId: line.lineId, code: line.lineCode, name: line.lineName });
    announce(t('notifications.followedAnnounce', { code: line.lineCode }), { haptic: 'success' });
  }

  async function unfollowLine(lineId: string, code: string) {
    await unfollow(lineId);
    announce(t('notifications.unfollowedAnnounce', { code }), { haptic: 'success' });
  }

  async function checkNow(scenario?: 'change' | 'detour' | 'interruption') {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshNow(scenario);
    } finally {
      setRefreshing(false);
    }
  }

  function formatWhen(notice: LineNotice): string {
    const date = new Date(notice.createdAt);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(i18n.language === 'pt' ? 'pt-BR' : i18n.language, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const permissionMessage =
    enabled && permission === 'denied'
      ? t('notifications.permissionDenied')
      : enabled && permission === 'unavailable'
        ? t('notifications.insideAppOnly')
        : null;

  return (
    <ScreenContainer
      scroll
      header={
        <ScreenHeader
          title={t('notifications.title')}
          subtitle={t('notifications.subtitle')}
          onBack={() => navigation.goBack()}
        />
      }
    >
      {!isLoaded ? <ActivityIndicator size="small" color={c.primary} style={styles.loading} /> : null}

      <SettingSwitchRow
        icon={enabled ? Bell : BellOff}
        tone="warning"
        title={t('notifications.switchTitle')}
        description={t('notifications.switchDescription')}
        value={enabled}
        onValueChange={(next) => void toggleEnabled(next)}
      />

      {permissionMessage ? <InlineMessage message={permissionMessage} tone="info" /> : null}

      {/* Linhas acompanhadas */}
      <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={styles.sectionTitle}>
        {t('notifications.linesTitle')}
      </AccessibleText>

      {subscriptions.length === 0 ? (
        <AccessibleText variant="body" color={c.textSecondary} style={styles.empty}>
          {t('notifications.noLines')}
        </AccessibleText>
      ) : (
        subscriptions.map((line) => (
          <Card key={line.lineId} style={styles.lineCard}>
            <View style={styles.lineHead}>
              <RouteBadge code={line.code} />
              <AccessibleText variant="body" weight="extrabold" style={styles.flex} numberOfLines={2}>
                {line.name}
              </AccessibleText>
            </View>
            <AccessibleButton
              label={t('notifications.unfollow')}
              variant="dangerSoft"
              accessibilityHint={t('notifications.unfollowLabel', { code: line.code, name: line.name })}
              onPress={() => void unfollowLine(line.lineId, line.code)}
            />
          </Card>
        ))
      )}

      {adding ? (
        <View style={styles.searchBox}>
          <AccessibleTextInput
            label={t('notifications.searchLabel')}
            placeholder={t('notifications.searchPlaceholder')}
            icon={Search}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!isConnected ? <InlineMessage message={t('notifications.offlineSearch')} tone="warning" /> : null}
          {searching ? <ActivityIndicator size="small" color={c.primary} /> : null}
          {!searching && searched && results.length === 0 ? (
            <AccessibleText variant="body" color={c.textSecondary}>
              {t('notifications.noResults')}
            </AccessibleText>
          ) : null}
          {results.map((line) => {
            const already = isFollowing(line.lineId);
            return (
              <Card key={line.lineId} style={styles.lineCard}>
                <View style={styles.lineHead}>
                  <RouteBadge code={line.lineCode} />
                  <AccessibleText variant="body" weight="extrabold" style={styles.flex} numberOfLines={2}>
                    {line.lineName}
                  </AccessibleText>
                </View>
                <AccessibleButton
                  label={already ? t('notifications.following') : t('notifications.follow')}
                  variant={already ? 'secondary' : 'primary'}
                  disabled={already}
                  accessibilityHint={t('notifications.followLabel', { code: line.lineCode, name: line.lineName })}
                  onPress={() => void followLine(line)}
                />
              </Card>
            );
          })}
          <AccessibleButton
            label={t('common.close')}
            variant="link"
            onPress={() => {
              setAdding(false);
              setQuery('');
            }}
          />
        </View>
      ) : (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.addLine')}
          style={[styles.add, { borderColor: c.borderStrong }]}
        >
          <Icon icon={Plus} size={20} color={c.textSecondary} />
          <AccessibleText variant="body" weight="bold" color={c.textSecondary}>
            {t('notifications.addLine')}
          </AccessibleText>
        </Pressable>
      )}

      {/* Avisos recentes */}
      <AccessibleText variant="subtitle" weight="extrabold" accessibilityRole="header" style={[styles.sectionTitle, styles.noticesTitle]}>
        {t('notifications.noticesTitle')}
      </AccessibleText>

      {notices.length === 0 ? (
        <AccessibleText variant="body" color={c.textSecondary} style={styles.empty}>
          {t('notifications.noNotices')}
        </AccessibleText>
      ) : (
        notices.map((notice) => {
          const isNew = highlighted.has(notice.key);
          const kind = noticeKindLabel(notice.kind);
          return (
            <Card
              key={notice.key}
              accessible
              accessibilityLabel={[
                isNew ? t('notifications.newBadge') : null,
                t('notifications.systemTitle', { code: notice.code, kind }),
                notice.title,
                notice.body,
                formatWhen(notice),
              ]
                .filter(Boolean)
                .join('. ')}
              borderColor={isNew ? c.warning : undefined}
              style={styles.noticeCard}
            >
              <View style={styles.noticeHead}>
                <RouteBadge code={notice.code} size={38} />
                <View style={styles.flex}>
                  <AccessibleText variant="caption" weight="extrabold" color={c.warning}>
                    {kind}
                    {isNew ? ` · ${t('notifications.newBadge')}` : ''}
                  </AccessibleText>
                  <AccessibleText variant="caption" color={c.textSecondary}>
                    {formatWhen(notice)}
                  </AccessibleText>
                </View>
              </View>
              <AccessibleText variant="body" weight="bold">
                {notice.title}
              </AccessibleText>
              {notice.body ? (
                <AccessibleText variant="caption" color={c.textSecondary}>
                  {notice.body}
                </AccessibleText>
              ) : null}
            </Card>
          );
        })
      )}

      {__DEV__ && enabled && subscriptions.length > 0 ? (
        <Card style={styles.testCard}>
          <AccessibleText variant="caption" weight="extrabold">
            Teste da US17
          </AccessibleText>
          <AccessibleText variant="caption" color={c.textSecondary}>
            Gere um aviso para a linha acompanhada, sem depender de GTFS-Realtime.
          </AccessibleText>
          <AccessibleButton
            label="Simular alteração"
            variant="secondary"
            onPress={() => void checkNow('change')}
            loading={refreshing}
          />
          <AccessibleButton
            label="Simular desvio"
            variant="secondary"
            onPress={() => void checkNow('detour')}
            loading={refreshing}
          />
          <AccessibleButton
            label="Simular interrupção"
            variant="secondary"
            onPress={() => void checkNow('interruption')}
            loading={refreshing}
          />
        </Card>
      ) : null}

      {enabled && subscriptions.length > 0 ? (
        <AccessibleButton
          label={t('notifications.checkNow')}
          icon={RefreshCw}
          variant="secondary"
          loading={refreshing}
          accessibilityHint={t('notifications.checkNowHint')}
          onPress={() => void checkNow()}
          style={styles.checkNow}
        />
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginBottom: 8 },
  sectionTitle: { marginTop: 18, marginBottom: 10 },
  noticesTitle: { marginTop: 24 },
  empty: { marginBottom: 12 },
  lineCard: { padding: 12, marginBottom: 10, gap: 10 },
  lineHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { gap: 10, marginTop: 4 },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  noticeCard: { padding: 14, marginBottom: 10, gap: 6 },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkNow: { marginTop: 14, marginBottom: 12 },
  testCard: { padding: 14, marginTop: 14, gap: 10 },
});
