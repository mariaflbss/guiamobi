import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authService } from '../services/api/authService';
import { setUnauthorizedHandler } from '../services/api/httpClient';
import { secureStorageService } from '../services/storage/secureStorageService';
import { SECURE_STORE_KEYS, tutorialPendingKey, privacyConsentKey } from '../constants/config';
import { AuthSession, LoginInput, RegisterInput, UpdateProfileInput, User } from '../types/auth';
import { ApiError } from '../services/api/httpClient';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean; // true enquanto restaura a sessão salva
  isAuthenticating: boolean; // true durante login/cadastro em andamento
  /** true logo após o cadastro, até o usuário concluir ou pular o tutorial inicial. */
  shouldShowTutorial: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<void>;
  completeTutorial: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Provider de autenticação (US01): restaura a sessão do SecureStore, executa
 * login/cadastro/edição de perfil na API e controla o tutorial do primeiro acesso.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false);

  const logout = useCallback(async () => {
    await secureStorageService.removeItem(SECURE_STORE_KEYS.ACCESS_TOKEN);
    await secureStorageService.removeItem(SECURE_STORE_KEYS.USER);
    setShouldShowTutorial(false);
    setUser(null);
  }, []);

  useEffect(() => {
    restoreSession();
    // Sessão expirada no servidor -> volta para o login
    setUnauthorizedHandler(() => {
      logout();
    });
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function restoreSession() {
    try {
      const savedUser = await secureStorageService.getObject<User>(SECURE_STORE_KEYS.USER);
      const savedToken = await secureStorageService.getItem(SECURE_STORE_KEYS.ACCESS_TOKEN);

      if (savedUser && savedToken) {
        const pending = await secureStorageService.getItem(tutorialPendingKey(savedUser.id));
        setShouldShowTutorial(pending === '1');
        setUser(savedUser);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function persistSession(session: AuthSession) {
    await secureStorageService.setItem(SECURE_STORE_KEYS.ACCESS_TOKEN, session.accessToken);
    await secureStorageService.setObject(SECURE_STORE_KEYS.USER, session.user);
    setUser(session.user);
  }

  async function login(input: LoginInput) {
    setIsAuthenticating(true);
    try {
      const session = await authService.login(input);
      await persistSession(session);
    } catch (error) {
      throw normalizeAuthError(error);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function register(input: RegisterInput) {
    setIsAuthenticating(true);
    try {
      const { user: created } = await authService.register(input);
      // Marca o tutorial ANTES de autenticar: assim ele já aparece na primeira tela do app.
      await secureStorageService.setItem(tutorialPendingKey(created.id), '1');
      // Registra que a Política de Privacidade foi aceita neste cadastro (US02):
      // o texto correspondente foi mostrado na tela de Cadastro antes deste ponto.
      await secureStorageService.setItem(privacyConsentKey(created.id), new Date().toISOString());
      setShouldShowTutorial(true);
      const session = await authService.login({ email: input.email, password: input.password });
      await persistSession(session);
    } catch (error) {
      setShouldShowTutorial(false);
      throw normalizeAuthError(error);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function updateProfile(input: UpdateProfileInput) {
    try {
      const { user: updated } = await authService.updateProfile(input);
      await secureStorageService.setObject(SECURE_STORE_KEYS.USER, updated);
      setUser(updated);
    } catch (error) {
      throw normalizeAuthError(error);
    }
  }

  async function completeTutorial() {
    if (user) {
      await secureStorageService.removeItem(tutorialPendingKey(user.id));
    }
    setShouldShowTutorial(false);
  }

  const value = useMemo(
    () => ({ user, isLoading, isAuthenticating, shouldShowTutorial, login, register, logout, updateProfile, completeTutorial }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isLoading, isAuthenticating, shouldShowTutorial, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function normalizeAuthError(error: unknown): Error {
  if (error instanceof ApiError) {
    return error;
  }
  return new Error('Não foi possível concluir. Tente novamente.');
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext deve ser usado dentro de um AuthProvider');
  }
  return context;
}
