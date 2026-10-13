import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackTitleHeader } from '../components/BackTitleHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleButton } from '../components/AccessibleButton';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { speechService } from '../services/speech/speechService';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'PrivacyPolicy'>;

export function PrivacyPolicyScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, language, settings } = useAccessibility();
  useEffect(() => {
    speechService.stop();
    const text = `${t('help.faq.privacyPolicy.q')}. ${t('help.faq.privacyPolicy.a')}`;
    speechService.prefetch(text, language);
    return () => { speechService.stop(); };
  }, [language, t]);

  const text = `${t('help.faq.privacyPolicy.q')}. ${t('help.faq.privacyPolicy.a')}`;

  return (
    <ScreenContainer
      scroll
      backgroundColor={theme.colors.surface}
      padding={24}
      header={<BackTitleHeader title={t('help.faq.privacyPolicy.q')} onBack={() => navigation.goBack()} />}
    >
      <AccessibleText variant="body" color={theme.colors.textSecondary} style={styles.text}>
        {t('help.faq.privacyPolicy.a')}
      </AccessibleText>

      <View style={styles.actions}>
        <AccessibleButton
          label={t('help.listenAnswer')}
          icon={Volume2}
          variant="soft"
          onPress={() => speechService.speak(text, { rate: settings.speechRate, language })}
        />
        <AccessibleButton
          label={t('help.stopAudio')}
          icon={VolumeX}
          variant="secondary"
          onPress={() => speechService.stop()}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  text: { lineHeight: 26 },
  actions: { gap: 12, marginTop: 24 },
});
