// Renders docs/brand/social-preview.html to docs/brand/social-preview.png (1280x640, the repository's social
// preview). Run from frontend/: node scripts/render-social-preview.mjs
import { chromium } from "@playwright/test";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const brand = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../docs/brand");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(brand, "social-preview.html")).href);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(brand, "social-preview.png") });
await browser.close();
