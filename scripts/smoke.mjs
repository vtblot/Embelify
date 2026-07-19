import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log("BROWSER", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
const title = await page.title();
console.log("title", title);
if (!title.includes("Embelify")) throw new Error("bad title");

await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  if (rembg instanceof HTMLInputElement) {
    rembg.checked = false;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (svg instanceof HTMLInputElement) {
    svg.checked = true;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
await page.setInputFiles("#file-input", "/tmp/test-embelify.png");

await page.waitForFunction(() => {
  const s = document.getElementById("status")?.textContent || "";
  const img = document.getElementById("preview-img");
  const svgReady =
    img instanceof HTMLImageElement &&
    !img.hidden &&
    typeof img.src === "string" &&
    img.src.startsWith("blob:");
  return svgReady || s.includes("Échec") || Boolean(document.querySelector(".status.is-error"));
}, { timeout: 120000 });

const status = await page.textContent("#status");
console.log("status", status);
const previewHidden = await page.isHidden("#preview");
const imgSrc = await page.getAttribute("#preview-img", "src");
const imgHidden = await page.isHidden("#preview-img");
console.log("previewHidden", previewHidden, "imgHidden", imgHidden, "imgSrc", imgSrc);

if (previewHidden || imgHidden || !imgSrc?.startsWith("blob:")) {
  throw new Error("SVG preview failed: " + status);
}

// XSS guard: SVG must not be injected as live DOM markup
const injectedSvg = await page.locator("#preview-svg svg, .svg-host svg, .preview-frame > svg").count();
if (injectedSvg > 0) {
  throw new Error("SVG was injected into the DOM (XSS risk)");
}

console.log("SMOKE_OK");
await browser.close();
