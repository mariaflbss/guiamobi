import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { secureStorageService } from './secureStorageService';

function key(userId: string) { return `guiamobi_profile_photo_${userId}`; }

/** Foto capturada pela câmera, copiada para o diretório persistente do app e associada à conta local. */
export const profilePhotoService = {
  async get(userId: string): Promise<string | null> {
    return secureStorageService.getItem(key(userId));
  },

  async remove(userId: string): Promise<void> {
    const savedUri = await secureStorageService.getItem(key(userId));
    if (savedUri) {
      try { await FileSystem.deleteAsync(savedUri, { idempotent: true }); } catch { /* o arquivo pode já ter sido removido */ }
    }
    await secureStorageService.removeItem(key(userId));
  },

  async capture(userId: string): Promise<string | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('Permita o acesso à câmera nas configurações do aparelho para tirar a foto.');

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      cameraType: ImagePicker.CameraType.front,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return null;

    const sourceUri = result.assets[0].uri;
    const extension = /\.(png|webp)$/i.exec(sourceUri)?.[1]?.toLowerCase() ?? 'jpg';
    const directory = FileSystem.documentDirectory;
    if (!directory) throw new Error('Não foi possível acessar o armazenamento local para salvar a foto.');

    // Não reutilizar o mesmo URI: o componente Image pode manter a imagem
    // anterior em cache quando o arquivo é sobrescrito no mesmo caminho.
    // Um URI novo garante que a nova foto seja exibida imediatamente.
    const destination = `${directory}profile-${userId}-${Date.now()}.${extension}`;
    const previousUri = await secureStorageService.getItem(key(userId));

    await FileSystem.copyAsync({ from: sourceUri, to: destination });
    await secureStorageService.setItem(key(userId), destination);

    if (previousUri && previousUri !== destination) {
      try {
        await FileSystem.deleteAsync(previousUri, { idempotent: true });
      } catch {
        // A foto anterior é apenas um artefato de armazenamento; não deve
        // impedir que a nova foto seja salva e exibida.
      }
    }

    return destination;
  },
};
