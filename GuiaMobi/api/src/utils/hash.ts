import argon2 from 'argon2';
import crypto from 'node:crypto';

/**
 * Utilitários de hash usados pela API.
 * - Senhas de usuário: Argon2id (recomendado pela OWASP)
 * - Tokens de recuperação de senha: SHA-256 (o token em texto puro só existe
 *   no e-mail enviado ao usuário; no banco guardamos apenas o hash)
 */

export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch {
    // Hash inválido/corrompido -> trata como senha incorreta, nunca lança erro para fora
    return false;
  }
}

export function generateRawToken(): string {
  // Token aleatório enviado por e-mail (não é armazenado em texto puro)
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}
