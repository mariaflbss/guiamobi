import * as Location from 'expo-location';
import { Coordinates, PermissionStatus } from '../../types/location';

/**
 * Serviço responsável por toda a interação com o GPS do dispositivo.
 * Mantém o acesso ao expo-location isolado nesta camada, seguindo o
 * fluxo Tela -> Hook -> Service -> recurso nativo.
 */
export const locationService = {
  /**
   * Solicita permissão de localização ao usuário.
   * Retorna o status para que a tela trate adequadamente o caso de negação
   * (US05 - "tratamento de permissão negada").
   */
  async requestPermission(): Promise<PermissionStatus> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    return mapStatus(status);
  },

  async getPermissionStatus(): Promise<PermissionStatus> {
    const { status } = await Location.getForegroundPermissionsAsync();
    return mapStatus(status);
  },

  /**
   * Obtém a posição atual do dispositivo. Deve ser chamado somente após
   * confirmar que a permissão foi concedida.
   */
  async getCurrentPosition(): Promise<Coordinates> {
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
  },

  /**
   * Acompanha a posição do aparelho (usado no acompanhamento da viagem).
   * Retorna a função que interrompe o acompanhamento.
   */
  async watchPosition(onChange: (coordinates: Coordinates) => void): Promise<() => void> {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 15, timeInterval: 4000 },
      (position) => onChange({ latitude: position.coords.latitude, longitude: position.coords.longitude })
    );
    return () => subscription.remove();
  },

  /**
   * Converte coordenadas em um endereço legível (geocodificação reversa),
   * usado para preencher o campo de origem com "minha localização atual".
   */
  async reverseGeocode(coordinates: Coordinates): Promise<string | null> {
    try {
      const results = await Location.reverseGeocodeAsync(coordinates);
      const place = results[0];

      if (!place) return null;

      const parts = [place.street, place.streetNumber, place.district, place.city].filter(Boolean);
      return parts.join(', ');
    } catch {
      return null;
    }
  },
};

function mapStatus(status: Location.PermissionStatus): PermissionStatus {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.DENIED) return 'denied';
  return 'undetermined';
}
