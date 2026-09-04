# OpenHaus Design System

## Product direction

OpenHaus is a property decision workspace for Irish buyers and property professionals. It should feel calm, exact and high-end: editorial property photography paired with the precision of a professional information product.

The memorable idea is **the complete picture before the viewing**. Photography leads; location, plans, tours, comparison and buyer notes form one connected workspace.

## Visual language

- Dark by default, using near-black green neutrals rather than pure black.
- Warm photography is the primary atmospheric element. Do not use decorative gradients, background blur or floating glow effects.
- Fine one-pixel mineral borders establish structure.
- Rounded geometry is hierarchical: 10px controls, 22px panels and 26px feature frames. Do not make every small list row or text link pill-shaped.
- Peach is reserved for selection, primary actions and short emphasis. It is not a general background colour.
- Use transparent, generous hit areas around gallery arrows. The chevron itself is tall and light; never place it on a large dark slab.

## Typography

- Display: Newsreader, 300–500. Use for the wordmark, editorial headlines and property names.
- Body and UI: DM Sans, 300–600. Use for forms, descriptions, actions and navigation.
- Data labels: Fragment Mono. Use sparingly for compact uppercase metadata, indexes and status labels.
- Body copy is at least 16px on narrow screens with 1.5–1.7 line height.

## Colour tokens

Dark palette:

- Canvas `#080b0a`
- Header `#0c100e`
- Surface `#111614`
- Raised surface `#121815`
- Control `#171d1a`
- Text `#f0ede7`
- Muted text `#b5bcb7`
- Border `#29312d`
- Strong border `#65716b`
- Accent `#e4a28b`

Light palette:

- Canvas `#f2f0eb`
- Surface `#fbfaf7`
- Text `#202825`
- Muted text `#68716d`
- Border `#d1d4ce`
- Accent `#c9755b`

## Layout

- Maximum content width: 1480px with 24px desktop gutters.
- Homepage: split editorial feature with property photography beside search and product proof.
- Property page: side-by-side gallery and decision summary on wide screens; linear document flow on tablet and mobile.
- Supporting pages: restrained two-column layouts with one obvious primary action.
- Mobile layouts must not introduce nested horizontal scrolling.

## Motion and interaction

- Motion is functional and typically 120–180ms.
- Use colour, border and opacity transitions only; avoid layout-shifting transforms.
- Theme changes use one synchronized crossfade and respect `prefers-reduced-motion`.
- Every pointer target is at least 44px; icon visuals may be smaller inside a larger transparent hit area.
- Hover may enhance a control but never be the only way to operate it.

## Accessibility and performance

- Maintain WCAG AA text contrast.
- Preserve visible focus, semantic headings and keyboard alternatives.
- Use WebP imagery with explicit layout dimensions or aspect ratios.
- Load below-the-fold features and large geographic data lazily.
- Do not autoplay decorative media.

## Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-09-04 | Dark editorial workspace | Matches the user’s references and makes property photography the focus. |
| 2026-09-04 | Static split hero | Removes autoplay cost and distinguishes the product from a generic video landing page. |
| 2026-09-04 | DM Sans with Newsreader | Combines operational clarity with a distinct property-editorial voice. |
| 2026-09-04 | No decorative gradients or blur | Those effects were rejected by the user and caused perceived lag. |
