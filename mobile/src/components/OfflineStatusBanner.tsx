import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useConnectivity } from '../hooks/useConnectivity';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AccessibleText } from './AccessibleText';
import { Icon } from './Icon';

/**
 * Indicador global da US16: sempre que o aparelho fica sem conectividade,
 * o usuário recebe um aviso visual e, respeitando o modo de feedback atual,
 * um anúncio de voz. Quando a conexão volta, o banner desaparece.
 */
export function OfflineStatusBanner() {
  const { t } = useTranslation();
  const { isConnected } = useConnectivity();
  const { theme, announce } = useAccessibility();
  const insets = useSafeAreaInsets();
  const previous = useRef<boolean | null>(null);
  const c = theme.colors;

  useEffect(() => {
    if (previous.current === null) {
      previous.current = isConnected;
      if (!isConnected) announce(t('common.offlineMessage'), { haptic: 'warning' });
      return;
    }
    if (previous.current !== isConnected) {
      previous.current = isConnected;
      if (!isConnected) announce(t('common.offlineMessage'), { haptic: 'warning' });
      else announce(t('common.onlineMessage'), { haptic: 'success' });
    }
  }, [announce, isConnected, t]);

  if (isConnected) return null;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: c.warningSoft,
          borderBottomColor: c.warning,
          paddingTop: Math.max(insets.top + 4, 12),
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon icon={WifiOff} size={18} color={c.warning} />
      <AccessibleText variant="caption" weight="extrabold" color={c.warning} style={styles.text}>
        {t('common.offlineShort')}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 52,
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  text: { flex: 1 },
});
