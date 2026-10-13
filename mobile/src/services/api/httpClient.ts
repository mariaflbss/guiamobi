import { API_URL, SECURE_STORE_KEYS } from '../../constants/config';
import { secureStorageService } from '../storage/secureStorageService';

/**
 * Erro de API padronizado, com a mensagem já pronta para exibição ao
 * usuário (a API sempre retorna { message } em caso de erro).
 */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Chamado quando a API responde 401 a uma chamada autenticada (token expirado
// ou inválido): o AuthContext registra aqui o logout para o usuário voltar ao login.
let unauthorizedHandler: (() => void) | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  authenticated?: boolean;
  skipRefresh?: boolean;
}

/**
 * Cliente HTTP mínimo baseado em fetch, com anexação automática do token
 * de acesso (quando `authenticated: true`) e tratamento padronizado de erro.
 * Mantido simples de propósito: não há necessidade de uma biblioteca extra
 * (axios) para o volume de chamadas desta sprint.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await secureStorageService.getItem(SECURE_STORE_KEYS.REFRESH_TOKEN);
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.accessToken || !data.refreshToken) return null;

      await secureStorageService.setItem(SECURE_STORE_KEYS.ACCESS_TOKEN, data.accessToken);
      await secureStorageService.setItem(SECURE_STORE_KEYS.REFRESH_TOKEN, data.refreshToken);
      if (data.user) await secureStorageService.setObject(SECURE_STORE_KEYS.USER, data.user);
      return data.accessToken as string;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function httpClient<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { method = 'GET', body, authenticated = false, skipRefresh = false } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (authenticated) {
    const token = await secureStorageService.getItem(
      SECURE_STORE_KEYS.ACCESS_TOKEN,
    );

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    console.error('[HTTP] Falha na requisição:', {
      url: `${API_URL}${path}`,
      method,
      error,
    });

    throw new ApiError(
      'Não foi possível conectar ao servidor. Verifique sua conexão.',
      0,
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401 && authenticated && !skipRefresh) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Refaz somente a chamada original, agora com o token renovado.
        return httpClient<TResponse>(path, { ...options, skipRefresh: true });
      }
      // Só encerra a sessão quando a renovação realmente falhar. Um 401
      // transitório deixa de derrubar o usuário durante o uso normal.
      unauthorizedHandler?.();
    }

    throw new ApiError(
      data.message ?? 'Ocorreu um erro. Tente novamente.',
      response.status,
    );
  }

  return data as TResponse;
}