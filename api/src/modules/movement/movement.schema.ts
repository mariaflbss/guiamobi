import { z } from 'zod';

export const movementCheckBodySchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  targetLatitude: z.number().min(-90).max(90),
  targetLongitude: z.number().min(-180).max(180),
  radiusMeters: z.number().min(50).max(500).default(200),
});

export type MovementCheckBody = z.infer<typeof movementCheckBodySchema>;
