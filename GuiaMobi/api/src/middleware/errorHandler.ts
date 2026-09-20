import { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

/**
 * Erro de negócio previsível (ex.: e-mail já cadastrado, credenciais inválidas).
 * Deve ser lançado pelos services/controllers e é tratado aqui de forma
 * amigável, sem expor detalhes internos ao cliente.
 */
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | ZodError | AppError, request: FastifyRequest, reply: FastifyReply) => {
    // Erros de validação do Zod
    if (error instanceof ZodError) {
      return reply.status(400).send({
        message: 'Dados inválidos.',
        errors: error.flatten().fieldErrors,
      });
    }

    // Erros de negócio conhecidos
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({ message: error.message });
    }

    // Erros inesperados: nunca expor stack trace nem dados sensíveis ao cliente
    request.log.error(error);
    return reply.status(500).send({
      message: 'Erro interno do servidor. Tente novamente mais tarde.',
    });
  });
}
