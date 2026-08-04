---
status: accepted
---

# Build the responsive application shell with Tailwind and shadcn Base UI

Chalk uses Tailwind CSS through its Vite plugin and repository-owned shadcn/ui components built on Base UI primitives. Chalk owns its tokens and editor-specific controls, while accessible primitives cover standard application interactions.

## Consequences

- Tailwind CSS 4 provides build-time utilities through the first-party Vite plugin with no styling runtime.
- shadcn/ui Base UI source lives in the repository and may be adapted to Chalk's interaction and accessibility requirements.
- Lucide supplies the baseline icon set, with text labels or tooltips for unfamiliar actions.
- Chalk defines semantic CSS-variable tokens for color, typography, spacing, radius, elevation, focus, field presentation, and print.
- The app supports light, dark, and high-contrast outdoor themes plus reduced-motion preferences.
- The application shell uses system fonts; deterministic exports package and version the fonts required for exact metrics.
- Editor controls consume the same tokens but are purpose-built rather than forced through generic form components.
- No general-purpose animation library runs on the editor playback or pointer frame path.
- Desktop and iPad landscape use a Playbook navigator, central field, inspector, and bottom timeline.
- iPad portrait prioritizes the field and moves secondary controls into collapsible drawers and bottom sheets.
- Phone layouts remain read-only and provide presentation, playback, search, and export.
- Visible focus states, keyboard operation, reduced motion, and WCAG 2.2 AA contrast are release requirements.

