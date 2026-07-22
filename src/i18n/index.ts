import { en, fr, type Dict, type Locale } from "./dictionaries";

const STORAGE_KEY = "embelify.locale";
const dicts: Record<Locale, Dict> = { en, fr };

let current: Locale = "en";

export function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "fr") return saved;
  } catch {
    /* ignore */
  }
  // Default: English (as requested)
  return "en";
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale) {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
}

export function t(key: keyof Dict): string {
  return dicts[current][key] ?? dicts.en[key] ?? String(key);
}

export function applyStaticI18n(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof Dict | undefined;
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml as keyof Dict | undefined;
    if (!key) return;
    el.innerHTML = t(key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const key = el.dataset.i18nAria as keyof Dict | undefined;
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as keyof Dict | undefined;
    if (!key) return;
    el.setAttribute("title", t(key));
  });
  root.querySelectorAll<HTMLOptionElement>("option[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof Dict | undefined;
    if (!key) return;
    el.textContent = t(key);
  });
  const titleKey = document.querySelector<HTMLElement>("title[data-i18n]")?.dataset.i18n as
    | keyof Dict
    | undefined;
  if (titleKey) document.title = t(titleKey);
}

export type { Dict, Locale };
