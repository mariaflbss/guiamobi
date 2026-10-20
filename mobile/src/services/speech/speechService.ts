import * as Speech from 'expo-speech';
import { createAudioPlayer, AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { API_URL } from '../../constants/config';
import { SpeechRate, SupportedLanguage } from '../../types/settings';

/**
 * Voz principal: Google Cloud Text-to-Speech (Chirp 3 HD), para uma fala mais
 * natural e consistente entre o emulador e aparelhos diferentes. Se a API não
 * estiver configurada/online, usa a síntese nativa do dispositivo como fallback.
 * A chave do Google nunca é enviada ao aplicativo.
 */
const SPEECH_RATE_MAP: Record<SpeechRate, number> = { lenta: 0.75, normal: 1.0, rapida: 1.3 };
const LANGUAGE_LOCALE_MAP: Record<SupportedLanguage, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES' };
let activePlayer: AudioPlayer | null = null;
let requestGeneration = 0;
// Quando uma tela crítica (ex.: alerta de 200 m) está falando, os anúncios
// periódicos da tela de acompanhamento não podem interromper essa mensagem.
let prioritySpeechActive = false;
// Cache de memória e deduplicação: toques repetidos não iniciam downloads paralelos.
const audioUriCache = new Map<string, string>();
const pendingAudio = new Map<string, Promise<string>>();
const MAX_MEMORY_CACHE = 80;
const PREFETCH_CONCURRENCY = 3;

function cacheKey(text: string, language: SupportedLanguage): string {
  return `${language}:${stableHash(text)}`;
}

function rememberAudio(key: string, uri: string): void {
  audioUriCache.delete(key);
  audioUriCache.set(key, uri);
  while (audioUriCache.size > MAX_MEMORY_CACHE) {
    const oldest = audioUriCache.keys().next().value;
    if (oldest === undefined) break;
    audioUriCache.delete(oldest);
  }
}

function stableHash(value: string): string {
  // Hash determinístico simples para nomes de cache (não é usado para segurança).
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function stopCurrentAudio(): void {
  Speech.stop();
  if (activePlayer) {
    try {
      activePlayer.pause();
      activePlayer.seekTo(0);
      activePlayer.remove();
    } catch {
      // O player pode já ter sido liberado pelo sistema operacional.
    }
    activePlayer = null;
  }
}

async function getCachedAudio(text: string, language: SupportedLanguage): Promise<string> {
  const key = cacheKey(text, language);
  const inMemory = audioUriCache.get(key);
  if (inMemory) return inMemory;
  const pending = pendingAudio.get(key);
  if (pending) return pending;

  const task = (async () => {
    // Áudio TTS é um dado de cache útil entre sessões: use armazenamento
    // persistente do app em vez de cache temporário, que o sistema pode limpar
    // sem aviso. Isso evita repetir a síntese na próxima abertura.
    const cacheDir = FileSystem.documentDirectory;
    if (!cacheDir) throw new Error('Armazenamento do aplicativo indisponível.');
    const uri = `${cacheDir}guiamobi-tts-${stableHash(`${language}:${text}`)}.mp3`;
    const existing = await FileSystem.getInfoAsync(uri);
    if (existing.exists && existing.size && existing.size > 0) {
      rememberAudio(key, uri);
      return uri;
    }

    const response = await fetch(`${API_URL.replace(/\/$/, '')}/speech/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });
    if (!response.ok) throw new Error(`Síntese neural indisponível (${response.status}).`);
    const result = (await response.json()) as { audioContent?: string };
    if (!result.audioContent) throw new Error('A API não retornou áudio.');
    await FileSystem.writeAsStringAsync(uri, result.audioContent, {
      encoding: FileSystem.EncodingType.Base64,
    });
    rememberAudio(key, uri);
    return uri;
  })();

  pendingAudio.set(key, task);
  try {
    return await task;
  } finally {
    if (pendingAudio.get(key) === task) pendingAudio.delete(key);
  }
}

function speakNatively(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
  Speech.speak(text, {
    rate: SPEECH_RATE_MAP[options.rate],
    language: LANGUAGE_LOCALE_MAP[options.language],
  });
}

export const speechService = {
  /** Pré-carrega a fala durante o tempo de leitura da tela, sem reproduzi-la. */
  prefetch(text: string, language: SupportedLanguage): void {
    const cleanText = text.trim();
    if (!cleanText) return;
    void getCachedAudio(cleanText, language).catch(() => {
      // A falha de pré-carregamento não interrompe a navegação; speak fará fallback.
    });
  },

  /** Pré-carrega primeiro a frase que o usuário provavelmente vai ouvir. */
  prefetchPriority(text: string, language: SupportedLanguage, rest: string[] = []): void {
    const clean = text.trim();
    if (clean) void getCachedAudio(clean, language).catch(() => undefined);
    const others = rest.filter((item) => item.trim() && item.trim() !== clean);
    if (others.length) this.prefetchMany(others, language);
  },

  /**
   * Pré-carrega um conjunto de frases com concorrência limitada. Disparar
   * dezenas de sínteses simultaneamente deixa a rede e o backend mais lentos
   * justamente na hora em que o usuário espera uma resposta.
   */
  prefetchMany(texts: string[], language: SupportedLanguage): void {
    const unique = Array.from(new Set(texts.map((text) => text.trim()).filter(Boolean)));
    if (!unique.length) return;

    let cursor = 0;
    const worker = async () => {
      while (cursor < unique.length) {
        const index = cursor;
        cursor += 1;
        try {
          await getCachedAudio(unique[index], language);
        } catch {
          // O pré-carregamento é oportunista; uma falha não bloqueia a tela.
        }
      }
    };

    void Promise.all(Array.from({ length: Math.min(PREFETCH_CONCURRENCY, unique.length) }, worker));
  },

  /**
   * Reproduz uma frase que já foi pré-carregada sem iniciar outra síntese.
   * Se o áudio ainda não estiver no cache, cai para o mesmo fluxo de speak().
   */
  speakCached(text: string, language: SupportedLanguage, rate: SpeechRate): void {
    const cleanText = text.trim();
    if (!cleanText) return;
    const key = cacheKey(cleanText, language);
    const uri = audioUriCache.get(key);
    if (!uri) {
      this.speak(cleanText, { rate, language });
      return;
    }
    stopCurrentAudio();
    const generation = ++requestGeneration;
    try {
      activePlayer = createAudioPlayer(uri);
      activePlayer.setPlaybackRate(SPEECH_RATE_MAP[rate], 'high');
      if (generation === requestGeneration) activePlayer.play();
    } catch {
      if (generation === requestGeneration) speakNatively(cleanText, { rate, language });
    }
  },

  speak(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
    if (prioritySpeechActive) return;
    const cleanText = text.trim();
    if (!cleanText) return;
    stopCurrentAudio();
    const generation = ++requestGeneration;

    void (async () => {
      try {
        // O cache evita novas chamadas pagas para frases já ouvidas no aparelho.
        const uri = await getCachedAudio(cleanText, options.language);
        // Se a pessoa apertou X/Parar enquanto a API respondia, não tocar o áudio.
        if (generation !== requestGeneration) return;
        activePlayer = createAudioPlayer(uri);
        // Mantém a preferência de velocidade de acessibilidade também na voz neural.
        activePlayer.setPlaybackRate(SPEECH_RATE_MAP[options.rate], 'high');
        activePlayer.play();
      } catch {
        if (generation !== requestGeneration) return;
        // A experiência continua disponível mesmo sem internet/configuração do TTS.
        speakNatively(cleanText, options);
      }
    })();
  },

  /**
   * Fala prioritária para mensagens que não podem ser cortadas por anúncios
   * periódicos da tela anterior. A prioridade permanece ativa até stop().
   */
  speakPriority(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
    const cleanText = text.trim();
    if (!cleanText) return;
    prioritySpeechActive = true;
    stopCurrentAudio();
    const generation = ++requestGeneration;

    void (async () => {
      try {
        const uri = await getCachedAudio(cleanText, options.language);
        if (generation !== requestGeneration || !prioritySpeechActive) return;
        activePlayer = createAudioPlayer(uri);
        activePlayer.setPlaybackRate(SPEECH_RATE_MAP[options.rate], 'high');
        activePlayer.play();
      } catch {
        if (generation !== requestGeneration || !prioritySpeechActive) return;
        speakNatively(cleanText, options);
      }
    })();
  },

  stop(): void {
    prioritySpeechActive = false;
    requestGeneration += 1;
    stopCurrentAudio();
  },

  async isSpeaking(): Promise<boolean> {
    if (activePlayer) return activePlayer.playing;
    return Speech.isSpeakingAsync();
  },
};
