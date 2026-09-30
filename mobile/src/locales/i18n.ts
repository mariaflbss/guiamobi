import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import pt from './pt/translation.json';
import en from './en/translation.json';
import es from './es/translation.json';

/**
 * Configuração do i18next (US08 - idiomas Português, Inglês e Espanhol).
 * O idioma inicial é definido pelo SettingsContext, que carrega a
 * preferência salva (ou o idioma do dispositivo, na primeira execução) e
 * chama `i18n.changeLanguage`.
 */
i18n.use(initReactI18next).init({
  resources: {
    pt: { translation: pt },
    en: { translation: en },
    es: { translation: es },
  },
  lng: 'pt',
  fallbackLng: 'pt',
  interpolation: { escapeValue: false },
});

export default i18n;
