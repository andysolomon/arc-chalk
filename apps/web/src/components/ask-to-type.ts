import { type RefCallback, useCallback } from "react";

/**
 * Focus raises a tablet's keyboard, so a field takes the caret on its own
 * only when the Coach's own press or key asked to type into it (#59, #87).
 * The lint in eslint.config.js refuses autoFocus and focus from an effect,
 * and points here.
 */

export type TypingField =
  | "command-palette"
  | "concept-note"
  | "game-plan-copy"
  | "game-plan-name"
  | "game-plan-rename"
  | "game-plan-section"
  | "note-text"
  | "play-name"
  | "playbook-name"
  | "snapshot-name"
  | "variation-name";

const asked = new Set<string>();

const request = (field: TypingField, id = "") => `${field}:${id}`;

/**
 * Call from the handler of the press or key that asked to type. `id` names
 * which one of several, such as the note just placed.
 */
export function askToType(field: TypingField, id?: string): void {
  asked.add(request(field, id));
}

/**
 * The ref for a field the Coach can ask to type into. It puts the caret in
 * the field as the field appears, once for each time the Coach asked.
 * `select` selects what it already says, so typing replaces it. A field no
 * press can ask for passes `undefined`.
 */
export function useFocusWhenAsked(
  field: TypingField | undefined,
  { id, select = false }: { id?: string; select?: boolean } = {},
): RefCallback<HTMLInputElement | HTMLTextAreaElement> {
  return useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (!node || field === undefined) return;
      if (!asked.delete(request(field, id))) return;
      node.focus();
      if (select) node.select();
    },
    [field, id, select],
  );
}
