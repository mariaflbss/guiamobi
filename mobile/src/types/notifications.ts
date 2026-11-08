// Tipos das notificações sobre alterações nas linhas (US17)

/**
 * Tipo do aviso, do ponto de vista do usuário:
 * - interruption: a linha está suspensa/indisponível;
 * - detour: a linha está fazendo um desvio de itinerário;
 * - change: qualquer outra alteração operacional (atraso, horário, obra...).
 */
export type LineNoticeKind = 'change' | 'detour' | 'interruption';

/** Linha acompanhada pelo usuário (inscrição persistida no aparelho e na API). */
export interface LineSubscription {
  lineId: string;
  code: string;
  name: string;
}

/** Aviso já recebido/registrado para uma linha acompanhada. */
export interface LineNotice {
  /** Chave de deduplicação: o mesmo aviso nunca é notificado duas vezes. */
  key: string;
  lineId: string;
  code: string;
  name: string;
  kind: LineNoticeKind;
  /** Texto principal vindo da fonte oficial (ex.: "Desvio na Av. X"). */
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

/** Aviso devolvido pela API para uma linha (ainda não registrado no aparelho). */
export interface RemoteLineNotice {
  id: string;
  lineId: string;
  kind: LineNoticeKind;
  headerText: string;
  descriptionText: string | null;
}

export interface NotificationPreferences {
  /** Chave geral: desligada = nenhum aviso é verificado nem exibido, mas as linhas continuam salvas. */
  enabled: boolean;
  /** true quando há mudança local que a API ainda não recebeu (sincronização é silenciosa). */
  syncPending: boolean;
  /** true depois que o estado local foi definido (evita sobrescrever com o servidor). */
  initialized: boolean;
  /** Instante da última mudança local (usado para não marcar como enviado algo alterado durante o envio). */
  updatedAt: string | null;
}
