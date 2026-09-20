import { z } from 'zod';

// Mesma lista de avatares disponíveis no app (mobile/src/constants/avatars.ts).
// São apenas opções visuais; a API só aceita ids conhecidos.
export const AVATAR_IDS = [
  'dog',
  'cat',
  'owl',
  'bear',
  'fox',
  'person',
  'robot',
  'bus',
  'whiteCane',
  'greenCane',
  'redWhiteCane',
  'star',
] as const;

// Edição de perfil: todos os campos são opcionais, mas ao menos um deve vir.
export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome completo').optional(),
    email: z.string().trim().toLowerCase().email('E-mail inválido').optional(),
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres').optional(),
    avatarId: z.enum(AVATAR_IDS).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Informe ao menos um campo para atualizar.' });

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
