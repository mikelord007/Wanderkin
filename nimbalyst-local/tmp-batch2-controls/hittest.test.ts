/** Diagnostic only: what actually sits on top of the in-game HUD controls. */
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

test("dump hit-test and stacking for the in-game HUD controls", async ({ page }) => {
  await openAndLock(page);

  const report = await page.evaluate(() => {
    const describe = (element: Element | null): string => {
      if (!element) return "none";
      const id = element.id ? `#${element.id}` : "";
      const cls = element.className && typeof element.className === "string"
        ? `.${element.className.trim().split(/\s+/).join(".")}`
        : "";
      return `${element.tagName.toLowerCase()}${id}${cls}`;
    };
    const chain = (element: Element | null): string[] => {
      const out: string[] = [];
      let node: Element | null = element;
      while (node && node !== document.documentElement) {
        const style = getComputedStyle(node);
        out.push(
          `${describe(node)} {position:${style.position}; z-index:${style.zIndex}; ` +
            `transform:${style.transform === "none" ? "none" : "set"}; filter:${style.filter}; ` +
            `isolation:${style.isolation}; opacity:${style.opacity}; pointer-events:${style.pointerEvents}}`,
        );
        node = node.parentElement;
      }
      return out;
    };

    const buttons = [...document.querySelectorAll("button")].filter((b) =>
      /^(Sound|Start gameplay capture|Pause)$/.test((b.textContent ?? "").trim()),
    );

    return buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const stack = document.elementsFromPoint(x, y).map(describe);
      return {
        label: (button.textContent ?? "").trim(),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
        topmostAtCenter: stack[0] ?? "none",
        hitStack: stack.slice(0, 6),
        buttonAncestry: chain(button),
      };
    });
  });

  console.log(JSON.stringify(report, null, 2));

  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return null;
    const style = getComputedStyle(canvas);
    const rect = canvas.getBoundingClientRect();
    return {
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      position: style.position,
      zIndex: style.zIndex,
      pointerEvents: style.pointerEvents,
      parent: canvas.parentElement?.className ?? null,
      parentStyle: canvas.parentElement
        ? (({ position, zIndex, transform }) => ({ position, zIndex, transform: transform === "none" ? "none" : "set" }))(
            getComputedStyle(canvas.parentElement),
          )
        : null,
    };
  });
  console.log("canvas:", JSON.stringify(canvasInfo, null, 2));
});
