import { BUILTIN_LOCALES, resolveLocale } from "@aura/shared";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useChatStore } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { UK } from "./uk";

/** Built-in translations, keyed by the English text. English needs none. */
const BUILTIN: Record<string, Record<string, string>> = { uk: UK };

/** Strings from `locales/<code>.json` in the data dir: whole languages or corrections. */
const fetched = new Map<string, Record<string, string>>();
const listeners = new Set<() => void>();
let version = 0;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function loadStrings(code: string): Promise<void> {
  if (fetched.has(code)) return;
  fetched.set(code, {});
  try {
    fetched.set(code, await call(() => api.localization.strings({ code }).get()));
  } catch {
    // No file: the built-in strings (or English) stay.
  }
  version++;
  for (const l of listeners) l();
}

function systemLanguages(): string[] {
  return typeof navigator === "undefined" ? [] : [...(navigator.languages ?? [navigator.language])];
}

/** The language the interface shows now (ADR 0033). */
export function useLocale(): string {
  const localization = useChatStore((s) => s.customize?.localization);
  return useMemo(
    () =>
      resolveLocale(
        localization?.choice ?? "auto",
        systemLanguages(),
        localization?.available ?? BUILTIN_LOCALES,
      ),
    [localization],
  );
}

/** Fills `{name}` placeholders. */
function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** The language shown now, for `tr` (set by `useT` as the app renders). */
let current = "en";

function lookup(locale: string, text: string): string {
  return fetched.get(locale)?.[text] ?? BUILTIN[locale]?.[text] ?? text;
}

/**
 * Translates interface text outside a hook: `tr("Save")`, in the language shown now. The app is
 * drawn again when the language changes (see `useLocaleKey`), so every `tr` follows.
 */
export function tr(text: string, vars?: Record<string, string | number>): string {
  return fill(lookup(current, text), vars);
}

/**
 * A key for the app's root that changes with the language and when its strings arrive, so the whole
 * interface is drawn again in the new language, `tr` included.
 */
export function useLocaleKey(): string {
  const locale = useLocale();
  const v = useSyncExternalStore(subscribe, () => version);
  current = locale;
  useEffect(() => {
    if (locale !== "en") void loadStrings(locale);
    document.documentElement.lang = locale;
  }, [locale]);
  return `${locale}:${v}`;
}

/**
 * Translates interface text: `t("Your apps")`. A string with no translation stays in English, so
 * the interface is never blank; translations grow with each release and with locale files.
 */
export function useT(): (text: string, vars?: Record<string, string | number>) => string {
  const locale = useLocale();
  const v = useSyncExternalStore(subscribe, () => version);
  useEffect(() => {
    if (locale !== "en") void loadStrings(locale);
  }, [locale]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `v` changes when locale files arrive.
  return useCallback((text, vars) => fill(lookup(locale, text), vars), [locale, v]);
}
