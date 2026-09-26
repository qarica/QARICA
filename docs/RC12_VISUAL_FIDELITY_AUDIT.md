# RC12 Visual Fidelity Audit

## Locked visual baseline
QARICA uses one light enterprise healthcare language across QLCL and EMR: light blue-gray application background, white navigation/surfaces, navy hierarchy, restrained medical blue primary actions, semantic status colors, soft borders/shadows, compact information density, and responsive layouts.

## Changes in RC12
- Normalized app background, content width and spacing.
- Reduced sidebar width/density and aligned navigation hierarchy to the approved light mockup.
- Normalized topbar height, borders and shadows.
- Unified panel/KPI radius, border and elevation.
- Unified table headers/hover treatment and primary/secondary button treatment.
- Updated browser theme color to the light application surface.
- Preserved all EMR command/control logic, RBAC, tenant isolation and release gates.

## Release principle
Visual changes must not introduce synthetic KPI data or a second business-data source. Dashboard cards remain derived from module/source data.

## Remaining runtime gate
Static visual/source audit is complete. Full dependency install, lint, tests and production build still require CI/runtime verification before production sign-off.
