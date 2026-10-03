import { z } from 'zod';

export const POI_CATEGORIES = ['hospital', 'clinic', 'pharmacy', 'dentist', 'bank', 'atm', 'supermarket', 'square'] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export const poiQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(50).max(1000).optional().default(500),
  // lista separada por vírgula, ex.: "hospital,bank"; vazio = todas as categorias
  categories: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((v) => v.trim())
            .filter((v): v is PoiCategory => (POI_CATEGORIES as readonly string[]).includes(v))
        : [...POI_CATEGORIES]
    ),
});
export type PoiQuery = z.infer<typeof poiQuerySchema>;
