import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BellRing, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useNotifications } from '../contexts/NotificationsContext';
import { noticeKindLabel } from '../services/notifications/notificationService';
import { openNotificationsScreen } from '../navigation/navigationRef';
import { MIN_TOUCH_TARGET } from '../theme/theme';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';

/**
 * Faixa exibida no topo, em qualquer tela (inclusive durante a viagem), quando
 * chega um aviso de linha acompanhada com o app aberto. Tocar abre a tela de
 * Notificações; some sozinha depois de alguns segundos. A notificação do
 * sistema só é usada com o app fechado/em segundo plano.
 */
export function LineNoticeBanner() {
  const { t } = useTranslation();
  const { theme } = useAccessibility();
  const { banner, dismissBanner } = useNotifications();
  const insets = useSafeAreaInsets();
  const c = theme.colors;

  if (!banner) return null;

  const heading = t('notifications.systemTitle', { code: banner.code, kind: noticeKindLabel(banner.kind) });

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <View
        style={[styles.card, { backgroundColor: c.surface, borderColor: c.warning }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
      >
        <Pressable
          style={styles.main}
          onPress={() => {
            dismissBanner();
            openNotificationsScreen();
          }}
          accessibilityRole="button"
          accessibilityLabel={`${heading}. ${banner.title}`}
          accessibilityHint={t('notifications.bannerHint')}
        >
          <Icon icon={BellRing} size={22} color={c.warning} />
          <View style={styles.texts}>
            <AccessibleText variant="caption" weight="extrabold" color={c.warning}>
              {heading}
            </AccessibleText>
            <AccessibleText variant="body" weight="semibold" numberOfLines={2}>
              {banner.title}
            </AccessibleText>
          </View>
        </Pressable>
        <Pressable
          onPress={dismissBanner}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.bannerClose')}
          style={styles.close}
        >
          <Icon icon={X} size={20} color={c.textSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 50, elevation: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, minHeight: MIN_TOUCH_TARGET },
  texts: { flex: 1 },
  close: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
});
