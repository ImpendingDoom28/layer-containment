export const DEFAULT_LANGUAGE_ID = "en" as const;

export const LANGUAGE_IDS = ["en", "ru"] as const;

export type LanguageId = (typeof LANGUAGE_IDS)[number];

// Native names, so each language is recognizable in any UI language.
export const LANGUAGE_NAMES: Record<LanguageId, string> = {
  en: "English",
  ru: "Русский",
};

export const isLanguageId = (value: unknown): value is LanguageId =>
  typeof value === "string" && (LANGUAGE_IDS as readonly string[]).includes(value);

export const normalizeLanguageId = (value: unknown): LanguageId =>
  isLanguageId(value) ? value : DEFAULT_LANGUAGE_ID;
