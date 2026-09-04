# OpenHaus Design System — Quiet Precision

## Product context

- **What this is:** A property decision workspace that keeps location, photography, plans, tours, comparison and buyer actions together.
- **Who it is for:** Irish home buyers, sellers and property managers who need confidence before a physical viewing.
- **Product type:** Public marketplace with buyer and manager workspaces.
- **Memorable idea:** **The complete picture before the viewing.**

## Design vision

OpenHaus should feel like a precise property instrument rather than a conventional portal. The opening experience establishes speed and trust through a live discovery desk; listing photography carries emotion only after the buyer enters the catalogue. Fine rules, exact alignment and quiet typography carry trust. Controls are obvious without looking heavy.

The visual system borrows two useful ideas from the user’s references: the direct product storytelling and sectional pacing of Autonomous, and the dense but predictable navigation hierarchy of BingX. It does not borrow their product-specific decoration.

### Principles

1. **Search first, property media in context.** The homepage opens with live discovery controls; photography becomes primary inside listings and galleries.
2. **One structure everywhere.** Public, buyer and manager pages share the same tokens, header rhythm and interaction states.
3. **Motion explains change.** Animate state transitions, panels and media responses only. Never animate decoration.
4. **Fast by construction.** Avoid decorative gradients, masks, backdrop blur, scroll-jacking and autoplay media.
5. **Calm density.** Information is compact enough to compare but never crowded.

## Aesthetic direction

- **Direction:** Dark architectural editorial.
- **Decoration:** Minimal and structural.
- **Layout:** Hybrid. Editorial compositions for discovery; strict grids for search, comparison and management.
- **Geometry:** Homepage navigation, search and data bands are rectangular. Listing cards may use 6px controls, 14px panels and 20px media frames. Pills are reserved for status or compact binary choices.
- **Borders:** One-pixel mineral rules establish hierarchy. Shadows are rare and shallow.
- **Reference sites:** https://www.autonomous.ai/computer-2 and https://bingx.com/en

## Typography

- **Display:** Newsreader, 300–500, for editorial headlines and property names.
- **Body and UI:** DM Sans, 300–600, for controls, forms and descriptions.
- **Data:** Fragment Mono for compact labels, indexes, prices and status metadata.
- **Loading:** Google Fonts with `display=swap`; keep local fallbacks and never hide content while fonts load.
- **Measure:** Body text should stay between 45 and 72 characters where practical.

### Scale

- Display: `clamp(3.25rem, 6vw, 6.25rem)`
- H1: `clamp(2.5rem, 5vw, 4.75rem)`
- H2: `clamp(2rem, 3.5vw, 3.5rem)`
- H3: `clamp(1.35rem, 2vw, 2rem)`
- Body large: `1.125rem / 1.6`
- Body: `1rem / 1.6`
- Metadata: `0.6875rem / 1.2`, uppercase with restrained tracking

## Colour

Colour is restrained: mineral-black surfaces, warm off-white text and one copper action colour.

### Dark mode — default

- Canvas: `#080b0a`
- Header: `#0b0f0d`
- Surface: `#111614`
- Raised surface: `#151b18`
- Control: `#1a211e`
- Primary text: `#f1eee8`
- Secondary text: `#b9c0bc`
- Border: `#2d3531`
- Strong border: `#68736d`
- Accent: `#e4a28b`
- Success: `#9bd1b2`
- Danger: `#ffb2a3`

### Light mode

- Canvas: `#f1efe9`
- Header: `#f8f7f3`
- Surface: `#fbfaf7`
- Raised surface: `#ffffff`
- Control: `#f4f3ee`
- Primary text: `#202825`
- Secondary text: `#626d68`
- Border: `#d2d6d0`
- Strong border: `#8e9993`
- Accent: `#c9755b`
- Success: `#287252`
- Danger: `#a53b32`

## Spacing and layout

- **Base unit:** 4px.
- **Scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Page width:** 1480px maximum with 24px desktop gutters and 16px mobile gutters.
- **Desktop grid:** 12 columns.
- **Tablet grid:** 8 columns.
- **Mobile grid:** 4 columns; no nested horizontal scrolling.
- **Touch targets:** 44px minimum.

## Motion

- **Instant feedback:** 90ms.
- **Controls:** 140ms.
- **Panels:** 220ms enter, 150ms exit.
- **Editorial reveal:** 360ms maximum and only once per view.
- **Easing:** enter `cubic-bezier(.16,1,.3,1)`; exit `cubic-bezier(.4,0,1,1)`.
- Animate only `opacity` and `transform`. Colour and border transitions are allowed for controls.
- Motion never blocks input and never owns application state.
- `prefers-reduced-motion: reduce` renders every element immediately in its final state.

## Component rules

- Primary actions use the copper accent and dark text.
- Secondary actions use a one-pixel strong border and transparent background.
- Text links use a single underline on hover or current state; never stacked borders and underlines.
- Panels use the raised surface and a fine border. Avoid glass, blur and floating glow.
- Gallery controls use large transparent hit areas with tall, thin SVG arrows.
- Empty and error states use real content structure, not decorative patterns.

## Performance budgets

- No autoplay video on the landing page.
- No backdrop blur, decorative filter blur, masks or animated gradients.
- Below-the-fold sections use `content-visibility: auto` with stable intrinsic sizing.
- Images reserve their aspect ratio and use WebP or AVIF where available.
- Route-level modules remain lazy-loaded.
- New production dependencies require a measured improvement and explicit approval.
- Target: no long animation task over 16ms and no layout shift caused by motion.

## Technology direction

Keep the current React 19, TypeScript and Vite frontend; Go API; PostgreSQL/PostGIS database; and C++ media processing pipeline. These are appropriate for the product. Upgrade only when profiling proves a bottleneck:

- Add list virtualisation only when catalogue results exceed 100 rendered cards.
- Move geographic simplification or media transforms to workers when profiling shows main-thread cost.
- Add a CDN/object store for production media rather than changing the primary database.
- Scale PostgreSQL with spatial indexes, read replicas and connection pooling before considering another database.

## Decisions

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-09-04 | Replace the legacy visual layer with Quiet Precision | Creates one coherent language across public, buyer and manager areas. |
| 2026-09-04 | Keep the current application stack | No evidence supports a framework or database rewrite. |
| 2026-09-04 | Remove decorative blur, gradients and masks | They add paint cost without helping buyers understand a property. |
| 2026-09-04 | Use restrained functional motion | Preserves responsiveness while making state changes feel intentional. |
| 2026-09-04 | Replace the homepage residence image with a live discovery desk | Makes the opening product-led, information-rich and visually closer to the requested rigid reference. |
| 2026-09-04 | Keep buyer and manager entry points mutually exclusive in the interface | Prevents role confusion while preserving server-side authorization on every manager route. |
