# Reviews

Code reviews of the Chalk Football Play Editor. Each review is one file; this index tracks what's landed, where the reviews agree, and what to work on first.

**Subject:** `Chalk Play Editor.dc.html` — single-file DC app, no build step. Extracted to the repo root from `Chalk Football Play Editor-2.zip` (dated 2026-08-02 19:11); 6,482 lines. All line numbers below and in both reviews refer to that build.

---

## Index

| Date | Review | Method | Findings | Reviewer |
|---|---|---|---|---|
| 2026-08-04 | [Static read — full file](review-2026-08-04-chalk-play-editor.md) | Line-by-line read, no app run | 13 + 5 notes | Claude Opus 5 |
| 2026-08-04 | [Behavioral pass](review-2026-08-04-behavioral-pass.md) | Chromium, state transitions | 7 (B1–B7) | *unattributed — fill in* |

> **Note on the behavioral pass.** Its content was originally appended into the static review and has been split out to keep the two evidence bases distinct. Its author isn't recorded and its runtime reproductions haven't been independently re-run — three of its *code* claims were spot-checked and all held. See the provenance note at the top of that file before acting on it.

---

## Cross-review triage

Add a column as each new review lands. Findings flagged independently by more than one reviewer are your highest-confidence work; `disputed` rows are worth reading both sides before acting.

| ID | Finding | Sev | Flagged by | Status |
|---|---|---|---|---|
| B1 | Opening a demo can overwrite the active library play | **Critical** | behavioral | open |
| B2 | Switching library plays replaces unsaved work without a guard | High | behavioral | open |
| 1 | Coverage zones missing from all export/print paths | High | static | open |
| 2 | Saves fail silently while UI shows "Saved" | High | static | open |
| 3 | Lateral yardage ~53% too large (two-scale field) | High | static | open |
| 4 | Live text/drag edits bypass `commit`, `dirty` not set | High | static | open |
| B3 | Intentional clear is auto-undone on reload | Med-High | behavioral | open |
| 5 | Formation role matching is first-match | Med | static | open |
| 6 | Animation speed depends on route angle | Med | static | open |
| 7 | `1–9` read-order shortcut advertised, not implemented | Med | static | open |
| 8 | `insertDefense` deletes offensive labels by heuristic | Med | static | open |
| 9 | `exportFrames` silent 40-frame cap + serial downloads | Med | static | open |
| B4 | A named snapshot can be relabeled "Autosave" | Med | behavioral | open |
| B5 | Packaged app cannot start offline (unpkg React) | Med | behavioral | open |
| B6 | Touch gestures / object context actions incomplete | Med | behavioral | open |
| B7 | Library and picker rows not keyboard-operable | Med | behavioral | open |
| 10 | Blocked popups fail silently in all print paths | Low-Med | static | open |
| 11 | `isLineman` hardcodes line depth | Low-Med | static | open |
| 12 | `printPlaybook` page numbers drift past ~30 plays | Low | static | open |
| 13 | Full-document clone per `pointermove` | Low (perf) | static | open |

**Status values:** `open` · `planned` · `in progress` · `fixed` · `wontfix` (say why) · `disputed` (reviewers disagree)

**Overlap so far:** none. The two passes found disjoint sets — the static read covers geometry, output correctness and code hygiene; the behavioral pass covers document identity, transitions and delivery. That's a good sign about coverage, but it also means nothing here has been independently corroborated yet. A third review that re-derives any of these from scratch would be worth more than one that explores a fourth area.

---

## Suggested sequence

Synthesized across both reviews. Ordering rationale: protect the user's data first, make the app tell the truth second, fix what's drawn third.

1. **Close the destructive paths — B1, B2.** A demo handoff must become a new unsaved play (`curPlayId:null`); switching plays must never silently replace a dirty document. B1 is the only Critical on the board and the fix is small.
2. **Unify mutation bookkeeping — #4.** One `liveEdit` helper so dirty state, undo, autosave and history can't drift apart again. This is the change that stops the same class of bug recurring.
3. **Make persistence report success — #2.** `writeLib` / `autosave` / history writes return structured results; "Saved" only shows after the durable write actually succeeded.
4. **Correct recovery semantics — B3.** Preserve intentional empty documents; make valid-history recovery offered rather than forced.
5. **Fix football-output correctness — #1, #3.** Zone export and per-axis yard conversion land together, then snapshot-test the flagship offense and defense examples.
6. **Close delivery and input gaps — B5, B6, B7.** Vendor the boot dependencies, unify pointer preflight, make primary controls keyboard-operable.

Everything else (#5–#13, B4) is worth doing but doesn't block the above.

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
