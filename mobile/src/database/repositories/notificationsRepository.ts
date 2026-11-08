import { secureStorageService } from '../../services/storage/secureStorageService';
import { SECURE_STORE_KEYS } from '../../constants/config';
import { withDatabase } from '../index';
import {
  LineNotice,
  LineNoticeKind,
  LineSubscription,
  NotificationPreferences,
} from '../../types/notifications';

/** Quantos avisos recentes ficam guardados por usuário, somando todas as linhas acompanhadas. */
export const MAX_STORED_NOTICES = 10;

/**
 * Repositório das notificações de linhas (US17): única camada que executa SQL
 * sobre notification_preferences, line_subscriptions e line_notices. Toda
 * leitura/escrita é filtrada pelo usuário autenticado.
 */
export const notificationsRepository = {
  // ── Preferências ────────────────────────────────────────────────────────
  async getPreferences(userId?: string): Promise<NotificationPreferences> {
    const id = userId ?? (await getCurrentUserId());
    if (!id) return { enabled: false, syncPending: false, initialized: false, updatedAt: null };

    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<PreferencesRow>(
        'SELECT enabled, sync_pending, initialized, updated_at FROM notification_preferences WHERE user_id = ?',
        [id]
      );
      return {
        enabled: row?.enabled === 1,
        syncPending: row?.sync_pending === 1,
        initialized: row?.initialized === 1,
        updatedAt: row?.updated_at ?? null,
      };
    });
  },

  /** Liga/desliga a chave geral. Marca a mudança como pendente de sincronização. */
  async setEnabled(enabled: boolean): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await upsertPreferences(db, userId, { enabled, syncPending: true, initialized: true });
    });
  },

  /**
   * Marca como enviado, mas só se nada mudou desde a leitura (updatedAt):
   * uma alteração feita durante o envio continua pendente.
   */
  async markSynced(userId: string, seenUpdatedAt: string | null): Promise<void> {
    await withDatabase(async (db) => {
      await db.runAsync(
        'UPDATE notification_preferences SET sync_pending = 0 WHERE user_id = ? AND updated_at IS ?',
        [userId, seenUpdatedAt]
      );
    });
  },

  // ── Linhas acompanhadas ─────────────────────────────────────────────────
  async findAllSubscriptions(userId?: string): Promise<LineSubscription[]> {
    const id = userId ?? (await getCurrentUserId());
    if (!id) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<{ line_id: string; code: string; name: string }>(
        'SELECT line_id, code, name FROM line_subscriptions WHERE user_id = ? ORDER BY created_at DESC',
        [id]
      );
      return rows.map((row) => ({ lineId: row.line_id, code: row.code, name: row.name }));
    });
  },

  async isSubscribed(lineId: string): Promise<boolean> {
    const userId = await getCurrentUserId();
    if (!userId) return false;
    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<{ line_id: string }>(
        'SELECT line_id FROM line_subscriptions WHERE user_id = ? AND line_id = ?',
        [userId, lineId]
      );
      return Boolean(row);
    });
  },

  /** Adiciona (ou atualiza) uma linha acompanhada. Idempotente. */
  async addSubscription(line: LineSubscription): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      const existing = await db.getFirstAsync<{ line_id: string }>(
        'SELECT line_id FROM line_subscriptions WHERE user_id = ? AND line_id = ?',
        [userId, line.lineId]
      );
      if (existing) {
        await db.runAsync(
          'UPDATE line_subscriptions SET code = ?, name = ? WHERE user_id = ? AND line_id = ?',
          [line.code, line.name, userId, line.lineId]
        );
      } else {
        await db.runAsync(
          'INSERT INTO line_subscriptions (user_id, line_id, code, name, created_at) VALUES (?, ?, ?, ?, ?)',
          [userId, line.lineId, line.code, line.name, new Date().toISOString()]
        );
      }
      await markPending(db, userId);
    });
  },

  async removeSubscription(lineId: string): Promise<void> {
    const userId = await requireCurrentUserId();
    await withDatabase(async (db) => {
      await db.runAsync('DELETE FROM line_subscriptions WHERE user_id = ? AND line_id = ?', [userId, lineId]);
      // Os avisos de uma linha deixam de fazer parte do histórico quando
      // o usuário deixa de acompanhá-la. O limite de 10 continua global.
      await db.runAsync('DELETE FROM line_notices WHERE user_id = ? AND line_id = ?', [userId, lineId]);
      await markPending(db, userId);
    });
  },

  /**
   * Restaura o estado vindo da API (ex.: o usuário entrou em outro aparelho).
   * Só é usado quando este aparelho ainda não tem estado próprio.
   */
  async restoreFromServer(
    userId: string,
    state: { enabled: boolean; lines: LineSubscription[] }
  ): Promise<void> {
    await withDatabase(async (db) => {
      const current = await db.getFirstAsync<{ initialized: number }>(
        'SELECT initialized FROM notification_preferences WHERE user_id = ?',
        [userId]
      );
      // O estado local sempre vence: se o usuário já mexeu aqui, não sobrescreve.
      if (current?.initialized === 1) return;

      const now = new Date().toISOString();
      for (const line of state.lines) {
        await db.runAsync(
          'INSERT OR IGNORE INTO line_subscriptions (user_id, line_id, code, name, created_at) VALUES (?, ?, ?, ?, ?)',
          [userId, line.lineId, line.code, line.name, now]
        );
      }
      await upsertPreferences(db, userId, { enabled: state.enabled, syncPending: false, initialized: true });
    });
  },

  // ── Avisos recebidos ────────────────────────────────────────────────────
  async findNotices(limit = MAX_STORED_NOTICES): Promise<LineNotice[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    return withDatabase(async (db) => {
      const rows = await db.getAllAsync<NoticeRow>(
        'SELECT * FROM line_notices WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit]
      );
      return rows.map(mapNotice);
    });
  },

  async countUnread(): Promise<number> {
    const userId = await getCurrentUserId();
    if (!userId) return 0;
    return withDatabase(async (db) => {
      const row = await db.getFirstAsync<{ total: number }>(
        'SELECT COUNT(*) AS total FROM line_notices WHERE user_id = ? AND read_at IS NULL',
        [userId]
      );
      return row?.total ?? 0;
    });
  },

  /**
   * Grava avisos novos e devolve SOMENTE os que ainda não existiam. É isso
   * que impede notificar o mesmo aviso mais de uma vez.
   */
  async insertNewNotices(userId: string, notices: LineNotice[]): Promise<LineNotice[]> {
    if (notices.length === 0) return [];

    return withDatabase(async (db) => {
      const inserted: LineNotice[] = [];
      for (const notice of notices) {
        const result = await db.runAsync(
          `INSERT OR IGNORE INTO line_notices
             (user_id, notice_key, line_id, code, name, kind, title, body, created_at, read_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [userId, notice.key, notice.lineId, notice.code, notice.name, notice.kind, notice.title, notice.body, notice.createdAt]
        );
        if (result.changes > 0) inserted.push(notice);
      }

      await db.runAsync(
        `DELETE FROM line_notices
         WHERE user_id = ?
           AND notice_key NOT IN (
             SELECT notice_key FROM line_notices WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
           )`,
        [userId, userId, MAX_STORED_NOTICES]
      );
      return inserted;
    });
  },

  async markAllRead(): Promise<void> {
    const userId = await getCurrentUserId();
    if (!userId) return;
    await withDatabase(async (db) => {
      await db.runAsync(
        'UPDATE line_notices SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
        [new Date().toISOString(), userId]
      );
    });
  },
};

// ── Auxiliares ─────────────────────────────────────────────────────────────

interface PreferencesRow {
  enabled: number;
  sync_pending: number;
  initialized: number;
  updated_at: string;
}

interface NoticeRow {
  notice_key: string;
  line_id: string;
  code: string;
  name: string;
  kind: string;
  title: string;
  body: string | null;
  created_at: string;
  read_at: string | null;
}

function mapNotice(row: NoticeRow): LineNotice {
  return {
    key: row.notice_key,
    lineId: row.line_id,
    code: row.code,
    name: row.name,
    kind: (row.kind as LineNoticeKind) ?? 'change',
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

type Db = Parameters<Parameters<typeof withDatabase>[0]>[0];

async function upsertPreferences(
  db: Db,
  userId: string,
  values: { enabled: boolean; syncPending: boolean; initialized: boolean }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO notification_preferences (user_id, enabled, sync_pending, initialized, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = excluded.enabled,
       sync_pending = excluded.sync_pending,
       initialized = excluded.initialized,
       updated_at = excluded.updated_at`,
    [userId, values.enabled ? 1 : 0, values.syncPending ? 1 : 0, values.initialized ? 1 : 0, new Date().toISOString()]
  );
}

/** Qualquer mudança nas linhas torna o estado "inicializado" e pendente de envio à API. */
async function markPending(db: Db, userId: string): Promise<void> {
  const row = await db.getFirstAsync<{ enabled: number }>(
    'SELECT enabled FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  await upsertPreferences(db, userId, { enabled: row?.enabled === 1, syncPending: true, initialized: true });
}

async function getCurrentUserId(): Promise<string | null> {
  const user = await secureStorageService.getObject<{ id?: string }>(SECURE_STORE_KEYS.USER);
  return user?.id ?? null;
}

async function requireCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('USER_NOT_AUTHENTICATED');
  return userId;
}
