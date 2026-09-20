import { z } from 'zod';

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3, 'Digite ao menos 3 letras.').max(200),
});
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
