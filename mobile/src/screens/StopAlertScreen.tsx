import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Bell, Vibrate, Volume2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'StopAlert'>;

/**
 * Alerta "Prepare-se!" (mockup 08), aberto ~200 m antes do destino. Fala e
 * vibra conforme a preferência de feedback do usuário; os selos mostram, em
 * texto, o que está ativado. Nunca fecha sozinha: o usuário toca em
 * "Entendido!".
 */
export function StopAlertScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce, voiceEnabled, hapticsEnabled } = useAccessibility();
  const { stopName } = route.params;
  useStatusBarStyle(theme.dark ? 'light' : 'dark');
  const c = theme.colors;

  useEffect(() => {
    announce(t('stopAlert.spoken', { name: stopName }), { haptic: 'warning' });
    // dispara uma única vez ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScreenContainer
      backgroundColor={c.warningBg}
      padding={24}
      contentStyle={styles.content}
    >
      <View style={[styles.circle, { backgroundColor: c.warningStrong }]} accessible={false} importantForAccessibility="no-hide-descendants">
        <Icon icon={Bell} size={46} color="#FFFFFF" strokeWidth={1.8} />
      </View>

      <AccessibleText variant="display" color={c.warningDark} style={styles.center} accessibilityRole="header" accessibilityLiveRegion="assertive">
        {t('stopAlert.title')}
      </AccessibleText>
      <AccessibleText variant="subtitle" weight="bold" color={c.warningDark} style={styles.center}>
        {t('stopAlert.subtitle')}
      </AccessibleText>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.warningStrong }]} accessible accessibilityLabel={`${t('stopAlert.yourStop')}: ${stopName}`}>
        <AccessibleText variant="label" color={c.textSecondary} style={styles.eyebrow}>
          {t('stopAlert.yourStop')}
        </AccessibleText>
        <AccessibleText variant="heading" weight="extrabold" style={styles.center}>
          {stopName}
        </AccessibleText>
      </View>

      <View style={styles.pills}>
        <Pill icon={Volume2} label={t(voiceEnabled ? 'stopAlert.voiceOn' : 'stopAlert.voiceOff')} />
        <Pill icon={Vibrate} label={t(hapticsEnabled ? 'stopAlert.hapticsOn' : 'stopAlert.hapticsOff')} />
      </View>

      <View style={styles.spacer} />
      <AccessibleButton label={t('stopAlert.understood')} variant="warning" size="lg" onPress={() => navigation.goBack()} style={styles.button} />
    </ScreenContainer>
  );
}

function Pill({ icon, label }: { icon: LucideIcon; label: string }) {
  const { theme } = useAccessibility();
  const c = theme.colors;
  return (
    <View style={[styles.pill, { borderColor: c.warningStrong, backgroundColor: c.warningSoft }]}>
      <Icon icon={icon} size={16} color={c.warning} />
      <AccessibleText variant="caption" weight="bold" color={c.warning}>
        {label}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  circle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  center: { textAlign: 'center' },
  card: {
    alignSelf: 'stretch',
    borderWidth: 2,
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    gap: 4,
    marginTop: 16,
  },
  eyebrow: { letterSpacing: 0.8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 14, minHeight: 36 },
  spacer: { height: 20 },
  button: { alignSelf: 'stretch' },
});
