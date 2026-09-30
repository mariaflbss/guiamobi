import { z } from 'zod';

/**
 * Validação dos parâmetros de busca de rota (Prioridade 1 da revisão:
 * "Implementar cálculo/exibição das rotas").
 * Recebido como query string, por isso os números chegam como texto.
 */
export const searchRoutesQuerySchema = z.object({
  originLat: z.coerce.number().min(-90).max(90),
  originLng: z.coerce.number().min(-180).max(180),
  destinationLat: z.coerce.number().min(-90).max(90),
  destinationLng: z.coerce.number().min(-180).max(180),
});

export type SearchRoutesQuery = z.infer<typeof searchRoutesQuerySchema>;

/**
 * Validação da busca de linha por número ou nome (US06/R07).
 */
export const searchLinesQuerySchema = z.object({
  query: z.string().trim().min(1, 'Informe um número ou nome de linha.').max(60),
});

export type SearchLinesQuery = z.infer<typeof searchLinesQuerySchema>;

/** Linhas que passam perto de um ponto (ex.: onde o usuário está) - US09. */
export const nearbyLinesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(20).max(500).optional().default(150),
});
