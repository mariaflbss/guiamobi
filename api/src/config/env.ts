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
  // Overpass API (OpenStreetMap) para pontos de referência da US09. Gratuita; respeite a política de uso.
  OVERPASS_URL: z.string().optional().default('https://overpass-api.de/api/interpreter'),
  // Origem dos dados de linhas/paradas exibida em /transit/status
  // (ex.: "seed" para os dados de demonstração, "gtfs" para dados oficiais).
  TRANSIT_DATA_SOURCE: z.string().optional().default('seed'),
  // Quando "true", a busca de rotas passa a considerar também as linhas de
  // demonstração (isOfficialData=false) além das oficiais. Serve só para
  // rodar a UI localmente sem dados reais ainda carregados; NÃO deve ser
  // ligado em produção, pois faria o app apresentar linhas fictícias como
  // se fossem reais.
  ALLOW_DEMO_TRANSIT_DATA: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value === 'true'),
  // Qual TransitProvider usar: "auto" (padrão - OTP se configurado, senão
  // GTFS oficial importado se houver, senão a fixture de desenvolvimento),
  // ou forçar um específico ("otp" | "gtfs" | "dev") para testes.
  TRANSIT_PROVIDER: z.enum(['auto', 'otp', 'gtfs', 'dev']).optional().default('auto'),
  // URL base de uma instância própria do OpenTripPlanner (ex.: http://localhost:8080).
  // Vazia = OTP nunca é usado (nenhuma chamada de rede é feita). Ver README
  // de api/src/integrations/transit/ para como preparar essa instância com
  // OSM + GTFS de São José dos Campos.
  OTP_URL: z.string().optional().default(''),
  // Endpoints GTFS-Realtime (protobuf) da operadora/prefeitura, quando
  // credenciados. Vazios = nenhuma chamada de rede é feita e o app informa
  // "tempo real indisponível" (ver api/src/integrations/gtfsRealtime/).
  GTFS_REALTIME_TRIP_UPDATES_URL: z.string().optional().default(''),
  GTFS_REALTIME_VEHICLE_POSITIONS_URL: z.string().optional().default(''),
  GTFS_REALTIME_SERVICE_ALERTS_URL: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Falha rápido e com mensagem clara caso o .env esteja incompleto/errado
  console.error('❌ Erro na validação das variáveis de ambiente:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
