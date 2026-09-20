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
