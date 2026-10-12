@AGENTS.md

## Claude Code notes

- `AGENTS.md` is the single source of project context and standing rules (imported above). Edit it there, not here.
- Skills live in `.claude/skills/` and are read by both Claude Code and opencode:
  - `impeccable`: UI design review and refinement (`/impeccable <command> <target>`). Use for Angular screens and components.
  - `design-taste-frontend`: anti-slop rules for customer-facing pages only, not Admin or data-dense views.
- No browser automation (Playwright or similar) is set up and none should be added. Verify with `npx ng build` and targeted specs only.
