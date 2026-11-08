import { z } from 'zod';

/** Limite de linhas acompanhadas por usuário (evita abuso e consultas enormes). */
export const MAX_SUBSCRIBED_LINES = 50;

export const replaceSubscriptionsBodySchema = z
  .object({
    enabled: z.boolean(),
    lineIds: z.array(z.string().min(1)).max(MAX_SUBSCRIBED_LINES),
  })
  .strict();

export const lineNoticesQuerySchema = z.object({
  // "id1,id2,id3". Se omitido, usa as linhas acompanhadas salvas na conta.
  lineIds: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? Array.from(new Set(value.split(',').map((id) => id.trim()).filter(Boolean)))
        : undefined
    )
    .refine((ids) => !ids || ids.length <= MAX_SUBSCRIBED_LINES, 'Linhas demais.'),
  // Cenário determinístico somente para teste local da US17.
  scenario: z.enum(['change', 'detour', 'interruption']).optional(),
});

export type ReplaceSubscriptionsBody = z.infer<typeof replaceSubscriptionsBodySchema>;
