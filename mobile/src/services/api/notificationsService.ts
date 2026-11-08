import { httpClient } from './httpClient';
import { LineSubscription, RemoteLineNotice } from '../../types/notifications';

/**
 * Cliente da API de notificações (US17). Todas as chamadas são usadas de
 * forma silenciosa pelo app: o estado local é a fonte da verdade e uma falha
 * aqui nunca é mostrada ao usuário.
 */
export const notificationsApiService = {
  async getSubscriptions(): Promise<{ enabled: boolean; lines: LineSubscription[] }> {
    return httpClient<{ enabled: boolean; lines: LineSubscription[] }>('/notifications/subscriptions', {
      authenticated: true,
    });
  },

  /** Substitui, na conta, o estado enviado pelo aparelho (idempotente). */
  async replaceSubscriptions(enabled: boolean, lineIds: string[]): Promise<void> {
    await httpClient('/notifications/subscriptions', {
      method: 'PUT',
      body: { enabled, lineIds },
      authenticated: true,
    });
  },

  /** Avisos em vigor (alteração, desvio, interrupção) das linhas informadas. */
  async getLineNotices(
    lineIds: string[],
    scenario?: 'change' | 'detour' | 'interruption',
  ): Promise<RemoteLineNotice[]> {
    if (lineIds.length === 0) return [];
    const params = new URLSearchParams({ lineIds: lineIds.join(',') });
    if (scenario) params.set('scenario', scenario);
    const { notices } = await httpClient<{ notices: RemoteLineNotice[] }>(
      `/notifications/line-notices?${params.toString()}`,
      { authenticated: true }
    );
    return notices;
  },
};
