import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { CircleCheck, Mail, User } from 'lucide-react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { BackTitleHeader } from '../components/BackTitleHeader';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { useAuth } from '../hooks/useAuth';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

/**
 * Tela de cadastro (US01), layout do mockup 03. Valida localmente (senha com
 * no mínimo 8 caracteres, sem outras exigências) e a API valida de novo.
 */
export function RegisterScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { register, isAuthenticating } = useAuth();
  useStatusBarStyle(theme.dark ? 'light' : 'dark');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function fail(message: string) {
    setErrorMessage(message);
    announce(message, { haptic: 'error' });
  }

  // Mostra o texto real da Política de Privacidade (mesmo conteúdo exibido
  // em Ajuda após o login). Antes do cadastro o usuário ainda não tem
  // sessão, então usamos um diálogo do sistema em vez de navegar para uma
  // tela da área autenticada.
  function openPrivacyPolicy() {
    Alert.alert(t('help.faq.privacyPolicy.q'), t('help.faq.privacyPolicy.a'));
  }

  function validate(): boolean {
    if (name.trim().length < 2) {
      fail(t('auth.errors.shortName'));
      return false;
    }
    if (!email.includes('@')) {
      fail(t('auth.errors.invalidEmail'));
      return false;
    }
    if (password.length < 8) {
      fail(t('auth.errors.shortPassword'));
      return false;
    }
    if (password !== confirmPassword) {
      fail(t('auth.errors.passwordsDontMatch'));
      return false;
    }
    return true;
  }

  async function handleRegister() {
    setErrorMessage(null);
    if (!validate()) return;

    try {
      await register({ name: name.trim(), email, password });
    } catch (error) {
      fail(error instanceof Error ? error.message : t('auth.errors.generic'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenContainer scroll backgroundColor={theme.colors.surface} padding={24}>
        <BackTitleHeader title={t('auth.createAccount')} onBack={() => navigation.goBack()} />

        {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}

        <AccessibleTextInput
          label={t('auth.fullName')}
          placeholder={t('auth.fullNamePlaceholder')}
          icon={User}
          value={name}
          onChangeText={setName}
          textContentType="name"
        />

        <AccessibleTextInput
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          icon={Mail}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <PasswordInput
          label={t('auth.password')}
          placeholder={t('auth.minCharacters')}
          value={password}
          onChangeText={setPassword}
          textContentType="newPassword"
        />

        <PasswordInput
          label={t('auth.confirmPassword')}
          placeholder={t('auth.confirmPasswordPlaceholder')}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          onSubmitEditing={handleRegister}
        />

        <AccessibleButton
          label={t('auth.createAccountButton')}
          icon={CircleCheck}
          onPress={handleRegister}
          loading={isAuthenticating}
          size="lg"
        />

        <Pressable
          onPress={openPrivacyPolicy}
          accessibilityRole="link"
          accessibilityLabel={t('auth.termsNotice')}
          accessibilityHint={t('help.faq.privacyPolicy.q')}
        >
          <AccessibleText variant="caption" color={theme.colors.textSecondary} style={styles.terms}>
            {t('auth.termsNotice')}
          </AccessibleText>
        </Pressable>
      </ScreenContainer>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  terms: { marginTop: 16, textAlign: 'center' },
});
