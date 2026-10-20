import { Platform } from 'react-native';
import { LightSensor } from 'expo-sensors';

export type AmbientMode = 'normal' | 'dark' | 'highContrast';

/**
 * Leitura opcional do sensor de luz ambiente.
 * O LightSensor é suportado no Android; em dispositivos sem sensor o serviço
 * permanece silencioso e informa ao chamador que a adaptação não está disponível.
 */
export const ambientLightService = {
  async isAvailable(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return await LightSensor.isAvailableAsync();
    } catch {
      return false;
    }
  },

  subscribe(onModeChange: (mode: AmbientMode) => void): () => void {
    if (Platform.OS !== 'android') return () => {};

    try {
      LightSensor.setUpdateInterval(2000);
      const subscription = LightSensor.addListener(({ illuminance }) => {
        onModeChange(modeFromLux(illuminance));
      });
      return () => subscription.remove();
    } catch {
      return () => {};
    }
  },
};

function modeFromLux(lux: number): AmbientMode {
  if (lux < 15) return 'dark';
  if (lux >= 800) return 'highContrast';
  return 'normal';
}
