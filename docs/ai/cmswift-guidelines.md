# CMSwift Guidelines

Purpose: project-specific CMSwift usage rules.
Read when: building or changing UI.
Do not read when: only editing runtime logic without UI.
Last updated: 2026-06-11.

## Framework Identity

CMSwift is the primary UI framework.
The project often uses the global alias `_`; follow existing local style.

## Use CMSwift For

- `_.Dialog`
- `_.Toolbar`
- `_.Grid`, `_.Row`, `_.Col`
- `_.Btn`, `_.Icon`
- `_.Input`, `_.Search`, `_.Select`, `_.Toggle`
- `_.Tabs`
- `_.Table`
- cards/panels where repeated item UI is needed

## Keep Custom Only For

- Flow Map canvas
- node cards and ports
- connection SVG/path layers
- live pulse/animation layers
- highly specific runtime visuals

## UI Constraints

- Avoid adding a second design system.
- Do not create in-app explanatory text for obvious controls.
- Use icon buttons for common actions.
- Keep operational tools dense and scannable.
- Do not nest cards inside cards.
- Keep text from overflowing buttons/panels.
