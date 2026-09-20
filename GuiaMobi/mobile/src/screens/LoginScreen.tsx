import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bus, LogIn, Mail } from 'lucide-react-native';
import { AccessibleText } from '../components/AccessibleText';
import { AccessibleTextInput } from '../components/AccessibleTextInput';
import { PasswordInput } from '../components/PasswordInput';
import { AccessibleButton } from '../components/AccessibleButton';
import { InlineMessage } from '../components/InlineMessage';
import { Icon } from '../components/Icon';
import { useAuth } from '../hooks/useAuth';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { useStatusBarStyle } from '../hooks/useStatusBarStyle';
import { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

/**
 * Tela de login (US01), no layout do mockup 02: cabeçalho azul com a marca e
 * painel branco arredondado com o formulário.
 * Fluxo: Tela -> useAuth (hook/context) -> authService -> API.
 */
export function LoginScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { theme, announce } = useAccessibility();
  const { login, isAuthenticating } = useAuth();
  const insets = useSafeAreaInsets();
  useStatusBarStyle('light');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function fail(message: string) {
    setErrorMessage(message);
    announce(message, { haptic: 'error' });
  }

  function validate(): boolean {
    if (!email.includes('@')) {
      fail(t('auth.errors.invalidEmail'));
      return false;
    }
    if (password.length === 0) {
      fail(t('auth.errors.requiredPassword'));
      return false;
    }
    return true;
  }

  async function handleLogin() {
    setErrorMessage(null);
    if (!validate()) return;

    try {
      await login({ email, password });
    } catch (error) {
      fail(error instanceof Error ? error.message : t('auth.errors.generic'));
    }
  }

  const c = theme.colors;

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: c.primary }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.header, { paddingTop: insets.top + 28 }]}>
          <View style={styles.logo} accessible={false} importantForAccessibility="no-hide-descendants">
            <Icon icon={Bus} size={38} color="#FFFFFF" strokeWidth={1.8} />
          </View>
          <AccessibleText variant="title" color={c.onPrimary} accessibilityRole="header">
            {t('auth.welcome')}
          </AccessibleText>
          <AccessibleText variant="caption" weight="semibold" color={c.onPrimaryMuted}>
            {t('auth.subtitle')}
          </AccessibleText>
        </View>

        <View style={[styles.panel, { backgroundColor: c.surface, paddingBottom: insets.bottom + 24 }]}>
          {errorMessage ? <InlineMessage message={errorMessage} tone="error" /> : null}

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
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChangeText={setPassword}
            textContentType="password"
            onSubmitEditing={handleLogin}
          />

          <AccessibleButton label={t('auth.login')} icon={LogIn} onPress={handleLogin} loading={isAuthenticating} size="lg" />

          <View style={styles.forgotWrap}>
            <AccessibleButton
              label={t('auth.forgotPassword')}
              variant="link"
              onPress={() => navigation.navigate('ForgotPassword')}
            />
          </View>

          <View style={styles.dividerRow} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={[styles.line, { backgroundColor: c.border }]} />
            <AccessibleText variant="caption" color={c.textSecondary}>
              {t('auth.or')}
            </AccessibleText>
            <View style={[styles.line, { backgroundColor: c.border }]} />
          </View>

          <AccessibleButton label={t('auth.createAccount')} variant="secondary" onPress={() => navigation.navigate('Register')} size="lg" />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  header: {
    alignItems: 'center',
    paddingBottom: 44,
    gap: 4,
  },
  logo: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  panel: {
    flexGrow: 1,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  forgotWrap: { alignItems: 'center', marginVertical: 6 },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 14,
  },
  line: { flex: 1, height: 1 },
});
