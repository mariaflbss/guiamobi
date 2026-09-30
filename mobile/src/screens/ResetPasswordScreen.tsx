import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { KeyRound, CircleCheck } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackTitleHeader } from '../components/BackTitleHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { authService } from '../services/api/authService';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

/**
 * Redefinição de senha (US01). Abre pelo link do e-mail
 * (guiamobi://redefinir-senha?token=...) já com o código preenchido, ou
 * manualmente com o código recebido. O servidor valida o token, atualiza a
 * senha e invalida o token (uso único).
 */
export function ResetPasswordScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  useStatusBarStyle(theme.dark ? 'light' : 'dark');

  const [token, setToken] = useState(route.params?.token ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (route.params?.token) {
      setToken(route.params.token);
    }
  }, [route.params?.token]);

  function fail(message: string) {
    setErrorMessage(message);
    announce(message, { haptic: 'error' });
  }

  async function handleSubmit() {
    setErrorMessage(null);

    if (token.trim().length === 0) return fail(t('resetPassword.token'));
    if (newPassword.length < 8) return fail(t('auth.errors.shortPassword'));
    if (newPassword !== confirmPassword) return fail(t('auth.errors.passwordsDontMatch'));

    setIsSubmitting(true);
    try {
      await authService.resetPassword({ token: token.trim(), newPassword });
      setDone(true);
      announce(t('resetPassword.success'), { haptic: 'success' });
    } catch (error) {
      fail(error instanceof Error ? error.message : t('auth.errors.generic'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScreenContainer scroll backgroundColor={theme.colors.surface} padding={24}>
      <BackTitleHeader
        title={t('resetPassword.title')}
        onBack={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
      />

      <AccessibleText variant="body" color={theme.colors.textSecondary} style={styles.subtitle}>
        {t('resetPassword.subtitle')}
      </AccessibleText>

      {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}
      {done ? <InlineMessage message={t('resetPassword.success')} tone="info" /> : null}

      <AccessibleTextInput
        label={t('resetPassword.token')}
        placeholder={t('resetPassword.tokenPlaceholder')}
        icon={KeyRound}
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!done}
      />

      <PasswordInput
        label={t('resetPassword.newPassword')}
        placeholder={t('auth.minCharacters')}
        value={newPassword}
        onChangeText={setNewPassword}
        textContentType="newPassword"
        editable={!done}
      />

      <PasswordInput
        label={t('resetPassword.confirmNewPassword')}
        placeholder={t('auth.confirmPasswordPlaceholder')}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        editable={!done}
        onSubmitEditing={handleSubmit}
      />

      {done ? (
        <AccessibleButton label={t('resetPassword.backToLogin')} icon={CircleCheck} onPress={() => navigation.navigate('Login')} size="lg" />
      ) : (
        <AccessibleButton label={t('resetPassword.submit')} onPress={handleSubmit} loading={isSubmitting} size="lg" />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: { marginBottom: 20 },
});
