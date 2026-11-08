import React from 'react';
import { NavigationContainer, NavigationContainerRef, DefaultTheme, DarkTheme, LinkingOptions } from '@react-navigation/native';
import { useAuth } from '../hooks/useAuth';
import { useAccessibility } from '../contexts/AccessibilityContext';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { LoadingIndicator } from '../components/LoadingIndicator';
import { AuthStackParamList } from './types';
import { navigationRef } from './navigationRef';

/**
 * Deep link `guiamobi://redefinir-senha?token=...` (o servidor abre esse
 * endereço a partir do link do e-mail). Só vale para a pilha de
 * autenticação, que é onde faz sentido redefinir a senha. Se o link abrir
 * o app já com a sessão iniciada, ele é ignorado.
 */
const linking: LinkingOptions<AuthStackParamList> = {
  prefixes: ['guiamobi://'],
  config: {
    screens: {
      ResetPassword: 'redefinir-senha',
      Login: 'login',
      ForgotPassword: 'esqueci-senha',
      Register: 'cadastro',
    },
  },
};

/**
 * Ponto único de decisão de navegação: enquanto a sessão salva e as
 * preferências carregam, mostra um loading; depois exibe a pilha de
 * autenticação (com a abertura) ou o app.
 */
export function RootNavigator({ fontsLoaded = true }: { fontsLoaded?: boolean }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isLoading: isSettingsLoading, theme } = useAccessibility();

  if (isAuthLoading || isSettingsLoading || !fontsLoaded) {
    return <LoadingIndicator />;
  }

  const base = theme.dark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: { ...base.colors, background: theme.colors.background, primary: theme.colors.primary },
  };

  return (
    <NavigationContainer
      // O container serve às duas pilhas (autenticação e app); a referência
      // só é usada para abrir telas do app (ex.: toque numa notificação).
      ref={navigationRef as unknown as React.Ref<NavigationContainerRef<AuthStackParamList>>}
      theme={navigationTheme}
      linking={user ? undefined : linking}
    >
      {user ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
