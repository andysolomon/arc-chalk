/**
 * Which pointer is actually in the Coach's hand, which is not the same
 * question as what the device is built around. An iPad answers
 * `(pointer: coarse)` whether he is working with a finger or with a Pencil,
 * and the two want opposite things: a finger wants a target big enough to hit,
 * a Pencil wants the tip to mean exactly what it points at. ADR 0016 asks for
 * both — "Apple Pencil draws and edits precisely while touch remains available
 * for viewport navigation" — so the field asks what last touched it rather
 * than what the browser says the device has.
 *
 * Nothing here knows about React or events. It is the same shape as the
 * interaction machine: state in, state out, and the shell asks it questions.
 */

export interface StylusState {
  /**
   * How many pens are on the glass. A hand resting on the iPad is not one of
   * them, which is the whole point: while the tip is down, everything else
   * touching the screen is the hand holding it.
   */
  readonly pensDown: number;
  /**
   * Whether a Pencil has been used at all. Once it has, a finger has a
   * different job — the Coach draws with the tip and moves the field with his
   * hand, and a stray finger no longer drags a man halfway across the paint.
   */
  readonly penSeen: boolean;
  /** What last touched the field, which is what its targets are sized for. */
  readonly latest?: string;
}

export const idleStylus: StylusState = Object.freeze({
  pensDown: 0,
  penSeen: false,
});

/**
 * A pointer went down. A pen raises the count and is remembered for the rest
 * of the session; anything else only records itself as the pointer in hand.
 */
export function stylusDown(
  state: StylusState,
  pointerType: string | undefined,
): StylusState {
  if (pointerType !== "pen") return { ...state, latest: pointerType };
  return {
    pensDown: state.pensDown + 1,
    penSeen: true,
    latest: pointerType,
  };
}

/** A pointer came up or was cancelled. The pen is remembered either way. */
export function stylusUp(
  state: StylusState,
  pointerType: string | undefined,
): StylusState {
  if (pointerType !== "pen") return state;
  return { ...state, pensDown: Math.max(0, state.pensDown - 1) };
}

/**
 * Whether the field should ignore this pointer outright. While a Pencil is
 * down, a touch is the hand holding it: the palm lands, the heel of the hand
 * lands, and none of it is a gesture. There is no timer here — the tip being
 * on the glass is the whole test, and a palm that lands a moment before the
 * tip is dealt with by cancelling what it started, not by guessing at it.
 */
export function stylusRejects(
  state: StylusState,
  pointerType: string | undefined,
): boolean {
  return pointerType === "touch" && state.pensDown > 0;
}

/**
 * Whether one finger moves the field rather than what is on it. Two fingers
 * have always been a pinch; this is about the single finger, and it changes
 * hands the moment a Pencil is used. Before that a finger is the only pointer
 * the Coach has, so it keeps doing everything.
 */
export function touchNavigates(
  state: StylusState,
  pointerType: string | undefined,
): boolean {
  return pointerType === "touch" && state.penSeen;
}

/**
 * Whether a pen contact should throw away what fingers were doing. A palm
 * usually lands before the tip does, so by the time the Pencil arrives the
 * field may already think it is being panned or pinched. It is not.
 */
export function penInterrupts(
  state: StylusState,
  pointerType: string | undefined,
): boolean {
  return pointerType === "pen" && state.pensDown === 0;
}

/**
 * Whether targets should be drawn for a precise pointer. A mouse and a Pencil
 * are precise; a finger is not, and a device nobody has pointed at yet is
 * taken at its word.
 */
export function stylusIsPrecise(
  state: StylusState,
  deviceIsCoarse: boolean,
): boolean {
  if (state.latest === undefined) return !deviceIsCoarse;
  return state.latest !== "touch";
}
