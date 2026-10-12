---
name: design-taste-frontend
description: Use when building or restyling customer-facing pages of the Angular app (Home, Interiors, Furniture catalogue, product details, Login, Register, Cart, marketing-style sections) so they do not look templated. Gives anti-slop rules for hero, layout, typography, color, imagery, copy and motion, adapted to Angular 19 and the project's CSS tokens. Do NOT use for Admin shell screens, tables, or data-dense workspace views (Dashboard, Products, Orders, Proposals, Rates, Leads, visualizer tools).
---

# Design taste for InteriorPlatform (Angular 19)

Adapted from Leonxlnx/taste-skill (MIT, Copyright (c) 2026 Leonxlnx; upstream commit 717446e). Rewritten for this repo's stack. Rules are contextual: read the brief, then apply only what fits.

## 0. Scope and precedence

- **Applies to:** customer-facing public pages and the customer parts of Cart, Orders, Account, Login and Register.
- **Does not apply to:** Admin shell views (`ADMIN_SHELL_VIEWS` in `src/app/app-paths.ts`), Field Staff Leads, the visualizer tools (floor plan, elevation, finishes) and any table or form-heavy workspace. Those are Operate surfaces: use the `impeccable` skill's `operate.md` guidance instead.
- **Project rules win.** `AGENTS.md` overrides this file: no new packages, no endpoints, no CORS or config changes, keep verification light, keep reports short.
- **Existing identity wins over taste.** The brand (Confident Group logo, `src/styles.css` tokens, warm stone palette, brown accent) is established. Refine inside it. Do not swap the palette, typeface or logo treatment unless the owner asks. The "banned palette" and "banned font" rules below apply only to a new visual world, which needs explicit approval.
- **If this skill and `impeccable` disagree, the stricter rule wins.** Example: eyebrows. Impeccable bans them on new work, so do not add new ones.

## 1. Read the brief first

Before editing, decide silently (state it in one line only if the user asked for a design read):

- page kind: landing/marketing section, catalogue/product, auth, cart/checkout, content page
- audience: homeowners and design-conscious buyers in the client demo, plus Confident Group staff
- vibe words the user used, plus any reference they gave
- what already exists (tokens, components, copy, images) and must be preserved

Ask at most one clarifying question, and only when the answer would change the design. Otherwise proceed.

### Dials (defaults for customer pages)

- `DESIGN_VARIANCE: 5` (1 symmetric, 10 chaotic). Offset layouts are fine, chaos is not.
- `MOTION_INTENSITY: 3` (1 static, 10 cinematic). Restrained reveals and hover feedback only.
- `VISUAL_DENSITY: 4` (1 gallery, 10 cockpit).

Raise or lower only on instruction ("more premium", "calmer"). Redesign-preserve: match the existing dials. Redesign-overhaul: +2 variance and motion at most.

## 2. Stack and conventions (hard rules for this repo)

- **Angular 19, standalone components, signals, built-in control flow (`@if`, `@for`).** Not React, not Next.js, not Tailwind. Never write JSX, `useState`, `"use client"` or Tailwind classes.
- **Styling:** component CSS files plus the global tokens in `src/styles.css` `:root` (`--bg`, `--surface`, `--surface-soft`, `--ink`, `--ink-2`, `--muted`, `--border`, `--border-soft`, `--accent`, `--accent-ink`, `--accent-soft`, `--success-*`, `--danger`, `--radius`, `--radius-sm`, `--shadow-sm`, `--font-sans`).
  - Use tokens. Do not hard-code a hex that duplicates a token. Add a new token to `:root` only when it is reused in more than one component.
  - Component style budget is 12 kB warning and 20 kB error per component. Keep new CSS lean.
- **Routing and views:** add or change pages in `src/app/app-paths.ts` first. Do not change route paths, nav labels, form field names or order without approval.
- **Dependencies:** never install a package (icon set, animation library, font package, UI kit) without asking. The rules below that name libraries (Motion, GSAP, Phosphor, shadcn, Radix, Tailwind) are intentionally not used here.
- **Motion:** CSS transitions and keyframes, plus the existing `RevealDirective` (`src/app/shared/reveal.directive.ts`: `<section reveal>`, `[revealDelay]="i * 70"`). It uses `IntersectionObserver`, and reveals instantly under `prefers-reduced-motion`. Reuse it. Do not add `@angular/animations`, GSAP or scroll libraries.
- **Scroll handling:** do not add new `window` scroll listeners or `HostListener('window:scroll')`. The public navbar already has one. Use `IntersectionObserver`, CSS `position: sticky`, or CSS scroll-driven animation instead. Never drive continuous values through a signal that re-renders the tree per frame.
- **Icons:** the app uses inline 16x16 SVG icons with `stroke="currentColor"` and a consistent stroke width (1.2 to 1.6). Match that family and reuse existing glyphs. Do not hand-draw new decorative illustrations, do not mix in emoji or Unicode glyphs as icons, and do not add an icon package without asking.
- **Fonts:** `--font-sans` is a system stack today. Changing the typeface is a brand decision: propose it and wait. If approved, self-host with `@font-face` and `font-display: swap`. Never load Google Fonts through a `<link>` tag in production.
- **Viewport:** use `min-height: 100dvh` for full-height hero blocks, never `100vh`. Use CSS Grid for multi-column layouts instead of percentage flex math.
- **Z-index:** use it only for systemic layers (sticky nav, drawers, modals). Do not scatter arbitrary values.

## 3. Typography

- Display: tight tracking, short headlines (8 words or fewer), max 2 lines on desktop. Body: 65ch maximum measure, comfortable leading, secondary text from `--ink-2` or `--muted`.
- Hierarchy comes from weight, size steps and color, not one oversized H1.
- Hero font size and image size are planned together. A 4-line hero headline is a font-size error.
- Serif fonts are not a default signal of "premium". Do not introduce one unless the owner names it. If it is justified, do not use Fraunces or Instrument Serif.
- Emphasis inside a headline uses weight or italic of the same family. Never inject a different family for one word.
- Italic display words with descenders (y g j p q) need leading of at least 1.1 and bottom space so descenders are not clipped.
- Body text is 16px on public pages where space allows. The app shell uses 14px; do not change the global body size.

## 4. Color

- One accent (`--accent`) used identically on the whole page. No new blue CTA in section 7 of a brown page.
- No pure `#000` or `#fff` text or backgrounds on new surfaces except where tokens already use them (`--surface` is white).
- No neon glows, no AI purple/blue gradients, no gradient text for large headings.
- Tint shadows toward the background hue (the tokens already do this). No heavy black drop shadows.
- One theme per page. No section that flips to an inverted theme mid-page unless it is a single deliberate full-width band.
- **New visual world only (needs approval):** avoid the default "warm cream + brass + oxblood + espresso" premium-consumer palette as a reflex. The current brand is already warm, so the job is refinement, not a new palette.

## 5. Layout rules for customer pages

- **Hero fits the first viewport:** headline max 2 lines, subtext max 20 words and 4 lines, primary CTA visible without scrolling, top padding not more than about 6rem on desktop.
- **Hero stack max 4 text elements:** optional small label, headline, subtext, CTAs (one primary, at most one secondary). No tagline under CTAs, no trust strip, no price teaser, no avatar row inside the hero.
- **Hero needs a real visual** (photo or rendered interior). Text plus gradient blob is a placeholder, not a hero.
- **Navigation on one line at desktop**, height 80px max. The existing `.pubnav` collapses on scroll; keep that behavior working.
- **Centered-everything is a smell.** Prefer split, left-aligned, or asymmetric compositions when variance is 5 or higher. Centered is fine for short confirmations and auth cards.
- **Cards only when elevation or grouping carries meaning.** Otherwise group with spacing, `border-top` or dividers. Never nest cards. Avoid the generic row of three identical icon-heading-text cards.
- **Section variety:** across a page with 6 or more sections use at least 3 different layout families. Do not stack more than two consecutive image-left/text-right zigzag sections. A grid has exactly as many cells as content, with no empty tile.
- **Section headers:** a headline, then body underneath it (65ch max). No split header with a small explainer floating at the far right. No tiny corner paragraph.
- **Eyebrows (small uppercase labels above headlines):** do not add new ones. If an existing page already has them, do not add more and consider removing any that carry no information.
- **Section numbering, scroll cues, version labels, status dots without meaning, decorative hairline grids, rotated vertical text, locale or time strips:** do not use.
- **Mobile collapse is explicit:** every multi-column layout declares its narrow fallback in the same component CSS. Check at 360px, 768px and 1280px. No horizontal overflow, touch targets at least 44px high.
- **Long lists (more than 5 items):** use grouped columns, a card grid with image, tabs or an accordion. Not a 10-row list with a hairline under every row.

## 6. Interactive states and forms

- Every control has default, hover, focus-visible, active, disabled, loading and error states. Keep the existing `:focus-visible` outline from `styles.css`.
- Loading uses skeletons shaped like the final layout, not a lone spinner. Empty states say what is missing and how to fill it. Errors are inline and name the problem and the fix.
- Tactile feedback on press: small `translateY(1px)` or `scale(.98)`, only on `:active`, transform and opacity only.
- Buttons: the label fits on one line at desktop (3 words max for primary CTAs), meets 4.5:1 contrast against its fill, and one intent has one label per page (do not offer "Get in touch" and "Contact us" together).
- Forms: label above the input, helper text optional, error text below the input, placeholder is never the label. Placeholder, helper and error text pass 4.5:1 against their background.
- One radius system per page: use `--radius` (8px) and `--radius-sm` (6px). Pills only where the page already uses them. Do not mix sharp and fully round shapes without a rule.

## 7. Imagery and assets

- Customer pages are visual. Use real interior and furniture photography that already exists in the repo or that the owner provides. Do not draw fake product screenshots from styled `div` boxes, and do not hand-roll decorative SVG scenes.
- If a real image is missing, leave a clearly labeled placeholder slot (an HTML comment with the intended size) and list the missing images at the end of the report. Do not hotlink random stock services into the demo without the owner's approval.
- Every `<img>` has meaningful `alt` text (decorative images use `alt=""`), explicit `width` and `height` or an `aspect-ratio` so layout does not shift, `loading="lazy"` below the fold, and `fetchpriority="high"` on the single hero image.
- No pills, tags or captions laid over photos as decoration. Use a plain caption below the image when a caption is needed. No fake photo credits.
- Logo or "trusted by" strips contain logos only. They sit below the hero. Do not invent client logos.

## 8. Copy

- Use real, specific, plain words. Banned filler verbs: elevate, seamless, unleash, next-gen, revolutionize.
- **No em-dash or en-dash as punctuation in new visible copy.** Use a comma, period, colon or a plain hyphen. Do not mass-edit existing copy unless asked.
- No invented "premium" micro-meta sentences under headings, no fake-precise numbers or stats (`99.99%`, `4.1x`) unless they come from real data or are labeled as sample data. Demo data must look realistic: no "John Doe", "Acme", "Lorem ipsum".
- Quotes are at most 3 lines and carry name plus role.
- Re-read every visible string before finishing. Rewrite anything grammatically odd, vague or cute-but-meaningless in plain language. Ask before changing factual claims, prices or business terms.
- WhatsApp is off until a business number is configured: do not add a visible WhatsApp CTA.

## 9. Motion

Motion must be motivated: hierarchy, sequence, feedback, or state change. If you cannot say what an animation communicates in one sentence, remove it.

- At `MOTION_INTENSITY` 3 (default): hover and focus transitions (150 to 250 ms, ease-out), one restrained entrance via `reveal` on key public sections, and nothing looping.
- Animate `transform` and `opacity` only. Do not animate `width`, `height`, `top` or `left`. Use `will-change` sparingly.
- Everything beyond a hover transition must collapse to static under `@media (prefers-reduced-motion: reduce)`. Keep that block next to the animation it disables.
- No parallax, scroll hijack, sticky card stacks, horizontal pan, marquees, magnetic cursors, custom cursors, or infinite decorative loops unless the owner asks. If one marquee is requested, it is the only one on the page.
- Layout must not depend on motion: content stays readable if the reveal never fires.

## 10. Performance and accessibility floor

- Initial bundle budget is 500 kB warning and 1 MB error. Do not add heavy assets or libraries for decoration.
- Keep images appropriately sized and compressed; do not commit multi-megabyte images. The two logo PNGs in `public/branding/` are already large: do not add more of that size.
- Contrast: body 4.5:1, large text 3:1, including text over images (use a scrim, not hope).
- Keyboard: visible focus, logical tab order, no focus trap outside real dialogs, semantic elements (`button` for actions, `a` for navigation).
- No custom mouse cursors. No autoplay audio or video.
- Dark mode is not a current feature of this app. Do not add a dark theme as a side effect; ask first.

## 11. Redesign protocol

1. **Detect mode:** extend an existing page, preserve-and-modernize, or approved overhaul. Ask once if unclear.
2. **Audit before touching:** read the component `.ts`, `.html`, `.css` and its spec. Note tokens in use, copy voice, image sources, existing tests and anything routed through `app-paths.ts`.
3. **Order of levers** (stop when the brief is satisfied): typography use, spacing and rhythm, color recalibration within tokens, motion layer via `reveal`, hero and key-section recomposition, full block replacement as a last resort.
4. **Never change silently:** route paths, nav labels, form fields, logo, legal or consent text, payment copy, prices, pricing logic, or Admin behavior.
5. **Preserve working behavior** and existing specs. Update a spec only when the change makes it genuinely wrong, and say so.

## 12. Verification (keep it light)

- Compile check: `npx ng build` in `Frontend/interior-platform` when a build is needed. Known warnings (NG0913 logo, bundle budgets) are not new.
- Run only the specs touching the change, for example `npx ng test --watch=false --browsers=ChromeHeadless --include=src/app/<path>/**/*.spec.ts`. No full-suite runs unless asked.
- Browser checks only when needed, one process at a time (machine is low on memory). Label stubbed or forged-token checks as simulated. Do not claim end-to-end verification that was not done.
- Report briefly: what changed, what was verified, what was not.

## 13. Final pre-flight checklist

Tick each honestly before reporting done. Skip items that do not apply to the surface.

- [ ] Uses `styles.css` tokens; no duplicated hex values; radius system consistent
- [ ] One accent, one theme, no AI-purple gradients, no gradient text, no neon glow
- [ ] Hero fits the viewport, max 4 text elements, real visual, no scroll cue
- [ ] No new eyebrows, section numbers, status dots, version labels, decorative strips
- [ ] No three-equal-feature-cards default, no nested cards, no empty grid cells
- [ ] Section layouts vary; no more than two consecutive zigzag sections
- [ ] Nav stays on one line at desktop; narrow layout verified at 360px and 768px
- [ ] Buttons fit on one line, pass contrast, and each intent has one label
- [ ] Form labels above inputs, errors below, placeholder never used as label
- [ ] Loading, empty and error states exist where data loads
- [ ] Images have alt, dimensions or aspect ratio, correct loading hints; no fake screenshots
- [ ] Copy reread: no em-dash or en-dash punctuation, no filler verbs, no fake stats
- [ ] Motion is motivated, transform and opacity only, reduced-motion honored, no new scroll listeners
- [ ] No new package, font, endpoint, CORS or config change; route paths and labels unchanged
- [ ] Build or targeted specs run (or clearly stated as not run)
