// Run with Vite on 5191: node src/ui/theme/verify-design-kit.mjs
// Screenshots are local QA artifacts under ignored test-results/.
import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const base = process.env.OQ_DESIGN_URL ?? "http://127.0.0.1:5191";
await mkdir("test-results/design", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(`${base}/design-kit/`);
  for (const style of ["cartoon", "hand-painted", "watercolor"]) {
    const scope = page.locator(`#${style}`);
    await expect(scope.getByRole("heading", { name: "01 · Buttons & feedback" })).toBeVisible();
    const collect = scope.getByRole("radio", { name: "Collect Find the lost colors and unlock the portal." });
    await collect.focus();
    await page.keyboard.press("ArrowRight");
    await expect(scope.getByRole("radio", { name: "Race Reach the finish as fast as you can." })).toBeChecked();
    const slider = scope.getByRole("slider", { name: "Master", exact: true });
    await slider.focus(); await page.keyboard.press("ArrowRight"); await expect(slider).toHaveValue("81");
    await scope.getByRole("button", { name: "Mute sound", exact: true }).click();
    await expect(scope.getByRole("button", { name: "Unmute sound" })).toHaveAttribute("aria-pressed", "true");
    for (const kind of ["modal", "sheet"]) {
      const trigger = scope.getByRole("button", { name: `Open ${kind}`, exact: true });
      await trigger.click();
      const dialog = scope.getByRole("dialog", { name: kind === "modal" ? "A world worth keeping" : "World settings" });
      await expect(dialog).toBeVisible();
      for (let i = 0; i < 10; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
      await page.keyboard.press("Escape"); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
      expect(await trigger.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
    }
    await scope.scrollIntoViewIfNeeded();
    await page.evaluate(id => document.getElementById(id).scrollIntoView(), style);
    await page.screenshot({ path: `test-results/design/kit-${style}.png` });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/design-kit/`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/design/kit-mobile.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator(".oq-kit-spinner").first().evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  expect(errors).toEqual([]);
  // WCAG relative luminance, computed rather than estimated from color appearance.
  const lum = hex => { const rgb = hex.match(/\w\w/g).map(x => parseInt(x, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]; };
  const pairs = [["282536", "f7f4ec"], ["625d6b", "f7f4ec"], ["ffffff", "6543b5"], ["ffffff", "a3442f"], ["ffffff", "246b70"], ["4c2f85", "eee6ff"], ["843622", "f8e5d9"], ["19565b", "dcefed"]];
  for (const [fg, bg] of pairs) { const a = lum(fg), b = lum(bg); const ratio = (Math.max(a,b) + .05) / (Math.min(a,b) + .05); expect(ratio).toBeGreaterThanOrEqual(4.5); console.log(`#${fg} on #${bg}: ${ratio.toFixed(2)}:1`); }
  console.log("PASS: three styles, radios, audio sliders/mute, modal/sheet focus trap and restoration, mobile overflow, reduced motion, AA palette, no page errors.");
} finally { await browser.close(); }
