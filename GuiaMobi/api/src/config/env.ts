import { z } from 'zod';

/**
 * Validação das variáveis de ambiente utilizando Zod.
 * Garante que a API não suba com configurações inválidas ou ausentes.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET deve ter pelo menos 8 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_RESET_EXPIRES_IN: z.string().default('30m'),
  CORS_ORIGIN: z.string().default('*'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('GuiaMobi Acessível <no-reply@guiamobi.com>'),
  APP_RESET_PASSWORD_URL: z.string().optional().default('guiamobi://redefinir-senha'),
  // Busca de endereços (Nominatim/OpenStreetMap). A política de uso exige um
  // User-Agent que identifique a aplicação e um contato; para uso intenso,
  // troque a URL por uma instância própria ou por um provedor comercial.
  GEOCODING_BASE_URL: z.string().optional().default('https://nominatim.openstreetmap.org'),
  GEOCODING_CONTACT: z.string().optional().default(''),
  // Origem dos dados de linhas/paradas exibida em /transit/status
  // (ex.: "seed" para os dados de demonstração, "gtfs" para dados oficiais).
  TRANSIT_DATA_SOURCE: z.string().optional().default('seed'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Falha rápido e com mensagem clara caso o .env esteja incompleto/errado
  console.error('❌ Erro na validação das variáveis de ambiente:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
