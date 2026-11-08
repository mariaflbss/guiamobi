const baseConfig = require('./app.json');

module.exports = {
  ...baseConfig.expo,
  plugins: [
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'Usamos sua localização para sugerir sua origem e calcular rotas de transporte público.',
      },
    ],
    [
      'expo-image-picker',
      {
        cameraPermission:
          'O GuiaMobi precisa acessar a câmera para você tirar uma foto de perfil.',
      },
    ],
    'expo-asset',
    'expo-audio',
    'expo-font',
    // US17: notificações locais de avisos das linhas (sem push remoto).
    'expo-notifications',
    'expo-task-manager',
    'expo-background-task',
    'expo-secure-store',
    'expo-sqlite',
    'expo-status-bar',
  ],
};
