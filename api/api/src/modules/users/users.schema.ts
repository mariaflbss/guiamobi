import { z } from 'zod';

// Por segurança, o perfil autenticado só permite editar o nome.
// E-mail e senha possuem fluxos próprios e não podem ser alterados por PATCH.
export const updateProfileBodySchema = z
  .object({
    name: z.string().trim().min(2, 'Informe seu nome completo'),
  })
  .strict();

export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
