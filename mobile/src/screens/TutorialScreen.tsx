import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CommonActions } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Accessibility, Clock3, Flag, Heart, Lightbulb, MapPin, Route, Volume2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { ScreenHeader } from '../components/ScreenHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useAuth } from '../hooks/useAuth';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { speechService } from '../services/speech/speechService';
import { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'Tutorial'>;

const STEPS: { key: string; icon: LucideIcon }[] = [
  { key: 'origin', icon: MapPin },
  { key: 'destination', icon: Flag },
  { key: 'routes', icon: Route },
  { key: 'favorites', icon: Heart },
  { key: 'history', icon: Clock3 },
  { key: 'accessibility', icon: Accessibility },
  { key: 'simpleMode', icon: Lightbulb },
];

/**
 * Tutorial acessível passo a passo. Abre sozinho logo após o cadastro
 * (primeiro acesso) e continua disponível em Configurações. Cada passo:
 * título como cabeçalho, contagem "Passo X de Y" anunciada, e voz -
 * anunciada sozinha quando o feedback por voz está ativo e NÃO há leitor
 * de tela (que já leria o conteúdo), ou sob demanda em "Ouvir explicação".
 * O usuário pode voltar, avançar, pular ou concluir a qualquer momento.
 */
export function TutorialScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { theme, announce, speak, language, voiceEnabled } = useAccessibility();
  const { completeTutorial } = useAuth();
  const firstAccess = Boolean(route.params?.firstAccess);
  const [index, setIndex] = useState(0);
  useStatusBarStyle('light');
  const c = theme.colors;

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === STEPS.length - 1;
  const title = t(`tutorial.steps.${step.key}.title`);
  const description = t(`tutorial.steps.${step.key}.description`);

  useEffect(() => {
    let cancelled = false;
    speechService.stop();
    AccessibilityInfo.isScreenReaderEnabled().then((screenReader) => {
      if (!cancelled && !screenReader && voiceEnabled) {
        announce(`${t('tutorial.stepOf', { current: index + 1, total: STEPS.length })}. ${title}. ${description}`);
      }
    });
    return () => {
      cancelled = true;
    };
    // fala o passo ao mudar de passo (idioma/voz lidos no momento)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, language]);

  useEffect(() => () => speechService.stop(), []);

  async function leave() {
    speechService.stop();
    if (firstAccess) {
      await completeTutorial();
      navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs' }] }));
    } else {
      navigation.goBack();
    }
  }

  return (
    <ScreenContainer
      scroll
      header={
        <ScreenHeader
          title={t('tutorial.title')}
          subtitle={firstAccess ? t('tutorial.welcome') : undefined}
          onBack={firstAccess ? undefined : leave}
        />
      }
    >
      <AccessibleText
        variant="label"
        color={c.textSecondary}
        style={styles.progressText}
        accessibilityLiveRegion="polite"
      >
        {t('tutorial.stepOf', { current: index + 1, total: STEPS.length }).toUpperCase()}
      </AccessibleText>

      <View style={styles.dots} accessible={false} importantForAccessibility="no-hide-descendants">
        {STEPS.map((item, i) => (
          <View
            key={item.key}
            style={[styles.dot, { backgroundColor: i <= index ? c.primary : c.borderStrong, width: i === index ? 28 : 10 }]}
          />
        ))}
      </View>

      <Card style={styles.card}>
        <View style={[styles.tile, { backgroundColor: c.primarySoft }]} accessible={false} importantForAccessibility="no-hide-descendants">
          <Icon icon={step.icon} size={40} color={c.primary} />
        </View>
        <AccessibleText variant="title" weight="extrabold" style={styles.center} accessibilityRole="header">
          {title}
        </AccessibleText>
        <AccessibleText variant="subtitle" weight="regular" color={c.text} style={styles.description}>
          {description}
        </AccessibleText>
        <AccessibleButton label={t('tutorial.listen')} icon={Volume2} variant="soft" onPress={() => speak(`${title}. ${description}`)} />
      </Card>

      <View style={styles.actions}>
        {!isFirst ? (
          <View style={styles.flex}>
            <AccessibleButton label={t('tutorial.previous')} variant="secondary" onPress={() => setIndex((i) => i - 1)} />
          </View>
        ) : null}
        <View style={styles.flex}>
          <AccessibleButton
            label={isLast ? t('tutorial.finish') : t('tutorial.next')}
            onPress={() => (isLast ? leave() : setIndex((i) => i + 1))}
          />
        </View>
      </View>

      {!isLast ? <AccessibleButton label={t('tutorial.skip')} variant="link" onPress={leave} style={styles.skip} /> : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  progressText: { letterSpacing: 0.8, marginBottom: 8 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  dot: { height: 10, borderRadius: 5 },
  card: { padding: 20, gap: 14, alignItems: 'stretch' },
  tile: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  center: { textAlign: 'center' },
  description: { lineHeight: 24 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  skip: { marginTop: 8, alignSelf: 'center' },
});
