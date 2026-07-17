import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("console", (msg) => console.log("BROWSER", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });

await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  if (rembg instanceof HTMLInputElement) rembg.checked = true;
  if (svg instanceof HTMLInputElement) svg.checked = false;
});
await page.setInputFiles("#file-input", "/tmp/test-embelify.png");
await page.click("#submit-btn");

await page.waitForFunction(() => {
  const s = document.getElementById("status")?.textContent || "";
  return s.includes("Terminé") || Boolean(document.querySelector(".status.is-error"));
}, { timeout: 300000 });

const status = await page.textContent("#status");
console.log("status", status);
const previewHidden = await page.isHidden("#preview");
const imgVisible = await page.isVisible("#preview-img");
console.log("previewHidden", previewHidden, "imgVisible", imgVisible);

if (previewHidden || !imgVisible || !status?.includes("Terminé")) {
  throw new Error("Rembg failed: " + status);
}
console.log("REMBG_OK");
await browser.close();
