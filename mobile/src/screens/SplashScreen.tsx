import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Brain, Bus, CircleCheck, Eye, PersonStanding } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { AccessibleText } from '../components/AccessibleText';
import { Icon } from '../components/Icon';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Splash'>;

/**
 * Tela de abertura (mockup 01). Não avança sozinha: o usuário toca para
 * continuar, sem limite de tempo (WCAG 2.2.1). A barra de progresso enche
 * devagar, sem piscar; com "reduzir movimento" ativo ela já aparece cheia.
 */
export function SplashScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0.33)).current;
  useStatusBarStyle('light');

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) {
        progress.setValue(1);
        return;
      }
      animation = Animated.timing(progress, {
        toValue: 1,
        duration: 2400,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      });
      animation.start();
    });
    return () => animation?.stop();
  }, [progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      style={styles.flex}
      onPress={() => navigation.replace('Login')}
      accessibilityRole="button"
      accessibilityLabel={t('splash.accessibilityLabel')}
    >
      <LinearGradient colors={['#1852A4', '#0B2854']} style={[styles.flex, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.center}>
          <View style={styles.logoTile} accessible={false} importantForAccessibility="no-hide-descendants">
            <Icon icon={Bus} size={52} color="#FFFFFF" strokeWidth={1.8} />
            <View style={styles.badge}>
              <Icon icon={CircleCheck} size={18} color="#FFFFFF" />
            </View>
          </View>

          <AccessibleText variant="display" color="#FFFFFF" style={styles.title}>
            {t('splash.title')}
          </AccessibleText>
          <AccessibleText variant="subtitle" weight="bold" color="#DDE6F5" style={styles.subtitle}>
            {t('splash.subtitle')}
          </AccessibleText>

          <AccessibleText variant="subtitle" weight="bold" color="#E8EFFF" style={styles.tagline}>
            {t('splash.tagline')}
          </AccessibleText>

          <View style={styles.pills}>
            <Pill icon={Eye} label={t('splash.visual')} />
            <Pill icon={Brain} label={t('splash.cognitive')} />
            <Pill icon={PersonStanding} label={t('splash.mobility')} />
          </View>
        </View>

        <View style={styles.bottom}>
          <View style={styles.track} accessible={false} importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.fill, { width }]} />
          </View>
          <AccessibleText variant="caption" weight="semibold" color="#DDE6F5" style={styles.tap}>
            {t('splash.tapToContinue')}
          </AccessibleText>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function Pill({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={styles.pill}>
      <Icon icon={icon} size={16} color="#FFFFFF" />
      <AccessibleText variant="caption" weight="bold" color="#FFFFFF">
        {label}
      </AccessibleText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  logoTile: {
    width: 112,
    height: 112,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center' },
  subtitle: { letterSpacing: 3, marginTop: 2, textAlign: 'center' },
  tagline: { marginTop: 32, textAlign: 'center' },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  bottom: {
    paddingHorizontal: 64,
    alignItems: 'center',
  },
  track: {
    height: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  tap: { marginTop: 14 },
});
