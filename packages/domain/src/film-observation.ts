import * as z from "zod/mini";

import { hashSpots } from "./ball-spot";
import {
  collegeFieldProfile,
  highSchoolFieldProfile,
  nflFieldProfile,
} from "./field-profile";
import { MAX_PLAYERS_PER_SIDE } from "./formations";
import type { FieldProfile } from "./schema";

/**
 * What a film engine saw on one snap (ADR 0066): where each man lined up and
 * how each moved, in Chalk's own frame (ADR 0008) and in nobody's vocabulary.
 * The engine reads pixels; Chalk reads this. Formation, route and coverage
 * names are Chalk's to give, so an observation that carries one is refused.
 */

export const FILM_OBSERVATION_SCHEMA_VERSION = 1;

/** The field the film was shot on, which decides where the hashes are. */
export const filmFieldSchema = z.enum(["high-school", "college", "nfl"]);

const FILM_FIELD_PROFILES: Readonly<
  Record<z.infer<typeof filmFieldSchema>, FieldProfile>
> = Object.freeze({
  "high-school": highSchoolFieldProfile,
  college: collegeFieldProfile,
  nfl: nflFieldProfile,
});

/** A man can finish a play this far past the sideline and still be on film. */
const FILM_OUT_OF_BOUNDS_YARDS = 5;

/**
 * How far into the neutral zone a man's feet may be read before the man
 * counts as standing on the other side of the ball. Feet read a half yard
 * over are noise; an offense at positive depth is a field read from the
 * camera's end.
 */
const FILM_NEUTRAL_ZONE_TOLERANCE_YARDS = 1;

/**
 * How far outside a hash a ball may be read. An official spots the ball on a
 * hash or between them; a ball on a hash read a half yard over is noise, and
 * one anywhere else would place every man from a spot no official could use.
 */
const FILM_SPOT_TOLERANCE_YARDS = 1;

const yardsSchema = z.strictObject({
  lateralYards: z.number(),
  depthYards: z.number(),
});

/** Where a man was at one moment, in whole milliseconds from the snap. */
const trackSampleSchema = z.strictObject({
  atMs: z.number().check(z.int()),
  lateralYards: z.number(),
  depthYards: z.number(),
});

const observedPlayerSchema = z.strictObject({
  /** The engine's own id for this man, stable within one observation. */
  id: z.string().check(z.minLength(1)),
  side: z.enum(["offense", "defense"]),
  /** Where the man lined up, before any motion. */
  alignment: yardsSchema,
  /** Where the man went. Motion carries negative times; the snap is 0 (ADR 0028). */
  track: z.optional(
    z.array(trackSampleSchema).check(
      z.minLength(1),
      z.refine(
        (samples) =>
          samples.every(
            (sample, index) =>
              index === 0 || sample.atMs > samples[index - 1]!.atMs,
          ),
        "A track's times must run forward.",
      ),
    ),
  ),
  /** How sure the engine is of this man, from 0 to 1. */
  confidence: z.number().check(z.gte(0), z.lte(1)),
});

export const filmObservationSchema = z
  .strictObject({
    schemaVersion: z.literal(FILM_OBSERVATION_SCHEMA_VERSION),
    field: filmFieldSchema,
    /** Where the ball is spotted: yards from the middle, + to the offense's right. */
    ballLateralYards: z.number(),
    players: z.array(observedPlayerSchema),
  })
  .check(
    z.superRefine((observation, payload) => {
      const profile = FILM_FIELD_PROFILES[observation.field];
      const spotLimit =
        hashSpots({ fieldProfile: profile }).right + FILM_SPOT_TOLERANCE_YARDS;
      if (Math.abs(observation.ballLateralYards) > spotLimit) {
        payload.addIssue({
          code: "custom",
          path: ["ballLateralYards"],
          message:
            "The ball is outside the hashes: an official spots it on a hash or between them.",
        });
      }
      const lateralLimit = profile.widthYards / 2 + FILM_OUT_OF_BOUNDS_YARDS;
      const depthLimit = profile.lengthYards + 2 * profile.endZoneDepthYards;
      const onFilm = (point: { lateralYards: number; depthYards: number }) =>
        Math.abs(point.lateralYards) <= lateralLimit &&
        Math.abs(point.depthYards) <= depthLimit;

      const ids = new Set<string>();
      const perSide = { offense: 0, defense: 0 };
      for (const [index, player] of observation.players.entries()) {
        const path = ["players", index];
        if (ids.has(player.id)) {
          payload.addIssue({
            code: "custom",
            path: [...path, "id"],
            message: `Two men share the id ${player.id}.`,
          });
        }
        ids.add(player.id);
        perSide[player.side] += 1;

        if (
          !onFilm(player.alignment) ||
          !(player.track ?? []).every((sample) => onFilm(sample))
        ) {
          payload.addIssue({
            code: "custom",
            path,
            message:
              "A man is off the field: positions are yards from the ball, not pixels.",
          });
        }
        const depth = player.alignment.depthYards;
        if (
          player.side === "offense"
            ? depth > FILM_NEUTRAL_ZONE_TOLERANCE_YARDS
            : depth < -FILM_NEUTRAL_ZONE_TOLERANCE_YARDS
        ) {
          payload.addIssue({
            code: "custom",
            path: [...path, "alignment", "depthYards"],
            message:
              "A man lines up on the other side of the ball: depth is positive toward the end zone the offense attacks.",
          });
        }
      }
      for (const side of ["offense", "defense"] as const) {
        if (perSide[side] > MAX_PLAYERS_PER_SIDE) {
          payload.addIssue({
            code: "custom",
            path: ["players"],
            message: `The ${side} has ${perSide[side]} men; an official is not one of them.`,
          });
        }
      }
    }),
  );

export type FilmField = z.infer<typeof filmFieldSchema>;
export type FilmObservation = z.infer<typeof filmObservationSchema>;
export type ObservedPlayer = z.infer<typeof observedPlayerSchema>;

export type FilmObservationReading =
  | { readonly status: "read"; readonly observation: FilmObservation }
  /** From an engine newer than this Chalk: update Chalk, do not guess. */
  | { readonly status: "newer"; readonly schemaVersion: number }
  | { readonly status: "invalid"; readonly issues: readonly string[] };

const versionSchema = z.object({ schemaVersion: z.number().check(z.int()) });

/** Reads what an engine sent, refusing anything this Chalk cannot trust. */
export function readFilmObservation(input: unknown): FilmObservationReading {
  const version = versionSchema.safeParse(input);
  if (
    version.success &&
    version.data.schemaVersion > FILM_OBSERVATION_SCHEMA_VERSION
  ) {
    return { status: "newer", schemaVersion: version.data.schemaVersion };
  }
  const parsed = filmObservationSchema.safeParse(input);
  return parsed.success
    ? { status: "read", observation: parsed.data }
    : {
        status: "invalid",
        issues: parsed.error.issues.map(({ message }) => message),
      };
}
