import { describe, expect, it } from "vitest";

import { en } from "./locales/en";
import { ru } from "./locales/ru";

type FlatMap = Record<string, string>;

const flatten = (
  value: unknown,
  prefix = "",
  out: FlatMap = {}
): FlatMap => {
  if (typeof value === "string") {
    out[prefix] = value;
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
};

const extractPlaceholders = (text: string): string[] => {
  const placeholders = [...text.matchAll(/\{\{(\w+)\}\}/g)].map(
    (match) => match[1]
  );
  return [...new Set(placeholders)].sort();
};

const enFlat = flatten(en);
const ruFlat = flatten(ru);

describe("locale parity (en is the reference shape)", () => {
  it("has no empty values", () => {
    const empty = [...Object.entries(enFlat), ...Object.entries(ruFlat)].filter(
      ([, value]) => value.trim() === ""
    );
    expect(empty).toEqual([]);
  });

  it("ru defines every key from en", () => {
    const missing = Object.keys(enFlat).filter((key) => !(key in ruFlat));
    expect(missing).toEqual([]);
  });

  it("uses the same interpolation placeholders for every shared key", () => {
    // A plural base key (has an `_other` sibling) is the count=1 form in
    // English but unused in languages with finer plural rules (Russian always
    // resolves to a `_one/_few/_many/_other` form), so its placeholders are
    // allowed to differ.
    const isPluralBase = (key: string) => `${key}_other` in enFlat;
    const mismatches = Object.keys(enFlat)
      .filter((key) => key in ruFlat && !isPluralBase(key))
      .filter(
        (key) =>
          JSON.stringify(extractPlaceholders(enFlat[key])) !==
          JSON.stringify(extractPlaceholders(ruFlat[key]))
      )
      .map(
        (key) =>
          `${key}: en=${JSON.stringify(extractPlaceholders(enFlat[key]))} ru=${JSON.stringify(
            extractPlaceholders(ruFlat[key])
          )}`
      );
    expect(mismatches).toEqual([]);
  });

  it("ru extra keys are only plural variants of en keys", () => {
    const extra = Object.keys(ruFlat).filter((key) => !(key in enFlat));
    const pluralSuffixes = ["_one", "_few", "_many", "_other"];
    const invalid = extra.filter(
      (key) =>
        !pluralSuffixes.some(
          (suffix) => key.endsWith(suffix) && enFlat[key.slice(0, -suffix.length)]
        )
    );
    expect(invalid).toEqual([]);
  });
});
