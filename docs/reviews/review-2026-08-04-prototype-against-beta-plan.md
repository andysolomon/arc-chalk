# Current Prototype Review Against the Chalk Beta Plan

Date: 2026-08-04  
Artifact reviewed: `Chalk Play Editor.dc.html`  
Target: `docs/chalk-beta-IMPLEMENTATION_PLAN.md` and ADRs 0001–0038

## Bottom line

The current prototype is an unusually capable interaction study. It proves that football-specific drawing, formations, route editing, playback, coaching outputs, keyboard shortcuts, and a full-window workspace can coexist without turning Chalk into a generic diagramming tool. Its strongest work should remain a behavioral reference.

It is not yet a convincing prototype of the planned product as a whole. It visually centers a single drawing session, while the beta centers a Coach's durable Playbooks, device-local safety, multi-device continuity, immutable publications, and dependable retrieval over a season. Its mostly monochrome interface is disciplined but gives too little visual weight to product identity, navigation, state, and hierarchy.

## What should carry forward

### Field-first editing

The field receives nearly all available space. Narrow tool and inspector rails avoid modal tool flows and keep the Play visible while editing. This is the correct editor priority.

### Football language

Controls such as Formation, Line Call, Concept, Coverage, Routes, and ball placement speak like a coach. Explanatory copy describes consequences rather than internal implementation.

### Direct-manipulation density

Selection, zoom, pan, route handles, snapping, quick route presets, mirroring, animation, and formation application are available without a ribbon full of permanent labels. The shortcut and status treatment is especially useful for experienced Coaches.

### Restrained visual primitives

Simple player marks and lines work well at multiple zoom levels and should continue to drive SVG, print, and export. The prototype avoids decorative football imagery that would compete with the Play.

### Inspector follows selection

Keeping context-sensitive editing on the right is the correct foundation for a deep but learnable editor.

## What should change for the beta direction

### 1. Lead with the Playbook, not the drawing surface

The current top-level Editor/Demo/Present/Print switch makes modes feel like separate products and puts a single open diagram ahead of season-long retrieval. The planned product needs stable top-level destinations for Playbooks, reusable football resources, shared publications, and recovery. Present and Print are actions or focused states of a Play, not peers of the Playbook.

### 2. Replace “Save” with explicit durability states

The primary Save button conflicts with continuous local commits and explicit named versions. The production design should continuously show `Saved on this device`, distinguish cloud catch-up, and reserve a deliberate action for `Create version`. Offline and conflict states must be equally calm and legible.

### 3. Make classification match the domain

The prototype's Pass/Run/RPO/Screen/Defense/Special category control mixes Unit and Play Type. The beta needs required Offense/Defense/Special Teams Unit, optional built-in or custom Play Type, optional Personnel Label, Concept, and flexible Tags without forcing hierarchy.

### 4. Give Chalk a recognizable system identity

The monochrome system is precise but generic. Large white areas, hairline borders, and tiny gray labels flatten navigation, field chrome, metadata, and system status into one plane. The production direction should remain quiet while adding a warm paper canvas, deep green brand ink, a high-visibility blue interaction color, a restrained signal palette, stronger type hierarchy, and a consistent elevation/radius system.

### 5. Raise small-control accessibility

Several controls and captions are visually below comfortable tablet size and contrast. Coarse-pointer hit-area work exists, but visible affordances should also communicate touchability. The beta system should use a 40 px compact control and 44 px touch target baseline, stronger muted text, persistent focus rings, and text labels for unfamiliar icons.

### 6. Expose the local-first trust model

Recovery banners and history exist, but device-local authority, cloud synchronization, pending changes, storage health, and conflict preservation are not a coherent visual system. These need one vocabulary and repeated placement across the Playbook and editor.

### 7. Separate authoring from immutable sharing

Present mode resembles a view of the current Play, while the plan requires an explicit sanitized Share Publication that changes only when republished. The design should show publication date/version, included Plays, stable-link state, and revoke/republish actions without suggesting live draft sharing.

### 8. Design the library for scale

The current library is embedded in the right inspector and cannot communicate thousands of Plays, cross-Playbook navigation, filters, local search, derived thumbnails, or Conflict Inbox state. The beta needs a dedicated metadata-first library surface.

### 9. Clarify responsive modes

The prototype is an effective large desktop canvas, but right-rail density and tiny controls do not yet establish the planned tablet editor or phone read-only contract. Responsive behavior should change information architecture, not merely shrink the desktop UI.

### 10. Keep implementation claims out of the visual prototype

The single-file artifact can demonstrate navigation and system states, but cannot prove IndexedDB durability, deterministic geometry, migration safety, Convex sync, privacy boundaries, export fidelity, or performance gates. Those remain production acceptance work.

## Design direction represented in the new prototype

The companion `Chalk Beta Design Prototype.html` explores a “quiet sideline instrument” direction:

- warm paper-like application surfaces rather than pure white everywhere;
- deep green brand ink grounded in the field, with cobalt reserved for selection and primary action;
- a dedicated Playbook home before the editor;
- persistent local/cloud state in plain language;
- a compact tool dock and context inspector with larger, labeled targets;
- immutable publication language in the Share flow;
- an inspectable design-system panel with tokens and component states;
- responsive tablet behavior and an intentionally read-only phone composition.

## Recommendation

Use the new HTML to decide visual character, density, navigation hierarchy, and component language. Continue using the existing Design Component as the detailed interaction oracle for drawing behaviors. Do not evolve either single-file prototype into the production implementation.
