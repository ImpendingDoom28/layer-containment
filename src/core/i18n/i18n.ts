import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { DEFAULT_LANGUAGE_ID } from "./languages";
import { en, type EnLocale } from "./locales/en";
import { ru } from "./locales/ru";

declare module "i18next" {
  interface CustomTypeOptions {
    // English is the reference shape: every other locale is checked against
    // it (see `ru: EnLocale`) and `t()` keys are typed from it.
    resources: { translation: EnLocale };
    returnNull: false;
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
  },
  lng: DEFAULT_LANGUAGE_ID,
  fallbackLng: DEFAULT_LANGUAGE_ID,
  interpolation: {
    // JSX already escapes interpolated values.
    escapeValue: false,
  },
  returnNull: false,
  parseMissingKeyHandler: (key) => key,
});

export { i18n };
