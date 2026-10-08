# Good CSS opportunities for Chalk

- **Date:** 2026-10-07
- **Scope:** All 47 entries on [good-css.com](https://good-css.com/), their first-party `PRACTICES.md` and generated references, and selected browser-vendor/W3C documentation. Recommendations concern the production React editor and surrounding phone, tablet, and desktop workflows.
- **Method:** Source research and static code review. Selected CSS rules were checked in isolated browser specimens with equally specific attribute selectors representing focus states. This checks cascade behavior only; the full application was not run and mobile behavior needs device verification.
- **Build:** Chalk production React source at `8dfb7b458a39912d18f7ad4248a712eb3dc3797a`; file references below refer to that commit.
- **Reviewer:** Codex

The most useful direction is to finish the accessibility and interaction rules already present in Chalk. The rankings below are recommendations inferred for this app, rather than claims that every technique in the article should be adopted.

## Highest-value changes

| Priority | Improvement | Immediate value | Relevant entry |
|---|---|---|---|
| 1 | Repair component rules that override the shared keyboard focus outline. | Small fix with a clear accessibility benefit; preserve visibility when shadows disappear. | [Focus visibility](https://good-css.com/#one-focus-ring-with-focus-visible) |
| 2 | Give phone text inputs a consistent 16px minimum. | Finish the mobile editing rule already applied to search and play titles. | [The reset](https://good-css.com/#the-reset) |
| 3 | Make hover and press feedback match the available input. | Touch taps have a visible response without retaining a desktop hover appearance. | [Hover](https://good-css.com/#hover-styles-only-where-hover-exists), [press feedback](https://good-css.com/#press-feedback) |
| 4 | Allow browser magnification of the app shell while retaining custom field gestures. | Coaches can enlarge labels, menus, and form text independently of diagram zoom; this requires a gesture regression pass. | [The reset](https://good-css.com/#the-reset) |
| 5 | Contain scrolling inside overlays and consider stable scrollbar gutters there. | Reduce scroll handoff to the page behind a dialog and width changes in scrolling panels. | [Panel scrolling](https://good-css.com/#scroll-area-between-a-fixed-header-and-footer) |

### Zoom and phone editing

Remove shell-wide zoom suppression and scope custom gesture interception to the interactive field. W3C requires a way to enlarge text to 200% without losing content or functionality; field zoom alone does not enlarge surrounding controls. This is a proposal to revisit the current gesture design, with regression checks for both field pinching and shell magnification. [W3C resize-text guidance](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

The site's reset recommends a 16px floor for inputs to avoid Safari's focus zoom, and explicitly discourages solving that problem by disabling user zoom. Apply the floor to phone editing controls, keeping canvas labels separate from UI inputs. Adopt these rules individually instead of replacing Chalk's existing reset. [First-party foundations reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/foundations.md).

### Focus and target size

Preserve a real outline when focus styling uses a shadow: forced-color modes can discard the shadow. Choose a dedicated focus color with sufficient contrast against the surrounding surface instead of mechanically using a filled button's text color. Fix cascade conflicts with the existing shared rule. [First-party interaction reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/interaction.md), [W3C focus-visible guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html).

Prefer actual button dimensions or padding for tightly packed controls. A pseudo-element that extends the target can be clipped or overlap a neighboring action. The site's 44px goal is useful for touch, but is not the WCAG AA minimum: AA specifies 24px with exceptions; enhanced AAA specifies 44px with exceptions. [W3C minimum target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [enhanced target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

### Scrolling, viewport, and text

Give panels an explicit height limit, let only their body scroll, use `min-block-size: 0` on intermediate flex wrappers, and retain fixed actions with `flex: none`. Consider `overscroll-behavior: contain` on inner scrollers; use `scrollbar-gutter: stable` where preventing width changes is worth the reserved space. [First-party scroll reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/scroll-and-viewport.md).

Keep `100dvh` for the pinned application shell; `100svh` is a better match for stable document sections. Neither is a complete virtual-keyboard solution. Test keyboard-open sheets and landscape layouts explicitly, and retain safe-area padding on fixed controls. [Browser-vendor viewport guidance](https://web.dev/blog/viewport-units).

Decide whether each user-entered value wraps or truncates; keep the complete value reachable. Put truncation on the text node's box and `min-inline-size: 0` on flex ancestors. Use clipping only where neither user nor script needs scrolling; do not replace `overflow: hidden` throughout the app. [First-party text reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/text-and-media.md), [layout reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/layout.md).

### Motion and theme

Use static state changes by default and opt into movement under `prefers-reduced-motion: no-preference`. Scripted animation must consult the same preference. Separate decorative motion from user-requested football playback and decide what reduced-motion playback should mean; the article does not settle that product decision. [First-party motion reference](https://github.com/vojtaholik/good-css/blob/main/skills/good-css/references/motion.md).

Chalk already has theme tokens and explicit color schemes. Continue routing new surface, border, focus, and press colors through those tokens. `light-dark()` is available across the three major engines, but changing two established token blocks into one does not itself improve coach workflows. Maintain the explicit light paper/export surface. [Browser-vendor `light-dark()` documentation](https://web.dev/articles/light-dark).

## Lower-value changes to defer

Container queries are appropriate when one reusable component occupies differently sized slots, and basic size queries have broad browser support. Introduce them at that seam when there is a demonstrated layout failure; retain viewport breakpoints that select whole application modes. [Browser-vendor container-query announcement](https://web.dev/blog/cq-stable).

Animated anchor indicators, scroll-driven fades, `text-box` trimming, whole-site fluid scales, and replacing existing overlay primitives should follow a concrete usability problem. Do not import the article's global reset, remove established interaction infrastructure, or expand UI animation simply to use newer CSS.

## Verification to accompany implementation

Use repeatable Playwright E2E workflows with fixed data and viewports. Cover keyboard focus through player-name, plan, and coaching inputs; coarse-pointer presses and adjacent targets; long names and large lists inside short sheets; browser magnification outside the field; field pinch preservation; reduced motion; and dark UI beside light paper previews. Phone workflows belong in `phone-*.spec.ts`. End each new spec with a screenshot or export at `testInfo.outputPath(...)`, as required by `AGENTS.md`. Safari keyboard behavior needs a real mobile browser/device check in addition to desktop viewport emulation.

## Codebase findings

### 1. Restore the shared focus outline

Chalk already defines a 2px outline for interactive elements at [`app.css:150`](../../apps/web/src/styles/app.css#L150). Later rules suppress it on coaching fields at line 6225, game-plan form fields at line 7699, game-plan codes at line 7983, and player-name inputs at line 8901. These rules have equal or greater specificity than the shared input focus rule. Their replacement is generally a 1px shadow.

The isolated cascade specimens confirmed that coaching, player-name, plan-name, and code fields lose the outline. The play title and game-plan note retain it; a search for `outline: 0` alone would incorrectly flag those as broken. Restore the shared outline on the affected selectors or preserve a transparent outline for an intentionally shadow-based design, with a forced-colors fallback. Verify by tabbing through actual forms and checking forced-color rendering. Effort: small.

### 2. Finish the phone input font floor

[`app.css:9072`](../../apps/web/src/styles/app.css#L9072) gives player-name inputs in the phone sheet a 44px height but a 14px font. Coaching inputs remain 12px in their base rules (line 6223). Game-plan form and code inputs are 12px (lines 7698 and 7981). Search fields already have targeted 16px fixes at lines 5092 and 6828, and the phone play title has one at line 7126.

Apply a 16px minimum to editable controls in phone and touch layouts, checking selector precedence and compact row sizing. Keep diagram typography separate. This follows an existing local design choice rather than introducing a new type scale. The remaining Safari focus-zoom behavior must be verified on an iPhone. Effort: small to medium.

### 3. Gate hover and complete press feedback

Most handwritten hover rules are unconditional, including sidebar rows ([`app.css:8372`](../../apps/web/src/styles/app.css#L8372)), assignment rows (line 8784), and settings tabs (line 9220). There is no `hover: hover` gate in the stylesheet. Press states exist for phone header controls (line 7082) and a few other controls, but are sparse elsewhere.

Gate decorative hover styles with `@media (hover: hover) and (pointer: fine)` and supply token-based `:active` feedback for enabled buttons and pressable rows. Do not move `.active`, `aria-selected`, `:focus-visible`, or persistent state styling into that query. Split combined selectors such as `.game-plan-note:hover, .game-plan-note:focus` so focus still works on touch. Preserve touch access to actions revealed on row hover. Prefer a background or color change for this dense editor; a scale animation is optional. Test mouse and touch interactions, including touch laptops. Effort: medium because the selectors are spread through the file.

### 4. Narrow page zoom interception to the field

[`index.html:7`](../../apps/web/index.html#L7) uses `maximum-scale=1.0, user-scalable=no`. [`main.tsx:17`](../../apps/web/src/main.tsx#L17) calls `lockPageZoom()` for the whole document. [`page-zoom.ts:14`](../../apps/web/src/app/page-zoom.ts#L14) sets root `touch-action: pan-x pan-y` and cancels document gesture events and multi-touch moves. Its comment makes this an intentional design policy.

Revisit that policy so browser magnification is available outside the interactive field. The field already owns its own pan and pinch behavior, while camera zoom cannot enlarge menus and inspector text. Removing the viewport restriction alone will not undo the JavaScript lock. Preserve field navigation and verify magnified shell forms, overlays, and page navigation on real mobile browsers. Effort: medium; highest interaction risk among these recommendations.

### 5. Extend scroll containment to overlay bodies

The menu panel has `overscroll-behavior: contain` at [`app.css:513`](../../apps/web/src/styles/app.css#L513), the only occurrence in the stylesheet. Other inner scrollers include the command palette (line 845), play card (line 4213), sidebar drawer (line 8609), phone sheet body (line 9054), and settings body (line 9290). None has a stable scrollbar gutter.

Add containment where the scroller should stop at its boundary, particularly overlays above the scrolling phone Playbooks page. Consider stable gutters for wide panels with classic scrollbars; reserving gutter space in a narrow phone sheet may not be worthwhile. Existing flex sizing and `min-height: 0` already cover many cases, so do not rewrite every panel. Retain the deliberate document-scrolling behavior at lines 9448–9477, covered by `phone-page-scroll.spec.ts`. Boundary leakage is a source-based risk, not an observed runtime defect. Effort: small CSS change plus targeted behavior checks.

### Already implemented or lower priority

- Theme tokens, explicit `color-scheme`, and light paper isolation are established by [ADR 0061](../adr/0061-dark-theme.md). Converting them to `light-dark()` is maintenance work with less immediate user benefit.
- The global reduced-motion rule exists at `app.css:6148`, and both editor and share playback inspect the preference. Do not claim reduced-motion handling is absent.
- Many 44px touch targets already exist, including the late completion pass at `app.css:8258`. Audit uncovered controls rather than applying a wholesale target-size rewrite.
- A safe-area cleanup is worth a device pass: `.play-sidebar.sidebar-drawer` declares top inset padding at line 8605 and then resets it to zero with the shorthand at line 8608. The viewport meta also omits `viewport-fit=cover`. Fix those together if edge-to-edge rendering is intended; confirm browser and installed PWA behavior before describing notch overlap as a reproduced bug.
- Global fluid typography, an OKLCH palette migration, native popover migration, and replacing virtualization with an intrinsic grid have less immediate value than the five changes above.
