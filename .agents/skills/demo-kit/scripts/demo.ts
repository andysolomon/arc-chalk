import { writeFile } from "node:fs/promises";

import type { Locator, Page, TestInfo } from "@playwright/test";

/**
 * What a walkthrough imports. The repo's fixtures come through unchanged, so
 * a walkthrough opens the editor and finds controls the way the specs do.
 */
export * from "../../../../tests/e2e/fixtures";

export interface Beat {
  /** The caption filmed under the video for this step. */
  readonly caption: string;
  /** One more sentence for the kit page. It is not filmed. */
  readonly detail?: string;
  /** Milliseconds from the start of the recording. */
  readonly startMs: number;
  readonly endMs: number;
  /** The screenshot taken when the step's result is on screen. */
  readonly still: string;
  /** Key combinations pressed during the step, for the caption band. */
  readonly keys: readonly { readonly atMs: number; readonly combo: string }[];
}

interface Pace {
  /** How long a caption is up before anything moves. */
  readonly read: number;
  /** How long a result stays on screen before the next step. */
  readonly hold: number;
  /** How long the pointer takes to reach a control. */
  readonly glide: number;
}

const PACE: Pace = { read: 1100, hold: 1100, glide: 450 };

/** A dot that follows the pointer, so a viewer can see where a click lands. */
function installPointer(): void {
  if (window !== window.top) return;
  const install = (): void => {
    if (document.getElementById("chalk-demo-pointer")) return;
    const dot = document.createElement("div");
    dot.id = "chalk-demo-pointer";
    dot.setAttribute("aria-hidden", "true");
    dot.style.cssText = [
      "position:fixed",
      "left:0",
      "top:0",
      "width:22px",
      "height:22px",
      "margin:-11px 0 0 -11px",
      "border-radius:50%",
      "background:rgba(0,114,245,0.28)",
      "border:2px solid #0072f5",
      "box-sizing:border-box",
      "pointer-events:none",
      "z-index:2147483647",
      "opacity:0",
      "transition:width 90ms,height 90ms,margin 90ms,background 90ms",
    ].join(";");
    document.documentElement.appendChild(dot);
    const press = (down: boolean): void => {
      dot.style.width = down ? "14px" : "22px";
      dot.style.height = down ? "14px" : "22px";
      dot.style.margin = down ? "-7px 0 0 -7px" : "-11px 0 0 -11px";
      dot.style.background = down
        ? "rgba(0,114,245,0.6)"
        : "rgba(0,114,245,0.28)";
    };
    window.addEventListener(
      "mousemove",
      (event) => {
        dot.style.opacity = "1";
        dot.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      },
      true,
    );
    window.addEventListener("mousedown", () => press(true), true);
    window.addEventListener("mouseup", () => press(false), true);
  };
  if (document.documentElement) install();
  document.addEventListener("DOMContentLoaded", install);
}

export interface Director {
  /**
   * One step of the walkthrough. The caption goes up, the actions run, the
   * result holds, and a screenshot is saved for the kit page.
   */
  beat(
    caption: string,
    actions: () => Promise<void>,
    options?: { detail?: string },
  ): Promise<void>;
  /** Moves the pointer to a control at a speed a viewer can follow, then clicks it. */
  click(target: Locator): Promise<void>;
  /** Moves the pointer to a point on the page, then clicks there. */
  clickAt(x: number, y: number): Promise<void>;
  /** Types into a field one key at a time. */
  type(target: Locator, text: string): Promise<void>;
  /** Presses a key combination and names it in the caption band. */
  press(combo: string): Promise<void>;
  /** Waits, for a result that needs longer on screen. */
  pause(ms: number): Promise<void>;
}

/**
 * Starts a walkthrough. Call it first in the test, before the page opens:
 * the recording starts with the page, and step times are counted from here.
 */
export async function demo(page: Page, testInfo: TestInfo): Promise<Director> {
  const startedAt = Date.now();
  const beats: Beat[] = [];
  let keys: { atMs: number; combo: string }[] = [];
  const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
  let pointer = { x: viewport.width / 2, y: viewport.height / 2 };
  await page.addInitScript(installPointer);

  const glide = async (x: number, y: number): Promise<void> => {
    const from = pointer;
    const steps = Math.max(1, Math.round(PACE.glide / 16));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      await page.mouse.move(
        from.x + (x - from.x) * eased,
        from.y + (y - from.y) * eased,
      );
      await page.waitForTimeout(16);
    }
    pointer = { x, y };
  };

  const save = (): Promise<void> =>
    writeFile(
      testInfo.outputPath("beats.json"),
      `${JSON.stringify({ viewport, beats }, null, 2)}\n`,
    );

  return {
    async beat(caption, actions, options) {
      const startMs = Date.now() - startedAt;
      keys = [];
      await page.waitForTimeout(PACE.read);
      await actions();
      await page.waitForTimeout(PACE.hold);
      const still = `step-${String(beats.length + 1).padStart(2, "0")}.png`;
      await page.screenshot({ path: testInfo.outputPath(still) });
      beats.push({
        caption,
        ...(options?.detail === undefined ? {} : { detail: options.detail }),
        startMs,
        endMs: Date.now() - startedAt,
        still,
        keys,
      });
      await save();
    },
    async click(target) {
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (!box) throw new Error("The control to click is not on screen.");
      await glide(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(160);
      await target.click();
      await page.waitForTimeout(260);
    },
    async clickAt(x, y) {
      await glide(x, y);
      await page.waitForTimeout(160);
      await page.mouse.click(x, y);
      await page.waitForTimeout(260);
    },
    async type(target, text) {
      await target.pressSequentially(text, { delay: 70 });
      await page.waitForTimeout(260);
    },
    async press(combo) {
      keys.push({ atMs: Date.now() - startedAt, combo });
      await page.waitForTimeout(200);
      await page.keyboard.press(combo);
      await page.waitForTimeout(400);
    },
    async pause(ms) {
      await page.waitForTimeout(ms);
    },
  };
}
