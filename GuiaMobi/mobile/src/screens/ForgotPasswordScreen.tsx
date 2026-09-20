import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { Mail, Send } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackTitleHeader } from '../components/BackTitleHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { authService } from '../services/api/authService';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

/**
 * Recuperação de senha (US01). A confirmação só aparece quando a API
 * respondeu com sucesso, ou seja, quando o e-mail foi de fato entregue ao
 * servidor de e-mail. Se o envio falhar (ex.: servidor de e-mail não
 * configurado), a API responde com erro e a tela mostra o erro.
 * A resposta é a mesma para e-mails cadastrados ou não, para não revelar
 * quem tem conta.
 */
export function ForgotPasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  useStatusBarStyle(theme.dark ? 'light' : 'dark');

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setErrorMessage(null);

    if (!email.includes('@')) {
      const message = t('auth.errors.invalidEmail');
      setErrorMessage(message);
      announce(message, { haptic: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.forgotPassword({ email: email.trim() });
      setSent(true);
      announce(t('auth.recoverySent'), { haptic: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('auth.errors.generic');
      setErrorMessage(message);
      announce(message, { haptic: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer scroll backgroundColor={theme.colors.surface} padding={24}>
      <BackTitleHeader title={t('auth.recoverTitle')} onBack={() => navigation.goBack()} />

      <AccessibleText variant="body" color={theme.colors.textSecondary} style={styles.subtitle}>
        {t('auth.recoverSubtitle')}
      </AccessibleText>

      {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
      {sent ? <InlineMessage message={t('auth.recoverySent')} tone="info" /> : null}

      <AccessibleTextInput
        label={t('auth.email')}
        placeholder={t('auth.emailPlaceholder')}
        icon={Mail}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!sent}
        onSubmitEditing={handleSubmit}
      />

      <AccessibleButton
        label={t('auth.sendInstructions')}
        icon={Send}
        onPress={handleSubmit}
        loading={isSubmitting}
        disabled={sent}
        size="lg"
      />

      <AccessibleButton
        label={t('resetPassword.haveCode')}
        variant="link"
        onPress={() => navigation.navigate('ResetPassword', undefined)}
        style={styles.haveCode}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: 20 },
  haveCode: { marginTop: 12 },
});
