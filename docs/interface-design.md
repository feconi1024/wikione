# Interface design

WikiOne uses flat surfaces, thin borders, and a single blue action accent.
There are no gradient backgrounds, textured backgrounds, or decorative shadows.
White is the light-theme canvas; charcoal is the dark-theme canvas. Green,
amber, and red are reserved for semantic feedback and source syntax.

## Layout

The top bar contains the brand, editor/connections/privacy navigation,
appearance selection, and account controls. The separate document bar contains
the target wiki, page title, loading action, and primary review action.

The editor keeps its outline, markup toolbar, source, live preview, and status
bars. Desktop panes remain resizable by pointer or keyboard. At 820 CSS pixels
and below, Source/Preview buttons switch the visible pane. Page controls reflow
again at 520 pixels to support a 320-pixel viewport without horizontal page
scrolling. Settings and dialogs share the same surface and feedback tokens.

## Appearance

The Appearance selector provides System, Light, and Dark. System is the default
and responds to operating-system appearance changes. An explicit selection is
saved as `wikione.appearance` in localStorage; it contains only the preference,
never page source or account information. When storage is unavailable, the
selection remains usable for the current session.

`apps/web/src/appearance.ts` manages the preference and the root `data-theme`
attribute. `apps/web/src/styles.css` defines semantic tokens for surfaces,
text, borders, controls, and feedback. The CodeMirror extension consumes the
same tokens for syntax, caret, active lines, selections, and autocomplete.
New first-party components should use those tokens instead of literal colors.

The isolated compiled page keeps the target wiki's styles and light color
scheme. Theme selection does not recolor articles, invert images, reload the
preview, or alter the source submitted to the parser.

## Verification

The browser suite covers preference persistence, system changes, restricted
storage, dark-mode axe checks, editing, draft recovery, account/review flows,
forced colors, and narrow-screen reflow. Visual baselines cover both desktop
and mobile Chromium, including dark editor, sign-in, and review dialogs.

```sh
pnpm test:e2e
pnpm test:a11y
pnpm test:visual
```

Visual fixtures mock API and preview responses for deterministic checks; they
do not claim to verify live Wikipedia rendering or enable Wikimedia publishing.
