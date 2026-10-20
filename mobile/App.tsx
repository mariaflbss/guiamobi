import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
} from '@expo-google-fonts/nunito';
import { AccessibilityProvider, useAccessibility } from './src/contexts/AccessibilityContext';
import { AuthProvider } from './src/contexts/AuthContext';
import { RouteDraftProvider } from './src/contexts/RouteDraftContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import './src/locales/i18n';

// O Expo Go pode exibir um aviso de desenvolvimento quando perde temporariamente
// a conexão com o Expo CLI/HMR. Isso não é um erro funcional do aplicativo e
// não deve interromper uma apresentação. Outros warnings continuam visíveis.
if (__DEV__) {
  LogBox.ignoreLogs(['Cannot connect to Expo CLI.']);
}

// Cliente único do React Query, usado pelos hooks de favoritos e histórico
// (US07) para cache e sincronização de estado sobre o SQLite local.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Componente raiz do GuiaMobi Acessível.
 *
 * Ordem dos providers (de fora para dentro): áreas seguras, cache de dados
 * locais, acessibilidade (tema/idioma/preferências), sessão do usuário e
 * origem/destino em edição.
 */
export default function App() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AccessibilityProvider>
          <AuthProvider>
            <RouteDraftProvider>
              <AppStatusBar />
              <RootNavigator fontsLoaded={fontsLoaded} />
            </RouteDraftProvider>
          </AuthProvider>
        </AccessibilityProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Estilo inicial da barra de status conforme o tema; cada tela ajusta ao ganhar foco. */
function AppStatusBar() {
  const { theme } = useAccessibility();
  return <StatusBar style={theme.dark ? 'light' : 'dark'} />;
}
