import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en/common.json';
import fr from './locales/fr/common.json';
import pcm from './locales/pcm/common.json';

/**
 * English is the fully authored base language. `fr` and `pcm` are PLACEHOLDER slots for future
 * reviewed translations — they intentionally contain no machine-translated strings, so missing keys
 * fall back to English deterministically.
 */
export const UI_LANGUAGES = [
  { code: 'en', label: 'English', status: 'Complete' },
  { code: 'fr', label: 'Français', status: 'Not translated yet (shows English)' },
  { code: 'pcm', label: 'Pidgin', status: 'Not translated yet (shows English)' },
] as const;

const stored = (() => {
  try {
    return localStorage.getItem('mm_lang') ?? undefined;
  } catch {
    return undefined;
  }
})();

void i18n.use(initReactI18next).init({
  resources: { en: { common: en }, fr: { common: fr }, pcm: { common: pcm } },
  lng: stored ?? 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export function setUiLanguage(code: string) {
  void i18n.changeLanguage(code);
  try {
    localStorage.setItem('mm_lang', code);
  } catch {
    /* storage unavailable — language still applies for this visit */
  }
  document.documentElement.lang = code === 'pcm' ? 'en' : code;
}

export default i18n;
