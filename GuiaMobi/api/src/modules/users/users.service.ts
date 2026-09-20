import { prisma } from '../../database/prisma';
import { AppError } from '../../middleware/errorHandler';
import { hashPassword } from '../../utils/hash';
import { UpdateProfileBody } from './users.schema';

// Dados públicos do usuário (nunca o hash da senha)
const publicUserSelect = { id: true, name: true, email: true, avatarId: true, createdAt: true } as const;

export const usersService = {
  async getProfile(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });

    if (!user) {
      throw new AppError('Usuário não encontrado.', 404);
    }

    return user;
  },

  /**
   * Edição de perfil (nome, e-mail, senha e avatar). Trocar o e-mail exige
   * que ele não pertença a outra conta; a senha nova é guardada só como hash.
   */
  async updateProfile(userId: string, { name, email, password, avatarId }: UpdateProfileBody) {
    if (email) {
      const other = await prisma.user.findUnique({ where: { email } });
      if (other && other.id !== userId) {
        throw new AppError('Este e-mail já está cadastrado.', 409);
      }
    }

    const passwordHash = password ? await hashPassword(password) : undefined;

    return prisma.user.update({
      where: { id: userId },
      data: { name, email, passwordHash, avatarId },
      select: publicUserSelect,
    });
  },
};
