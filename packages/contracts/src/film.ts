import type { FilmField, StoredImageMime } from "@chalk/domain";

/**
 * The seam between Chalk and a film engine (ADR 0066). The engine gets stills
 * the Coach took from their own film and returns a Film Observation; it never
 * gets video, and it never names a formation, route or coverage. Whether it is
 * a vision model behind a Convex action or a tracking service of its own, it
 * answers through this port.
 */

/** One still from the Coach's film, in the order it was captured. */
export interface FilmFrame {
  readonly bytes: Uint8Array;
  readonly mimeType: StoredImageMime;
  /** Where in the Coach's video the still was taken, in whole milliseconds. */
  readonly videoTimeMs?: number;
}

export interface FilmRecognitionRequest {
  /** Decides where the hashes are, which the engine calibrates against. */
  readonly field: FilmField;
  /** The first frame shows the men lined up before the snap. */
  readonly frames: readonly FilmFrame[];
}

export interface FilmEnginePort {
  /**
   * Resolves to what the engine sent, unread. Chalk trusts it only after
   * `readFilmObservation` from `@chalk/domain` has read it.
   */
  observe(request: FilmRecognitionRequest): Promise<unknown>;
}
