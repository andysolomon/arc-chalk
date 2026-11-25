import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Can a finger reach every control a screen shows? A control is reachable
 * when it lies wholly on the glass, inside the safe area, and the point at
 * its centre belongs to it: nothing from another layer paints over it there.
 *
 * About a dozen phone fixes were one of these faults, so the guard names
 * which one it found and the fix that has worked for it before.
 */
export type Fault =
  | {
      readonly kind: "outside";
      readonly control: string;
      readonly edge: "left" | "right" | "top" | "bottom";
      readonly by: number;
      /** The absolute or fixed panel the control rides in, if any. */
      readonly panel: string | null;
    }
  | {
      readonly kind: "covered";
      readonly control: string;
      readonly coverer: string;
      readonly x: number;
      readonly y: number;
      /** The z-index each side stands on, read off its stacking ancestors. */
      readonly controlLayer: string;
      readonly covererLayer: string;
    }
  | {
      readonly kind: "clipped";
      readonly control: string;
      /** The box that cuts it off, which a finger cannot scroll. */
      readonly clipper: string;
      readonly edge: "left" | "right" | "top" | "bottom";
      readonly panel: string | null;
    }
  | {
      readonly kind: "over-field";
      readonly control: string;
      readonly by: number;
    };

/** One entry per fault, with the fix that has worked for that fault. */
export function explain(fault: Fault, where: string): string {
  switch (fault.kind) {
    case "outside":
      return (
        `${where}: ${fault.control} runs ${Math.ceil(fault.by)} px past the ` +
        `${fault.edge} edge of the glass. ` +
        (fault.panel
          ? `Fix: give ${fault.panel} the keepInViewport ref ` +
            `(apps/web/src/components/keep-in-viewport.ts), which nudges a ` +
            `floating panel back inside the window and lets a tall one scroll.`
          : `Fix: the row that holds it is wider than the glass. Let the row ` +
            `wrap or scroll (max-width: 100%; overflow-x: auto), or give the ` +
            `control one home in More.`)
      );
    case "covered":
      return (
        `${where}: ${fault.control} is covered by ${fault.coverer} at its ` +
        `centre (${Math.round(fault.x)}, ${Math.round(fault.y)}), so a tap ` +
        `there lands on the cover. The control stands on ${fault.controlLayer}; ` +
        `the cover stands on ${fault.covererLayer}. Fix: put the control's ` +
        `panel or row on a higher layer than the cover, or move the cover clear ` +
        `of it.`
      );
    case "clipped":
      return (
        `${where}: ${fault.control} is cut off past the ${fault.edge} edge ` +
        `of ${fault.clipper}, which clips what floats in it, so a tap there ` +
        `lands on whatever is drawn beyond. ` +
        (fault.panel
          ? `Fix: give ${fault.panel} the keepInViewport ref ` +
            `(apps/web/src/components/keep-in-viewport.ts), which fits a ` +
            `floating panel to the box that clips it and lets a tall one ` +
            `scroll.`
          : `Fix: let ${fault.clipper} scroll, or move the control out of it.`)
      );
    case "over-field":
      return (
        `${where}: ${fault.control} floats ${Math.ceil(fault.by)} px over the ` +
        `drawn field at Fit, hiding the play under it. Fix: place it from ` +
        `the field's own edge, in the letterbox or the tool row, rather ` +
        `than at a fixed offset from the bottom of the glass.`
      );
  }
}

/**
 * Collects the faults of every visible control under `root`. It runs in the
 * page, so it carries everything it needs. A control inside a box the Coach
 * can scroll is scrolled into that box first; one clipped by a box he cannot
 * scroll is not, since a finger cannot reach it either.
 */
function collectFaults(
  root: Element,
  withField: boolean,
): {
  readonly checked: number;
  readonly faults: Fault[];
} {
  const CONTROLS = [
    "button",
    "a[href]",
    "input:not([type='hidden'])",
    "select",
    "textarea",
    "summary",
    "[role='button']",
    "[role='link']",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='menuitemcheckbox']",
    "[role='option']",
    "[role='tab']",
    "[role='switch']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='slider']",
  ].join(",");

  const text = (node: Element) =>
    (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 48);

  const nameOf = (node: Element): string => {
    const label = node.getAttribute("aria-label");
    if (label) return label;
    const by = node.getAttribute("aria-labelledby");
    if (by) {
      const named = by
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter((found): found is HTMLElement => Boolean(found))
        .map(text)
        .join(" ");
      if (named) return named;
    }
    if (node instanceof HTMLInputElement && node.labels?.[0]) {
      return text(node.labels[0]);
    }
    return text(node) || node.getAttribute("title") || "";
  };

  const roleOf = (node: Element): string => {
    const role = node.getAttribute("role");
    if (role) return role;
    const tag = node.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "input") {
      const type = (node as HTMLInputElement).type;
      return type === "range"
        ? "slider"
        : type === "checkbox"
          ? "checkbox"
          : "textbox";
    }
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "aside") return "complementary";
    if (tag === "nav") return "navigation";
    if (tag === "header") return "banner";
    return tag;
  };

  const classes = (node: Element) => {
    const list = [...node.classList].slice(0, 3);
    return list.length ? `.${list.join(".")}` : node.tagName.toLowerCase();
  };

  const describe = (node: Element) => {
    const name = nameOf(node);
    return `${roleOf(node)}${name ? ` "${name}"` : ""} (${classes(node)})`;
  };

  /** The nearest labelled thing a coach would recognise as the cover. */
  const describeCover = (node: Element) => {
    const named = node.closest(
      "[aria-label], [role='dialog'], [role='menu'], [role='toolbar'], aside, nav, header, dialog",
    );
    if (!named || named === document.body) return describe(node);
    return named === node
      ? describe(node)
      : `${describe(named)}, at ${classes(node)}`;
  };

  /** The z-index of each stacking ancestor, innermost first. */
  const layerOf = (node: Element): string => {
    const steps: string[] = [];
    for (let at: Element | null = node; at; at = at.parentElement) {
      const style = getComputedStyle(at);
      if (style.zIndex !== "auto" && style.position !== "static") {
        steps.push(`z-index ${style.zIndex} on ${classes(at)}`);
      }
    }
    return steps.length ? steps.join(" inside ") : "the page's own layer";
  };

  const isScroller = (node: Element, axis: "x" | "y") => {
    const style = getComputedStyle(node);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    if (!/(auto|scroll|overlay)/.test(overflow)) return false;
    return axis === "x"
      ? node.scrollWidth > node.clientWidth + 1
      : node.scrollHeight > node.clientHeight + 1;
  };

  /** Scrolls the boxes a Coach can scroll until the control is in view. */
  const reveal = (control: Element) => {
    for (let at = control.parentElement; at; at = at.parentElement) {
      if (at === document.body || at === document.documentElement) break;
      const box = at.getBoundingClientRect();
      const own = control.getBoundingClientRect();
      if (isScroller(at, "y")) {
        if (own.top < box.top) at.scrollTop -= box.top - own.top;
        else if (own.bottom > box.bottom) {
          at.scrollTop += Math.min(own.bottom - box.bottom, own.top - box.top);
        }
      }
      if (isScroller(at, "x")) {
        if (own.left < box.left) at.scrollLeft -= box.left - own.left;
        else if (own.right > box.right) {
          at.scrollLeft += Math.min(own.right - box.right, own.left - box.left);
        }
      }
    }
    // The document may scroll up and down (the Playbooks pages do); never
    // sideways, so that is not undone here.
    const own = control.getBoundingClientRect();
    if (own.bottom > window.innerHeight || own.top < 0) {
      const scroller = document.scrollingElement ?? document.documentElement;
      if (scroller.scrollHeight > scroller.clientHeight + 1) {
        window.scrollBy(
          0,
          own.top < 0 ? own.top : own.bottom - window.innerHeight,
        );
      }
    }
  };

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;inset:0;visibility:hidden;pointer-events:none;" +
    "padding:env(safe-area-inset-top) env(safe-area-inset-right) " +
    "env(safe-area-inset-bottom) env(safe-area-inset-left)";
  document.body.append(probe);
  const inset = getComputedStyle(probe);
  const safe = {
    left: parseFloat(inset.paddingLeft) || 0,
    top: parseFloat(inset.paddingTop) || 0,
    right:
      document.documentElement.clientWidth -
      (parseFloat(inset.paddingRight) || 0),
    bottom: window.innerHeight - (parseFloat(inset.paddingBottom) || 0),
  };
  probe.remove();

  const visible = (control: Element) => {
    if (control.closest("[inert]")) return false;
    if (
      !control.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
      })
    ) {
      return false;
    }
    const box = control.getBoundingClientRect();
    // A screen reader's 1 px copy is not a control a finger is offered.
    return box.width > 2 && box.height > 2;
  };

  /** Where the play is drawn on the glass, not where its element box is. */
  const drawn = (() => {
    const svg = document.querySelector("svg.field-diagram");
    if (!withField || !svg) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const node of svg.querySelectorAll("*")) {
      if (node.closest("defs")) continue;
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      left = Math.min(left, box.left);
      top = Math.min(top, box.top);
      right = Math.max(right, box.right);
      bottom = Math.max(bottom, box.bottom);
    }
    return left === Infinity ? null : { svg, left, top, right, bottom };
  })();

  const faults: Fault[] = [];
  let checked = 0;
  const SLACK = 0.5;
  for (const control of root.querySelectorAll(CONTROLS)) {
    // A control nested in another (a label inside a button) is checked as
    // the outer one.
    if (control.parentElement?.closest(CONTROLS)) continue;
    if (!visible(control)) continue;
    checked += 1;
    reveal(control);
    const box = control.getBoundingClientRect();
    const name = describe(control);
    const panel = (() => {
      for (let at: Element | null = control; at; at = at.parentElement) {
        const { position } = getComputedStyle(at);
        if (position === "absolute" || position === "fixed") {
          return at.hasAttribute("aria-label") ? describe(at) : classes(at);
        }
      }
      return null;
    })();
    const over = [
      { edge: "left" as const, by: safe.left - box.left },
      { edge: "top" as const, by: safe.top - box.top },
      { edge: "right" as const, by: box.right - safe.right },
      { edge: "bottom" as const, by: box.bottom - safe.bottom },
    ].find(({ by }) => by > SLACK);
    if (over) {
      faults.push({ kind: "outside", control: name, panel, ...over });
      continue;
    }
    if (drawn && !drawn.svg.contains(control)) {
      const across =
        Math.min(box.right, drawn.right) - Math.max(box.left, drawn.left);
      const down =
        Math.min(box.bottom, drawn.bottom) - Math.max(box.top, drawn.top);
      if (across > 2 && down > 2) {
        faults.push({
          kind: "over-field",
          control: name,
          by: Math.min(across, down),
        });
        continue;
      }
    }
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit) continue;
    if (hit === control || control.contains(hit)) continue;
    const label = hit.closest("label");
    if (label && (label.control === control || label.contains(control)))
      continue;
    // Not hit at its centre: either a box that clips it ends short of that
    // point, or another layer paints over it there.
    const clip = (() => {
      for (let at = control.parentElement; at; at = at.parentElement) {
        if (at === document.body) break;
        const style = getComputedStyle(at);
        if (style.overflowX === "visible" && style.overflowY === "visible") {
          continue;
        }
        const edges = at.getBoundingClientRect();
        const edge =
          x < edges.left
            ? "left"
            : x > edges.right
              ? "right"
              : y < edges.top
                ? "top"
                : y > edges.bottom
                  ? "bottom"
                  : null;
        if (edge) {
          const clipper = at.hasAttribute("aria-label")
            ? describe(at)
            : classes(at);
          return { clipper, edge } as const;
        }
      }
      return null;
    })();
    if (clip) {
      faults.push({ kind: "clipped", control: name, panel, ...clip });
      continue;
    }
    faults.push({
      kind: "covered",
      control: name,
      coverer: describeCover(hit),
      x,
      y,
      controlLayer: layerOf(control),
      covererLayer: layerOf(hit),
    });
  }
  return { checked, faults };
}

/**
 * Every visible control under `scope` (the whole page when it is null) is
 * wholly on the glass and takes its own taps. With `field`, none floats over
 * the drawn play either, which holds at Fit with nothing open.
 */
export async function expectReachable(
  page: Page,
  scope: Locator | null,
  where: string,
  { field = false }: { readonly field?: boolean } = {},
): Promise<number> {
  const root = scope ?? page.locator("body");
  await expect(root).toBeVisible();
  const { checked, faults } = await root.evaluate(collectFaults, field);
  expect(
    faults.map((fault) => explain(fault, where)),
    where,
  ).toEqual([]);
  // A screen that shows no control was not opened, so the pass means nothing.
  expect(checked, `${where}: no control was checked`).toBeGreaterThan(0);
  return checked;
}
