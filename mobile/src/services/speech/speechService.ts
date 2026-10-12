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
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Armazenamento temporário indisponível.');
  const uri = `${cacheDir}guiamobi-tts-${stableHash(`${language}:${text}`)}.mp3`;
  const existing = await FileSystem.getInfoAsync(uri);
  if (existing.exists && existing.size && existing.size > 0) return uri;

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
  return uri;
}

function speakNatively(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
  Speech.speak(text, {
    rate: SPEECH_RATE_MAP[options.rate],
    language: LANGUAGE_LOCALE_MAP[options.language],
  });
}

export const speechService = {
  speak(text: string, options: { rate: SpeechRate; language: SupportedLanguage }): void {
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

  stop(): void {
    requestGeneration += 1;
    stopCurrentAudio();
  },

  async isSpeaking(): Promise<boolean> {
    if (activePlayer) return activePlayer.playing;
    return Speech.isSpeakingAsync();
  },
};
