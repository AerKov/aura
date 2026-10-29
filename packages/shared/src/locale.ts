/**
 * Localization (ADR 0033): the language of Aura's interface, of its agents' answers and of apps.
 * English and Ukrainian are built in; more come as files in the user data dir (`locales/<code>.json`).
 */

/** A language tag such as "uk", "en" or "pt-BR". */
export const LOCALE_CODE = /^[a-z]{2,3}(-[A-Z]{2})?$/;

export interface LocaleInfo {
  code: string;
  /** Its own name, e.g. "Українська". */
  name: string;
  /** Its English name, which agents are told, e.g. "Ukrainian". */
  englishName: string;
  builtin: boolean;
}

export const BUILTIN_LOCALES: LocaleInfo[] = [
  { code: "en", name: "English", englishName: "English", builtin: true },
  { code: "uk", name: "Українська", englishName: "Ukrainian", builtin: true },
];

export interface LocalizationState {
  /** "auto": the system's language for the interface; agents answer in the user's language. */
  choice: "auto" | string;
  available: LocaleInfo[];
}

/** The locale to show: the choice, or for "auto" the system's language if available, else English. */
export function resolveLocale(
  choice: string,
  system: readonly string[],
  available: readonly { code: string }[],
): string {
  const codes = available.map((l) => l.code);
  if (choice !== "auto" && codes.includes(choice)) return choice;
  for (const tag of system) {
    if (codes.includes(tag)) return tag;
    const base = tag.split("-")[0] ?? "";
    if (codes.includes(base)) return base;
  }
  return "en";
}
