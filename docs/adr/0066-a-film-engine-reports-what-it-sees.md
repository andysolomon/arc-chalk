---
status: proposed
---

# A film engine reports what it sees, and Chalk names it

Coaches redraw plays from game film every week, most often an opponent's plays for scout
cards. We want Chalk to draft that play art from the film. Recognizing men on film takes
a vision model or a tracking system, and Chalk cannot run either on the device. Chalk also
deliberately does not host video: a Film Reference is a link, and beta excludes hosted
film (CONTEXT.md; `docs/chalk-beta-IMPLEMENTATION_PLAN.md`).

## Decision

**Chalk takes stills, not video.** The Coach scrubs their own film player to the moment
before the snap and gives Chalk that still, and later a few stills after the snap. Chalk
still never uploads, transcodes, streams or stores video, and a Film Reference keeps its
meaning.

**The engine reports a Film Observation and names nothing.** Whatever reads the stills
answers with `filmObservationSchema` (`packages/domain/src/film-observation.ts`, Zod Mini
per ADR 0027, versioned). It reports each man's side of the ball, where each lined up, an
optional track and a confidence, all in Chalk's own frame (ADR 0008). Depth is yards from
the line of scrimmage, positive toward the end zone the offense attacks, and lateral
position is yards from the middle of the field, positive to the offense's right. Turning
the camera's view into that frame is the engine's job. The observation carries no
formation, route or coverage names, and the schema is strict, so an engine that sends one
is refused rather than half-trusted.

**Chalk names what was seen.** The domain already reads a set and its lines:
`recognizeFormation`, `assignRoles`, the route catalogue, `classifyZoneCoverage`,
`playSideOf` and the man match. They turn an observation into a draft Play that is applied
as one undo step and corrected by the Coach. A draft shows what happened on one snap, not
the call, so it is never filed as a finished Play without the Coach.

**One port, two kinds of engine.** `FilmEnginePort` (`packages/contracts/src/film.ts`)
takes stills and the field (which decides where the hashes are) and resolves to an unread
observation that Chalk reads with `readFilmObservation`. The first engine is a vision
model called from a Convex action, with credentials held on the server as R2 signing
does. If full tracking is ever needed, it lives in its own project and answers through the
same port. That kind of engine needs a GPU vision stack, video storage and evaluation
against labelled film, none of which belongs in this workspace (ADR 0026) or fits its
end-to-end testing rules (`AGENTS.md`).

**Optional, online, and never in the way.** Reading film needs the network. Editing,
saving and undo never wait on it (ADR 0001), and a failed or slow reading leaves the Play
as it was.

**Stills are private.** A still goes to the engine for one reading and is not kept by
Chalk unless the Coach attaches it as an image (ADR 0031). Stills and observations never
enter telemetry (ADR 0020). The provider's retention terms must be stated in the product
before this ships.

**Accuracy comes before product work.** A throwaway spike outside this repository
measures how far the engine's men land from hand-labelled positions on real film. The
Coach-facing feature starts only if most men land within about a yard.

## Considered options

- **Let the engine name the formation and routes.** Rejected. Two vocabularies would drift,
  an engine cannot know a Coach's own Formations and Types, and a tracking engine could not
  replace a naming one without changing Chalk.
- **Build the engine as a separate project now.** Rejected for the first engine. It is one
  model call, and the naming that makes a draft useful already lives in `packages/domain`.
  The port keeps the split cheap for later.
- **Upload and host film.** Rejected. It reverses the Film Reference boundary, adds storage
  and transcoding cost, and is not needed to draft a play from a few stills.

## Consequences

- CONTEXT.md gains **Film Observation**. A Film Reference is unchanged.
- The engine and Chalk share only the schema's version. `readFilmObservation` reports an
  observation from a newer engine as `newer`, so Chalk can ask to be updated instead of
  guessing (ADR 0027).
- Fewer than eleven men on a side is a normal reading (occlusion, men out of frame). A
  twelfth is not, since the likeliest twelfth man is an official.

## Evidence

`tests/domain/film-observation.test.ts` lists the ways an engine's output can look like
data and still be wrong, one test each, written before `readFilmObservation`: pixels
reported as yards, a field read from the camera's end, an official counted as a twelfth
man, two men under one id, a track timed in seconds, a track that runs backward, a
confidence given as a percentage, an engine that names what it saw, and an observation
from a newer engine. The first test keeps real film: a centre whose feet are read half a
yard into the neutral zone, a jet motion before the snap, and a route that finishes past
the sideline. The Coach-facing feature will add a Playwright spec that feeds a fixed still
through a recorded engine response and saves the drafted Play as a screenshot.
