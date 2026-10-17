import type { EnLocale } from "./en";

// Structural shape of a locale: the same keys as English, but with `string`
// leaf values instead of literal types. Lets us type `ru` against the English
// key set (catching missing/misspelled keys) while permitting translation
// strings and language-specific plural variants (e.g. Russian `_one/_few/
// _many`). `EnLocale` itself stays literal so `t()` keys are fully typed.
type LocaleShape<T> = T extends string
  ? string
  : T extends object
    ? { [K in keyof T]: LocaleShape<T[K]> }
    : T;

export type Locale = LocaleShape<EnLocale>;
