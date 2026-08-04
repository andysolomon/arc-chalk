---
status: accepted
---

# Model diagrammed Players as football roles

Every Player drawn in a Play represents a football role rather than a rostered athlete. This keeps the beta centered on durable coaching knowledge and lets Formations, assignments, position sheets, and exports share stable role identity without requiring roster management.

## Consequences

- Each Player has a stable Play-local identifier, Coach-facing role label, Unit, position group, symbol style, and starting yard coordinates.
- A Player may have an optional jersey number or short display label, but Chalk does not maintain athlete profiles or a roster database in beta.
- Assignments and movement paths reference the stable Player identifier rather than a mutable label or array position.
- Applying a Formation copies its role slots into the Play and retains source Formation and slot references for explicit previewed reapplication.
- Moving, relabeling, or restyling a Player does not change its identity or disconnect its assignments.
- Position-oriented outputs group Players using position-group metadata while showing the Coach's role labels.

