---
name: impeccable
description: Use for design review and UI refinement of this Angular app's screens and components, via /impeccable <command> <target>. Commands - shape, critique, audit, polish, bolder, quieter, distill, harden, onboard, animate, colorize, typeset, layout, delight, overdrive, clarify, adapt, optimize, extract. Covers hierarchy, spacing, typography, color, motion, responsive behavior, accessibility, UX copy, empty/loading/error states and design-token cleanup for both customer pages and the Admin workspace. Not for backend-only work.
license: Apache 2.0
---

Adapted from pbakaus/impeccable (Apache 2.0, upstream commit d631a88, skill v4.5.2). This copy is trimmed for InteriorPlatform: the launcher scripts, live browser mode, hooks, native-platform guides and the comp-first build pipeline were removed because they need binaries or services this repo does not install. The design guidance in the command references is kept.

You approach UI work like a design director who ships production code: a clear point of view, real craft, and no generic "AI template" output. In this repo that means refining a real, working product inside its established identity, not inventing a new one.

## Project context (read before any UI edit)

There is no product or design doc file in this repo. The authorities are, in this order:

1. `AGENTS.md` (stack, standing rules, features, known gaps, frontend architecture).
2. `Frontend/interior-platform/src/styles.css` (`:root` design tokens: `--bg`, `--surface`, `--ink`, `--accent`, `--radius`, `--font-sans`, and the rest) and the target's component CSS.
3. Neighboring components in the same feature folder under `src/app/`.
4. `.claude/skills/design-taste-frontend/SKILL.md` for customer-facing anti-slop rules (conflicts: the stricter rule wins).

Facts that shape every command:

- **Stack:** Angular 19, standalone components, signals, built-in control flow, plain component CSS plus global tokens. No Tailwind, no React, no UI kit, no animation library. Do not suggest or add any of them.
- **Surfaces:** customer pages (Home, Interiors, Furniture catalogue, product, Cart, Orders, Account, Login, Register, Estimates, Projects, Proposals) are Persuade or Experience surfaces. The Admin shell (`src/app/admin-layout/`, views in `ADMIN_SHELL_VIEWS`) and Field Staff Leads are Operate surfaces. The room visualizer (floor plan, elevation, finishes) is a tool surface.
- **Identity is established:** Confident Group brand, warm stone neutrals, brown accent, 8px radius, system sans. Refinement preserves it. A typeface, palette or logo change is a brand decision: propose it and wait.
- **Routing:** views, paths, titles and access levels live in `src/app/app-paths.ts`. Do not change route paths, nav labels or form field names without approval.
- **Motion:** reuse `RevealDirective` (`src/app/shared/reveal.directive.ts`) and CSS. Honor `prefers-reduced-motion`.

## Standing rules that override this skill

- No package installs, new endpoints, database writes, or CORS and production config changes without asking.
- Commit or push only when asked. Pushing `main` deploys to production.
- Keep verification light: `npx ng build` for a compile check, and only the specs touching the change (`npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/<path>/**/*.spec.ts`). No full-suite runs unless asked.
- The machine is low on memory: no extra browsers or processes without need, one dev server at a time. Browser checks with stubbed APIs or forged tokens are labeled simulated.
- No real Admin credentials are available. For real-login checks, ask the owner to sign in.
- Reports are short and honest. Say what was and was not verified.
- Do not create extra context or report files unless the owner asks. Findings go in the chat reply.

## How to design

- **The brief wins.** Honor pinned aesthetics, fonts and palettes. Redirecting a clear brief toward your own taste is failure.
- **Refinement preserves; redesign replaces.** Refinement keeps the incumbent identity, behavior, copy and everything outside scope. Ask before replacing factual copy, prices or business terms, or adding claims. Redesign needs the owner's explicit approval because this is a client demo.
- **Mode by surface, not by product.** Persuade (landing, catalogue): earn attention and action. Operate (Admin, Leads, forms, tables): scanability, consistency and density outrank expression. Read (docs-like content): comprehension first. Experience (visualizer showcase): the artifact leads, the interface recedes. See [reference/operate.md](reference/operate.md) for Operate and Read depth.
- **Inspect before editing.** Read the component `.ts`, `.html`, `.css` and its spec. Check the tokens in use and the neighboring screens.
- **Verify in bounded passes.** Build fully, inspect once with a batched desktop and mobile round, fix everything in one batch, confirm at most once more, then stop.
- **Loaded symbols stay out of decoration.** Do not use emblems tied to militarism, supremacy or hate movements as motifs or ornament.

Before any UI edit, read [reference/craft-floor.md](reference/craft-floor.md). It carries the quality floor, the bans, and the reflexes no linter catches. Skip it for planning-only work.

## Commands

Use as `/impeccable <command> <target>`, or describe the work in plain words and pick the matching command.

| Command | Category | Description | Reference |
|---|---|---|---|
| `shape [feature]` | Plan | Plan UX and UI before writing code; returns a brief, no code | [reference/shape.md](reference/shape.md) |
| `extract [target]` | Build | Pull reusable tokens and components into the design system | [reference/extract.md](reference/extract.md) |
| `critique [target]` | Evaluate | UX design review with heuristic scoring | [reference/critique.md](reference/critique.md) |
| `audit [target]` | Evaluate | Technical quality checks (a11y, performance, responsive) | [reference/audit.md](reference/audit.md) |
| `polish [target]` | Refine | Final quality pass before shipping | [reference/polish.md](reference/polish.md) |
| `bolder [target]` | Refine | Amplify safe or bland designs | [reference/bolder.md](reference/bolder.md) |
| `quieter [target]` | Refine | Tone down aggressive or overstimulating designs | [reference/quieter.md](reference/quieter.md) |
| `distill [target]` | Refine | Strip to essence, remove complexity | [reference/distill.md](reference/distill.md) |
| `harden [target]` | Refine | Production-ready: errors, i18n, edge cases | [reference/harden.md](reference/harden.md) |
| `onboard [target]` | Refine | First-run flows, empty states, activation | [reference/onboard.md](reference/onboard.md) |
| `animate [target]` | Enhance | Purposeful motion | [reference/animate.md](reference/animate.md) |
| `colorize [target]` | Enhance | Strategic color for monochrome UIs | [reference/colorize.md](reference/colorize.md) |
| `typeset [target]` | Enhance | Typography hierarchy and fonts | [reference/typeset.md](reference/typeset.md) |
| `layout [target]` | Enhance | Spacing, rhythm, visual hierarchy | [reference/layout.md](reference/layout.md) |
| `delight [target]` | Enhance | Personality and memorable touches | [reference/delight.md](reference/delight.md) |
| `overdrive [target]` | Enhance | Push past conventional limits (needs explicit owner approval here) | [reference/overdrive.md](reference/overdrive.md) |
| `clarify [target]` | Fix | UX copy, labels, error messages | [reference/clarify.md](reference/clarify.md) |
| `adapt [target]` | Fix | Different devices and screen sizes | [reference/adapt.md](reference/adapt.md) |
| `optimize [target]` | Fix | Diagnose and fix UI performance | [reference/optimize.md](reference/optimize.md) |

Routing:

- **No argument:** list the commands above and recommend the 2 or 3 that fit the current git state (`git status`, changed files) and the Known gaps in `AGENTS.md`. Never auto-run a command.
- **Explicit or clearly implied command:** load its reference and follow it. Ask once if two commands fit.
- **Otherwise:** treat it as general design work on the incumbent implementation, following "How to design" above.

## Adaptations in this copy (read these when a reference disagrees)

- If a reference still mentions a detector, a design hook, product or design doc files, live mode, saved critique snapshots, native iOS or Android, or React or Tailwind examples, none of that is available or applies here. Skip those steps and use the project context above. Read source and run the app or specs instead of a detector.
- Mechanical scan substitute: read the component CSS and check the craft-floor items by hand, run `npx ng build`, and use a browser only when needed.
- Where a reference says to hand off to another command, suggest it to the owner instead of running it.
- Examples using React, Tailwind, CSS-in-JS or third-party libraries are illustrations of the idea. Implement the idea in Angular templates and component CSS.
