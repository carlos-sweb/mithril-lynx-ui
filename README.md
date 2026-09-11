# mithril-lynx-ui

Components for [mithril-lynx](https://github.com/carlos-sweb/mithril-lynx) apps, built to match
[`@lynx-js/lynx-ui`](https://github.com/lynx-family/lynx-ui) — same behaviour, same class contract, same
Luna theme tokens, so a screen looks and feels the same whether it was written in ReactLynx or Mithril.

lynx-ui is React-only (a hard `peerDependency` on `@lynx-js/react`). This package is not a wrapper around
it: components are re-implemented for Mithril's own component model, against the same underlying native
Lynx elements.

## Install

```sh
npm install mithril-lynx-ui
```

Then add one line to the `style.css` that `mithril-lynx/plugin` already bundles with your entry:

```css
@import "mithril-lynx-ui/styles.css";
```

That pulls in Luna's real theme tokens (`@lynx-js/luna-styles`, unmodified) plus the optional default
component styles. Apply a theme class — `luna-dark`, `luna-light`, `lunaris-dark` or `lunaris-light` — to
an ancestor, usually your page root; Luna scopes its custom properties to those classes rather than
`:root`, so nothing resolves without one.

## Usage

```js
import m from "mithril";
import { Button } from "mithril-lynx-ui/button";
import { Switch, SwitchThumb, SwitchTrack } from "mithril-lynx-ui/switch";

m("view", { class: "luna-dark" }, [
  m(Button, { className: "ui-button", onClick: () => console.log("tap") },
    m("text", { class: "ui-button-label" }, "Continuar")),

  m(Switch, { className: "ui-switch", checked: on, onChange: (v) => { on = v; shim.redraw(); } },
    m(SwitchTrack, { className: "ui-switch-track" },
      m(SwitchThumb, { className: "ui-switch-thumb" }))),
]);
```

### Styling

Like lynx-ui, every component is **headless**: it renders bare `<view>`s and applies only semantic state
classes — `ui-active`, `ui-checked`, `ui-disabled`, `ui-indeterminate` — alongside whatever `className`
you pass. Style them however you like; CSS written against lynx-ui's classes works here unchanged.

Unlike lynx-ui, this package also ships an *optional* default look built purely from Luna tokens. Opt in
per call site with `ui-button`, `ui-switch`, `ui-checkbox`, `ui-radio` (and their part classes). Leave
those classes off and you get the same unstyled primitives lynx-ui gives you.

### Controlled and uncontrolled

Same rule as lynx-ui: pass `checked` / `value` and the component is controlled (its `default*` prop is
then ignored); omit it and the component keeps its own state.

### Scoped slots

Pass a function as the single child to receive the component's live state:

```js
m(Switch, { defaultChecked: true }, ({ checked, active, disabled }) =>
  m("text", checked ? "on" : "off"));
```

## Components

| Export | Status |
| --- | --- |
| `mithril-lynx-ui/button` | `Button` |
| `mithril-lynx-ui/switch` | `Switch`, `SwitchTrack`, `SwitchThumb` |
| `mithril-lynx-ui/checkbox` | `Checkbox`, `CheckboxIndicator` |
| `mithril-lynx-ui/radio-group` | `RadioGroup`, `Radio`, `RadioIndicator` |
| `mithril-lynx-ui/input` | `Input`, `TextArea` |
| `mithril-lynx-ui/presence` | `Presence`, `PresenceContent`, `usePresence`, `presenceClasses` |
| `mithril-lynx-ui/scope` | `createScope` — the Context substitute described below |
| `mithril-lynx-ui/native` | `nativeBool` — see Native element interop |

Slider, Dialog, Sheet, Popover, List, Swiper, Draggable, Sortable, SwipeAction and the rest are not built
yet.

### `input` — and one place this is simpler than lynx-ui

A controlled field's value is pushed through the native editor's own `setValue`, never diffed on as an
attribute — an attribute would fight the native editor's internal state. Imperative access follows:

```js
const ref = {};
m(Input, { inputRef: ref, value, onInput: (v) => { value = v; shim.redraw(); } });
ref.focus(); // also blur, setValue, getValue, setSelectionRange
```

lynx-ui wraps this in Main Thread Scripting: its components run on the background thread, so an input
event lands on the main thread and has to be forwarded, and it marks the field readonly mid-flight so
typing can't race that hop. A mithril-lynx app in main-thread-owned mode has no hop — the handler already
runs where the event arrives — so controlled input is simply synchronous here and none of that machinery
exists. An app that moves its logic to the background thread reintroduces the hop; that's what
mithril-lynx's named-handler registry is for.

### `presence` — animating things out

An element removed from the tree can't animate on its way out, because it's already gone. `Presence`
keeps it mounted until its leave animation actually reports finished, and falls back to a frame watchdog
when there's no animation at all. It's what Dialog, Sheet and Popover will be built on.

```js
m(Presence, { show: open, onClose: () => {} },
  m(PresenceContent, { className: "card ui-presence-scale" }, ...));
```

`PresenceContent` applies lynx-ui's animation class contract (`ui-entering`, `ui-leaving`, `ui-animating`,
`ui-open`, `ui-closed`) and wires the six animation/transition events the machine listens to.

## `scope` — why this exists

Mithril has no Context. Most of lynx-ui's Context usage doesn't need one here: a component handing state
to its own children uses a scoped slot instead. But compound parts (`SwitchTrack`, `CheckboxIndicator`)
are descendants, not direct children, so they do need ambient state — `createScope()` provides it with
nearest-provider-wins semantics:

```js
const scope = createScope();
m(scope.Provider, { value: state }, children);  // provide
scope.useScope();                               // read, from any descendant's view()
```

It's implemented through `view()` ordering rather than lifecycle hooks: `oncreate`/`onupdate` are flushed
only after the whole tree is diffed, which is too late for a descendant's own `view()` to observe.

## Native element interop

Two things bite when driving Lynx's native elements through Mithril's DOM-shaped API. Both were found on
device, not in tests:

- **Every attribute crosses as a string, and booleans don't survive at all.** The shim mirrors the DOM,
  where `setAttribute` always stringifies — so `maxLength: 10` arrives as `"10"` (native parses it back,
  fine). Booleans are the fatal case: Mithril's HTML semantics turn `attr={true}` into
  `setAttribute(key, "")`, because on the web presence *is* the signal, and a native Lynx element reads
  that empty string as not-set. `visible={true}` on `<overlay>` therefore mounts silently and never
  appears. Use `nativeBool()` from `mithril-lynx-ui/native` for any boolean bound to a native element.
- **One copy of mithril-lynx, or nothing works.** The shim keeps its render state (root wrapper, redraw
  function) in module-level variables, so two physical copies means two disconnected renderers: the app
  renders through one, and a library calling `shim.redraw()` hits the other — whose redraw is still
  `null`, making it a silent no-op with no error at all. Any app consuming a linked or nested copy needs
  an exact alias (see `demo/lynx.config.ts`); `mithril-lynx/plugin` already does this for `mithril`
  itself and arguably should for `mithril-lynx` too.
- **Several elements are opt-in native artifacts.** `<overlay>`, `<input>`, `<textarea>` and friends are
  not in the core `lynx` Maven artifact. Without the matching `org.lynxsdk.lynx:xelement-*` dependency
  (plus `XElementBehaviors().create()` registered on the `LynxViewBuilder`) they mount without error and
  render nothing at all. `demo-android/app/build.gradle.kts` lists the ones this project needs.

## Known gaps

- **Main Thread Scripting.** lynx-ui uses compiler-transformed cross-thread closures for things like
  `Input`'s optimistic echo. mithril-lynx substitutes a named handler registry
  (`registerHandler`/`runOnMainThread`), which is equal in capability but permanently different in
  ergonomics — inline closures aren't possible without a compiler. Components that depend on MTS will be
  re-implemented against that registry rather than ported.
- Components are verified on real hardware before being listed above as done.

## License

Apache-2.0. Luna tokens are used unmodified and component behaviour is adapted from `@lynx-js/lynx-ui`,
both Apache-2.0 — see [NOTICE](./NOTICE).
