import { chromium } from "playwright";

/**
 * FOUC regression: CSS must be linked in <head>, and the first paint must
 * already use the dark app background (not unstyled white).
 */
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const html = await page.goto("http://127.0.0.1:5173/", {
  waitUntil: "commit",
});
if (!html || !html.ok()) throw new Error("failed to load index");

const early = await page.evaluate(() => {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')].map(
    (l) => l.getAttribute("href") || "",
  );
  const hasAppCss = links.some((h) => /styles\.css/i.test(h));
  const bodyBg = getComputedStyle(document.body).backgroundColor;
  const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  const brand = document.querySelector(".brand-mark, .brand");
  const brandColor = brand ? getComputedStyle(brand).color : "";
  return { hasAppCss, bodyBg, htmlBg, brandColor, links };
});

console.log("early", early);
if (!early.hasAppCss) throw new Error("app CSS not linked in head: " + early.links);
// Dark greenish background (#0e1612 ≈ rgb(14, 22, 18)) — not white
const parseRgb = (s) => {
  const m = String(s).match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const bg = parseRgb(early.bodyBg) || parseRgb(early.htmlBg);
if (!bg) throw new Error("could not parse background: " + early.bodyBg);
if (bg[0] > 40 || bg[1] > 50 || bg[2] > 40) {
  throw new Error("first paint still light/unstyled: " + early.bodyBg + " / " + early.htmlBg);
}

await page.waitForLoadState("networkidle");
const late = await page.evaluate(() => {
  const workspace = document.querySelector(".workspace");
  const cs = workspace ? getComputedStyle(workspace) : null;
  return {
    display: cs?.display,
    columns: cs?.gridTemplateColumns,
  };
});
console.log("late", late);
if (late.display !== "grid") throw new Error("workspace not grid after load");

console.log("FOUC_OK");
await browser.close();
