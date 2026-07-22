import { BRAND } from "./brand";
import { applyStaticI18n, detectLocale, setLocale, type Locale } from "./i18n";

function boot() {
  const locale = detectLocale();
  setLocale(locale);
  const select = document.getElementById("lang-select") as HTMLSelectElement | null;
  if (select) {
    select.value = locale;
    select.addEventListener("change", () => {
      setLocale(select.value as Locale);
      applyStaticI18n();
    });
  }
  const sister = document.getElementById("sister-link") as HTMLAnchorElement | null;
  if (sister) {
    sister.href = BRAND.spektrografy.url;
    sister.textContent = BRAND.spektrografy.name;
  }
  const companyMark = document.getElementById("company-mark") as HTMLImageElement | null;
  if (companyMark) {
    companyMark.src = BRAND.baggero.markSrc;
    companyMark.alt = BRAND.baggero.name;
  }
  applyStaticI18n();
}

boot();
