/** Diagnostic only: is the HUD Sound button reachable once Escape releases the lock? */
import { expect, test, type Page } from "@playwright/test";

const SAMPLE = "The desk & sofa adventure";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/levels", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
});

async function openAndLock(page: Page): Promise<void> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ has: page.getByRole("heading", { name: SAMPLE }) });
  await card.getByRole("button", { name: "Play now" }).click();
  await page.getByRole("button", { name: /^Play$/ }).waitFor();
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__objectquest?.get() ?? null)).not.toBeNull();
}

async function dump(page: Page, label: string): Promise<void> {
  const report = await page.evaluate(() => {
    const describe = (el: Element | null): string => {
      if (!el) return "none";
      const cls = typeof el.className === "string" && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).join(".")}`
        : "";
      return `${el.tagName.toLowerCase()}${cls}`;
    };
    const targets = [...document.querySelectorAll("button")].filter((b) =>
      /^(Sound|Start gameplay capture)$/.test((b.textContent ?? "").trim()),
    );
    return targets.map((b) => {
      const r = b.getBoundingClientRect();
      const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).map(describe);
      return { label: (b.textContent ?? "").trim(), topmost: stack[0], stack: stack.slice(0, 5) };
    });
  });
  console.log(`[${label}] ${JSON.stringify(report)}`);
}

test("Sound button reachability while locked vs paused", async ({ page }) => {
  await openAndLock(page);
  await dump(page, "pointer LOCKED");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(false);
  await dump(page, "PAUSED, lock released");

  // Raw mouse click (no actionability gate) — what a real user's mouse does.
  const box = await page.getByRole("button", { name: "Sound" }).boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(500);
  console.log(
    `[PAUSED] raw click on "Sound" → panel open = ${await page.getByRole("group", { name: "Sound" }).isVisible()}`,
  );

  const capture = page.getByRole("button", { name: "Start gameplay capture" });
  if (await capture.isVisible()) {
    const cb = await capture.boundingBox();
    if (cb) await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.waitForTimeout(500);
    console.log(
      `[PAUSED] raw click on "Start gameplay capture" → recording = ` +
        `${await page.getByRole("button", { name: "Stop gameplay capture" }).isVisible()}`,
    );
  }
});

test("is there any keyboard path to the Sound panel during play?", async ({ page }) => {
  await openAndLock(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();

  // Tab through the document and see whether the HUD Sound button is reachable.
  let reached = false;
  for (let i = 0; i < 25 && !reached; i += 1) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => (document.activeElement?.textContent ?? "").trim() === "Sound");
  }
  console.log(`[PAUSED] Sound button reachable by Tab within 25 stops = ${reached}`);

  if (reached) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const open = await page.getByRole("group", { name: "Sound" }).isVisible();
    const onTop = await page.evaluate(() => {
      const panel = document.getElementById("game-audio-controls");
      if (!panel) return "no panel";
      const r = panel.getBoundingClientRect();
      const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      const cls = top && typeof top.className === "string" ? top.className : "";
      return `${top?.tagName.toLowerCase()}${cls ? `.${cls.trim().split(/\s+/).join(".")}` : ""}`;
    });
    console.log(`[PAUSED] Enter on Sound → panel open = ${open}; topmost element over the panel = ${onTop}`);
  }
});
