import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, Send, CircleCheck } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackTitleHeader } from '../components/BackTitleHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { authService } from '../services/api/authService';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useAuth } from '../hooks/useAuth';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AppStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AppStackParamList, 'ChangePassword'>;

/** Fluxo de troca de senha por código enviado ao e-mail cadastrado. */
export function ChangePasswordScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { user } = useAuth();
  useStatusBarStyle(theme.dark ? 'light' : 'dark');
  const [sent, setSent] = useState(false);
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function sendCode() {
    setError(null); setMessage(null);
    if (!user?.email) { setError(t('auth.errors.generic')); return; }
    setLoading(true);
    try {
      await authService.forgotPassword({ email: user.email });
      setSent(true); setMessage(t('profile.passwordCodeSent'));
      announce(t('profile.passwordCodeSent'), { haptic: 'success' });
    } catch (e) {
      const text = e instanceof Error ? e.message : t('auth.errors.generic');
      setError(text); announce(text, { haptic: 'error' });
    } finally { setLoading(false); }
  }

  async function resetPassword() {
    setError(null); setMessage(null);
    if (!token.trim()) { setError(t('resetPassword.token')); return; }
    if (password.length < 8) { setError(t('auth.errors.shortPassword')); return; }
    if (password !== confirmPassword) { setError(t('auth.errors.passwordsDontMatch')); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ token: token.trim(), newPassword: password });
      setDone(true); setMessage(t('profile.passwordChanged'));
      announce(t('profile.passwordChanged'), { haptic: 'success' });
    } catch (e) {
      const text = e instanceof Error ? e.message : t('auth.errors.generic');
      setError(text); announce(text, { haptic: 'error' });
    } finally { setLoading(false); }
  }

  return (
    <ScreenContainer scroll backgroundColor={theme.colors.surface} padding={24}>
      <BackTitleHeader title={t('profile.changePassword')} onBack={() => navigation.goBack()} />
      <AccessibleText variant="body" color={theme.colors.textSecondary} style={styles.subtitle}>
        {sent ? t('profile.passwordCodeInstructions') : t('profile.passwordCodeIntro')}
      </AccessibleText>
      <AccessibleTextInput label={t('auth.email')} icon={Mail} value={user?.email ?? ''} editable={false} autoCapitalize="none" />
      {error ? <InlineMessage message={error} tone="error" /> : null}
      {message ? <InlineMessage message={message} tone="info" /> : null}
      {!sent ? (
        <AccessibleButton label={t('profile.sendPasswordCode')} icon={Send} onPress={sendCode} loading={loading} size="lg" />
      ) : (
        <>
          <AccessibleTextInput label={t('resetPassword.token')} placeholder={t('resetPassword.tokenPlaceholder')} icon={KeyRound} value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} editable={!done} />
          <PasswordInput label={t('resetPassword.newPassword')} placeholder={t('auth.minCharacters')} value={password} onChangeText={setPassword} textContentType="newPassword" editable={!done} />
          <PasswordInput label={t('resetPassword.confirmNewPassword')} placeholder={t('auth.confirmPasswordPlaceholder')} value={confirmPassword} onChangeText={setConfirmPassword} editable={!done} />
          {done ? <AccessibleButton label={t('common.back')} icon={CircleCheck} onPress={() => navigation.goBack()} size="lg" /> : <AccessibleButton label={t('resetPassword.submit')} onPress={resetPassword} loading={loading} size="lg" />}
          {!done ? <AccessibleButton label={t('profile.resendPasswordCode')} variant="link" onPress={sendCode} loading={loading} /> : null}
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({ subtitle: { marginBottom: 20 }, });
