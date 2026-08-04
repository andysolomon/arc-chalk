---
status: accepted
---

# Present Plays through versioned customizable Field Profiles

Chalk separates canonical Play geometry from the rules and markings of the field on which it is presented. A Playbook selects a default Field Profile from built-in or custom definitions, while an individual Play may override presentation without rewriting its coordinates.

## Consequences

- Beta includes built-in NFHS/high-school, NCAA, and NFL Field Profiles.
- Coaches may create custom profiles for youth, reduced-player, local, or practice-field layouts.
- A Field Profile defines field width, hash locations, end-zone depth, goalpost placement, yard-line spacing, number marks, and snapping landmarks.
- Applying or selecting a profile never changes canonical yard coordinates, paths, Assignments, or animation timing.
- Built-in parameters are copied with a profile version so an application update cannot silently alter an existing Playbook's diagrams or exports.
- Each Playbook has a default Field Profile, and a Play may select an explicit presentation override.
- Eleven-player football is the initial default but not a save-time constraint.
- Coaches may diagram any Player count for 7-on-7, 8-man, 9-man, drills, scout looks, and partial installation views.
- An unusual Player count may produce an optional dismissible warning but never blocks saving, animation, sharing, or export.

