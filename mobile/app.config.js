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
  ],
};
