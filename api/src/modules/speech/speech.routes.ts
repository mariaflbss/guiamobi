import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env';

const requestSchema = z.object({
  text: z.string().trim().min(1).max(700),
  language: z.enum(['pt', 'en', 'es']).default('pt'),
}).strict();

const VOICES: Record<'pt' | 'en' | 'es', { languageCode: string; name: string }> = {
  pt: { languageCode: 'pt-BR', name: 'pt-BR-Chirp3-HD-Callirrhoe' },
  en: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Aoede' },
  es: { languageCode: 'es-ES', name: 'es-ES-Chirp3-HD-Aoede' },
};

/** Síntese de voz neural. A chave fica exclusivamente no backend. */
const requestWindows = new Map<string, { startedAt: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const MAX_AUDIO_CACHE = 250;
const audioCache = new Map<string, string>();
const inFlightSynthesis = new Map<string, Promise<string>>();

function rememberAudio(key: string, audio: string): void {
  audioCache.delete(key);
  audioCache.set(key, audio);
  while (audioCache.size > MAX_AUDIO_CACHE) {
    const oldest = audioCache.keys().next().value;
    if (oldest === undefined) break;
    audioCache.delete(oldest);
  }
}

export async function speechRoutes(app: FastifyInstance) {
  app.post('/speech/synthesize', async (request, reply) => {
    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Texto inválido para síntese de voz.' });
    }

    if (!env.GOOGLE_TTS_API_KEY) {
      return reply.status(503).send({ message: 'Síntese de voz neural não configurada.' });
    }

    const voice = VOICES[parsed.data.language];
    const cacheKey = `${voice.name}:${parsed.data.text}`;
    const cached = audioCache.get(cacheKey);
    if (cached) {
      // Cache não consome a quota de síntese nem o limite de novas gerações.
      rememberAudio(cacheKey, cached);
      return reply.status(200).send({ audioContent: cached, contentType: 'audio/mpeg', cached: true });
    }

    // Limita apenas novas sínteses, não leituras de cache nem toques repetidos.
    const clientIp = request.ip;
    const now = Date.now();
    const window = requestWindows.get(clientIp);
    if (!window || now - window.startedAt >= WINDOW_MS) {
      requestWindows.set(clientIp, { startedAt: now, count: 1 });
    } else if (window.count >= MAX_REQUESTS_PER_WINDOW) {
      return reply.status(429).send({ message: 'Muitas solicitações de voz. Tente novamente em instantes.' });
    } else {
      window.count += 1;
    }

    try {
      let synthesis = inFlightSynthesis.get(cacheKey);
      if (!synthesis) {
        synthesis = (async () => {
          const response = await fetch(
            `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(env.GOOGLE_TTS_API_KEY)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                input: { text: parsed.data.text },
                voice: { languageCode: voice.languageCode, name: voice.name },
                audioConfig: { audioEncoding: 'MP3' },
              }),
              signal: AbortSignal.timeout(12000),
            },
          );
          if (!response.ok) {
            request.log.warn({ statusCode: response.status }, 'Falha na síntese neural do Google TTS');
            throw new Error('Google TTS indisponível');
          }
          const result = (await response.json()) as { audioContent?: string };
          if (!result.audioContent) throw new Error('Google TTS não retornou áudio');
          rememberAudio(cacheKey, result.audioContent);
          return result.audioContent;
        })();
        inFlightSynthesis.set(cacheKey, synthesis);
      }
      const audioContent = await synthesis;
      return reply.status(200).send({ audioContent, contentType: 'audio/mpeg' });
    } catch {
      return reply.status(502).send({ message: 'Serviço de voz temporariamente indisponível.' });
    } finally {
      inFlightSynthesis.delete(cacheKey);
    }
  });
}
