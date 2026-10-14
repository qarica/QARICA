# Brain Workspace V2 — Implementation contract

Status: approved; implementation branch opened.

## Product
- Brain is a first-class top-level workspace, accessible from the main sidebar.
- Desktop canvas occupies available width; optional right inspector and collapsible navigation.
- Mobile uses a full-width canvas with an inspector drawer.
- Toolbar: search, fit view, zoom, focus mode, filters.
- Node interactions: select, inspect, navigate to linked records, and edit through existing authorized flows.

## Integration requirements
1. Locate the existing Brain route, component, state, queries, and persistence layer before replacing any UI.
2. Reuse the existing source of truth for nodes and edges; do not introduce localStorage as a replacement.
3. Preserve IDs, relationships, permissions, and archive behavior.
4. Add a direct sidebar link; keep legacy Brain links working via redirects or compatible navigation.
5. Provide loading, empty, error, and large-graph states.
6. Keep keyboard navigation and touch pan/zoom usable.

## Acceptance criteria
- Brain accessible in one click from the main navigation.
- Canvas fills the page, with a collapsible inspector.
- Existing notes and connections appear unchanged after rollout.
- Archived content follows existing visibility and retrieval rules.
- No destructive database migration.
- Build, lint, tests, and responsive QA pass before merge to main.

## Release
Feature branch -> code review and verification -> main -> deployment verification.
