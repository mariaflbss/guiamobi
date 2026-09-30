import { z } from 'zod';

export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(3, 'Digite ao menos 3 letras.').max(200),
});
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;

export const reverseQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
