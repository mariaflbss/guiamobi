import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

/**
 * Envio de e-mail da recuperação de senha, via SMTP (nodemailer) com
 * qualquer provedor (Gmail, SendGrid, Amazon SES, servidor próprio...),
 * configurado pelas variáveis SMTP_* do .env.
 *
 * Sem SMTP configurado:
 *  - em desenvolvimento/teste, o conteúdo do e-mail é escrito no log do
 *    servidor, para testar o fluxo sem provedor (nenhum e-mail sai de fato);
 *  - em produção, o envio FALHA com erro 503. Assim o app nunca informa ao
 *    usuário que um e-mail foi enviado quando isso não aconteceu.
 */

interface PasswordResetEmailParams {
  to: string;
  name: string;
  resetUrl: string;
  token: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // Porta 465 usa TLS direto; as demais (587/25) usam STARTTLS
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    });
  }
  return transporter;
}

function buildMessage({ name, resetUrl, token }: Omit<PasswordResetEmailParams, 'to'>) {
  const text = [
    `Olá, ${name}.`,
    '',
    'Recebemos um pedido para redefinir a senha da sua conta no GuiaMobi Acessível.',
    '',
    `Abra este link no celular em que o aplicativo está instalado: ${resetUrl}`,
    '',
    'Se o link não abrir o aplicativo, abra o GuiaMobi, toque em "Esqueci minha senha",',
    'depois em "Já tenho um código" e informe este código:',
    token,
    '',
    'O link e o código expiram em 30 minutos e só podem ser usados uma vez.',
    'Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.',
  ].join('\n');

  const html = `
    <p>Olá, ${escapeHtml(name)}.</p>
    <p>Recebemos um pedido para redefinir a senha da sua conta no <strong>GuiaMobi Acessível</strong>.</p>
    <p><a href="${escapeHtml(resetUrl)}">Redefinir minha senha</a> (abra no celular em que o aplicativo está instalado).</p>
    <p>Se o link não abrir o aplicativo, toque em <em>Esqueci minha senha</em>, depois em
    <em>Já tenho um código</em> e informe este código:</p>
    <p><code>${escapeHtml(token)}</code></p>
    <p>O link e o código expiram em 30 minutos e só podem ser usados uma vez.
    Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.</p>`;

  return { text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendPasswordResetEmail({ to, name, resetUrl, token }: PasswordResetEmailParams): Promise<void> {
  const { text, html } = buildMessage({ name, resetUrl, token });

  if (!isSmtpConfigured()) {
    if (env.NODE_ENV === 'production') {
      throw new AppError('O envio de e-mail não está disponível no momento. Tente novamente mais tarde.', 503);
    }
    console.log('--------------------------------------------------');
    console.log('[E-MAIL NÃO ENVIADO - SMTP não configurado no .env; conteúdo apenas no log]');
    console.log(`Para: ${to}`);
    console.log(text);
    console.log('--------------------------------------------------');
    return;
  }

  try {
    await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to,
      subject: 'Redefinição de senha - GuiaMobi Acessível',
      text,
      html,
    });
  } catch (error) {
    console.error('Falha ao enviar e-mail de recuperação de senha:', error);
    throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente mais tarde.', 503);
  }
}
