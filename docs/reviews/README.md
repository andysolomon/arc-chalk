# Reviews

Code reviews of the Chalk Football Play Editor. Each review is one file; this index tracks what's landed, where the reviews agree, and what to work on first.

**Subject:** `Chalk Play Editor.dc.html` — single-file DC app, no build step. Extracted to the repo root from `Chalk Football Play Editor-2.zip` (dated 2026-08-02 19:11); 6,482 lines. All line numbers below and in both reviews refer to that build.

---

## Index

| Date | Review | Method | Findings | Reviewer |
|---|---|---|---|---|
| 2026-08-04 | [Static read — full file](review-2026-08-04-chalk-play-editor.md) | Line-by-line read, no app run | 13 + 5 notes | Claude Opus 5 |
| 2026-08-04 | [Behavioral pass](review-2026-08-04-behavioral-pass.md) | Chromium, state transitions | 7 (B1–B7) | *unattributed — fill in* |
| 2026-08-04 | [Prototype against beta plan](review-2026-08-04-prototype-against-beta-plan.md) | Visual/source comparison | Superseded redesign; historical gaps only | Codex |

> **Note on the behavioral pass.** Its content was originally appended into the static review and has been split out to keep the two evidence bases distinct. Its author isn't recorded and its runtime reproductions haven't been independently re-run — three of its *code* claims were spot-checked and all held. See the provenance note at the top of that file before acting on it.

---

## Cross-review triage

Add a column as each new review lands. Findings flagged independently by more than one reviewer are your highest-confidence work; `disputed` rows are worth reading both sides before acting.

| ID | Finding | Sev | Flagged by | Status |
|---|---|---|---|---|
| B1 | Opening a demo can overwrite the active library play | **Critical** | behavioral | corrected — Phase 4.1 / adoptPlay |
| B2 | Switching library plays replaces unsaved work without a guard | High | behavioral | required — Phase 6.1 |
| 1 | Coverage zones missing from all export/print paths | High | static | prevented by design — Phase 2.3–2.4; golden owed by 9.4 |
| 2 | Saves fail silently while UI shows "Saved" | High | static | corrected — Phase 3.2 |
| 3 | Lateral yardage ~53% too large (two-scale field) | High | static | corrected — Phase 2.2 |
| 4 | Live text/drag edits bypass `commit`, `dirty` not set | High | static | corrected — Phase 3.2/3.3 |
| B3 | Intentional clear is auto-undone on reload | Med-High | behavioral | corrected — Phase 3.4 |
| 5 | Formation role matching is first-match | Med | static | untriaged |
| 6 | Animation speed depends on route angle | Med | static | untriaged |
| 7 | `1–9` read-order shortcut advertised, not implemented | Med | static | untriaged |
| 8 | `insertDefense` deletes offensive labels by heuristic | Med | static | untriaged |
| 9 | `exportFrames` silent 40-frame cap + serial downloads | Med | static | untriaged |
| B4 | A named snapshot can be relabeled "Autosave" | Med | behavioral | untriaged |
| B5 | Packaged app cannot start offline (unpkg React) | Med | behavioral | untriaged |
| B6 | Touch gestures / object context actions incomplete | Med | behavioral | untriaged |
| B7 | Library and picker rows not keyboard-operable | Med | behavioral | untriaged |
| 10 | Blocked popups fail silently in all print paths | Low-Med | static | untriaged |
| 11 | `isLineman` hardcodes line depth | Low-Med | static | untriaged |
| 12 | `printPlaybook` page numbers drift past ~30 plays | Low | static | untriaged |
| 13 | Full-document clone per `pointermove` | Low (perf) | static | untriaged |

**Status values:** `untriaged` · `required — Phase N` (a corrected expectation that phase must satisfy) · `corrected — Phase N` (already delivered) · `prevented by design` (the production architecture makes it unreachable) · `wontfix` (say why) · `disputed` (reviewers disagree)

> **Status is measured against the production beta, not the prototype.** These statuses changed meaning once the rebuild became the deliverable. A row is no longer "fixed" by patching `Chalk Play Editor.dc.html` — that file is the frozen specification and must stay byte-identical to the archive. A row closes when the production app behaves correctly and has evidence. The corrected expectations are recorded in [`docs/original-prototype-parity-matrix.md`](../original-prototype-parity-matrix.md), which is where an implementer will actually look.

**Overlap so far:** none. The two passes found disjoint sets — the static read covers geometry, output correctness and code hygiene; the behavioral pass covers document identity, transitions and delivery. That's a good sign about coverage, but it also means nothing here has been independently corroborated yet. A third review that re-derives any of these from scratch would be worth more than one that explores a fourth area.

---

## What happened to these findings

*Superseded. The original sequence here proposed fixing the prototype in place, in the order "protect the user's data, then make the app tell the truth, then fix what's drawn." That ordering was right and the beta plan absorbed it — but the target moved.*

The six highest-severity findings were fixed and browser-verified against the prototype on the `fix/review-findings` branch (53 checks across four suites). Those commits were never merged and should not be: the tracked prototype is the frozen parity specification and must stay byte-identical to `Chalk Football Play Editor-2/`. The branch survives as executable evidence of the corrected behavior, and those four test files satisfy the parity matrix's requirement for "behavior scripts including corrected expectations for documented prototype defects."

Independently, the production rebuild absorbed most of the same corrections as architecture rather than as patches:

- **#3** — Phase 2.2 works in explicit yard units on both axes and chose grass-true 45-degree breaks deliberately, which is the decision finding #3 asked for.
- **#2, #4** — Phases 3.2 and 3.3 separate transient from committed state, make every gesture exactly one commit and one undo entry, and report the durable outcome truthfully.
- **B3** — Phase 3.4 recovers only unparseable storage and offers rather than forces it.
- **#1** — Phases 2.3–2.4 give every renderer one `RenderScene`, so a zone cannot exist on screen and be missing from an export.

**B2 is the one that remains, and it is the reason this triage still matters.** B1 was corrected in Phase 4.1 Demo/Tour: a demo handoff is a new Play via `EditorStore.adoptPlay`, so saving it cannot rewrite the Play that was open. B2 is a behavior an implementer would otherwise reproduce faithfully, because the matrix's standing rule is that the rebuild must be identical to the original. It is recorded as an approved correction in the parity matrix and assigned to Phase 6.1.

The `untriaged` rows still need a decision each before their owning phase closes.

---

## Conventions

**Filenames:** `review-YYYY-MM-DD-<short-scope>.md`. Date first so the folder sorts chronologically; scope so you can tell a full read from a targeted pass at a glance.

**Every review must open with a header block covering:**

- Date
- Scope — what was read, and what was deliberately excluded
- **Method — and specifically whether the app was actually run.** A static read and a behavioral pass are different kinds of evidence and shouldn't be blended in one claim.
- Which build the line numbers refer to (name and date the archive)
- Reviewer

**Then, ideally:** a priority summary table, findings ordered by user impact with `file:line` anchors and a proposed fix each, and a separate section for nitpicks so they don't dilute real defects.

Two things make cross-review comparison actually work: the `file:line` anchors (without them you can't tell whether two reviewers found the same bug or two different ones in the same function), and an honest method line (so you know whether a claim was read or observed).

**Merging reviews:** don't. Add a file and a triage column. Two reviews blended into one document lose the independence that makes agreement between them meaningful.
