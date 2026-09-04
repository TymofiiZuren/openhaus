# OpenHaus interaction and motion refinement

Keep the editorial typography, quiet surfaces and fine underlines. Motion should clarify actions, never delay access to listings.

## Shape and motion: editorial structure, softer controls

Keep large property media, grids and section divisions square. Use 8px corners for utility controls, 16px for floating panels and the manager login card, and pill/circular shapes for the appearance trigger and dialog close controls. Avoid rounding every container. The appearance trigger has no arrow; its icon, label, hover tint and expanded state communicate interaction.

Appearance options use a soft selected tint plus the existing underline and check. Floating appearance and utility panels fade in over 180ms without travelling; hover surfaces crossfade over 140–180ms. Preserve light/dark semantic colours and keyboard focus. Shape changes are static, not animated.

Keep text, cards, images and controls stationary on hover, press and appearance changes. No bounce, shake, lift, zoom, slide or overshoot. Use 140–220ms colour, opacity and underline fades only. Do not animate size, spacing or weight. Static positioning transforms (map pins, gallery arrows), functional map navigation, disclosure state indicators and loading spinners are not decorative movement and must not be globally disabled.

The appearance label reserves a fixed-width slot and the document reserves scrollbar space to reduce sideways nudges. Media previews use a mild brightness change without zoom; map popups no longer increase their shadow on hover. Keyboard focus and reduced-motion support remain mandatory.

## Implemented in this pass

- Google cooperative gesture handling owns the scroll hint and zoom distinction: normal scrolling moves the page and displays Google's tinted modifier-key guidance; Ctrl/Command-scroll intentionally zooms. Supported trackpad pinch and touchscreen two-finger gestures remain handled by Google. Do not override `scrollwheel` to false or guess hardware from wheel speed. Explicit zoom controls remain available; double-click zoom is disabled. Physical trackpad/browser combinations still require manual QA.
- Manager overview uses uncropped landscape photographs, with an honest photography-needed state instead of concept placeholders. Video upload retains the accessible native file input beneath a styled picker, shows the filename, and explains supported formats and upload steps.

- Property chapters now combine redundant overview/media destinations, hide the tour link without a hosted panorama, open the viewing form directly, and deep-link to the selected property on the map. Notes are labelled accurately. Sticky-header scroll clearance is reserved.
- Location panel is content-sized with viewport-limited scrolling, inset search/options, softer selection tint and mobile control clearance. Hidden panels use visibility as well as opacity so their controls are not keyboard-focusable.
- Selecting a sidebar home closes the location chooser and requests the camera again, including when the same home is selected after panning. Listing surfaces receive restrained corners, comfortable text padding and colour fades. Property summary and notes form use short opacity-only entrances.

## Client account follow-up (not implemented)

No client profile route or client authentication exists in the current frontend. Design and build a real account flow before adding a profile navbar link: sign-in/session handling, profile data, saved homes and viewing history, loading/error/empty states and accessible focus management. Apply the same stationary fades to the completed profile; do not present local property notes as an authenticated account.

- County selection now fits its actual boundary to the map viewport (64px desktop / 48px compact padding), replacing coarse zoom thresholds and the Cork exception. Local-area selection retains its own closer fit.
- County/area styles share the same initial and mouseout definitions. Selected counties use a 3px charcoal outline with a very light fill; selected areas use a 2px clay outline and restrained tint. Hover changes emphasis without changing border weight.
- Location and back controls now share selective rounded corners, warm hover surfaces and fine text underlines. The map helper caption is borderless with a quiet shadow.

- Removed the branded page-loading interstitial and its preparing message. Lazy loading and error recovery remain; loading is labelled for assistive technology.
- Replaced the cycling appearance button with a compact, borderless chooser: Light / Warm daylight, Dark / After hours, System / Follow device. The selected mode is underlined and checked. Selection saves immediately, closes the panel and restores focus; Escape, outside click and tabbing away dismiss it. Device and cross-tab synchronization remain supported.
- Added an 180ms opacity-only fade to the appearance panel and a 220ms icon fade. Removed the disclosure arrow. No whole-page animation or delay when switching themes.
- Added 180ms underline reveals to property section links on hover and keyboard focus, keeping their text stationary.
- Added a short icon transition, underline hover feedback and shared button color/press feedback without shifting layout.
- Reduced-motion preferences disable decorative transitions and animation across the application.

## Next implementation passes

1. Navigation: hover/focus underline implemented. Next, add a scroll-aware active-section indicator with anchor and browser-history tests; do not animate the entire navbar.
2. Property cards: use a mild 180ms colour or brightness hover treatment, never zoom. Keep prices and text still; provide equivalent focus feedback.
3. Dialogs and map previews: opacity-only fade over 220ms; exit in 140ms. No translation or scale. Preserve pin anchoring, Escape dismissal, focus return and mobile clearance.
4. Gallery and panorama: crossfade poster-to-viewer only after ready. Keep an accessible loading state, retry action and full-screen access. Never auto-spin panoramas.
5. Manager actions: show local saving/saved/error feedback beside the triggering button. Prevent duplicate submissions; do not replace the workspace with a loader.

## Acceptance checks for every pass

- Keyboard and touch work without hover; targets are at least 44px.
- Check light, dark and System appearance, including persisted preferences.
- Check small-screen navigation and 200% zoom without clipping.
- Reduced motion retains all state feedback without movement.
- No artificial wait, flashing backgrounds, layout shifts or continuous decorative motion.
- Test existing behaviour before adding animation; do not change map or panorama state just for visual effects.

Remaining passes are planned, not yet implemented or visually verified.
