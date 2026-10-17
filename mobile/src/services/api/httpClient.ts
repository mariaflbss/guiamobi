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
  /** Permite à tela cancelar a requisição ao sair (libera a conexão). */
  signal?: AbortSignal;
}

// Rede de segurança: nenhuma chamada fica pendente para sempre (o fetch do RN não tem timeout).
const REQUEST_TIMEOUT_MS = 20_000;

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

function isExpectedOptionalRequest(path: string): boolean {
  return path.startsWith('/poi/nearby') ||
    path.startsWith('/geocode/reverse') ||
    path.startsWith('/routes/nearby-lines');
}

function isExpectedCancellation(error: unknown, signal: AbortSignal | undefined, timedOut: boolean): boolean {
  return Boolean(signal?.aborted || timedOut || (error instanceof DOMException && error.name === 'AbortError'));
}

export async function httpClient<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { method = 'GET', body, authenticated = false, skipRefresh = false, signal } = options;

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

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', forwardAbort, { once: true });
  }

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', forwardAbort);

    const expected = isExpectedCancellation(error, signal, timedOut) || isExpectedOptionalRequest(path);
    if (!expected) {
      console.error('[HTTP] Falha inesperada na requisição:', {
        url: `${API_URL}${path}`,
        method,
        error,
      });
    }

    throw new ApiError(
      timedOut
        ? 'A solicitação demorou demais e foi cancelada.'
        : 'Não foi possível conectar ao servidor. Verifique sua conexão.',
      0,
    );
  }

  if (signal) signal.removeEventListener('abort', forwardAbort);

  const data = await response.json().catch(() => ({}));
  clearTimeout(timer);

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