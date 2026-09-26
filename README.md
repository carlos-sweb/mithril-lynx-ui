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

Peer dependencies: `mithril-lynx` 3.0.0 or later and `mithril-runtime`. `List` renders mithril-lynx 3.0.0's
native `list`/`list-item` elements, and `Input`/`TextArea` use its declarative `value` and element UI
methods, so 2.x does not work.

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
import m from "mithril-runtime";
import { Button } from "mithril-lynx-ui/button";
import { Switch, SwitchThumb, SwitchTrack } from "mithril-lynx-ui/switch";

m("view", { class: "luna-dark" }, [
  m(Button, { className: "ui-button", onClick: () => console.log("tap") },
    m("text", { class: "ui-button-label" }, "Continuar")),

  m(Switch, { className: "ui-switch", checked: on, onChange: (v) => { on = v; } },
    m(SwitchTrack, { className: "ui-switch-track" },
      m(SwitchThumb, { className: "ui-switch-thumb" }))),
]);
```

Callbacks like `onChange` run inside a native event, so mithril-lynx redraws after them on its own. State
changed anywhere else (a timer, a fetch) needs `redraw()` from `mithril-lynx/mount-redraw`.

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
| `mithril-lynx-ui/draggable` | `Draggable` |
| `mithril-lynx-ui/input` | `Input`, `TextArea` |
| `mithril-lynx-ui/slider` | `SliderRoot`, `SliderTrack`, `SliderThumb`, `SliderIndicator` |
| `mithril-lynx-ui/presence` | `Presence`, `PresenceContent`, `usePresence`, `presenceClasses` |
| `mithril-lynx-ui/input-otp` | `InputOTP`, `InputOTPSlot`, `useInputOTPContext` |
| `mithril-lynx-ui/form` | `FormRoot`, `FormField`, `FormSubmitButton`, `useForm` |
| `mithril-lynx-ui/list` | `List` — see `list` below |
| `mithril-lynx-ui/feed-list` | `FeedList` |
| `mithril-lynx-ui/lazy-component` | `LazyComponent` |
| `mithril-lynx-ui/dialog` | `DialogRoot`, `DialogTrigger`, `DialogClose`, `DialogBackdrop`, `DialogContent`, `DialogView` |
| `mithril-lynx-ui/sheet` | `SheetRoot`, `SheetTrigger`, `SheetClose`, `SheetBackdrop`, `SheetHandle`, `SheetContent`, `SheetView` |
| `mithril-lynx-ui/drawer` | `DrawerRoot`, `DrawerTrigger`, `DrawerClose`, `DrawerView`, `DrawerBackdrop`, `DrawerContent` |
| `mithril-lynx-ui/popover` | `PopoverRoot`, `PopoverTrigger`, `PopoverAnchor`, `PopoverBackdrop`, `PopoverPositioner`, `PopoverContent`, `PopoverArrow` |
| `mithril-lynx-ui/swiper` | `Swiper` |
| `mithril-lynx-ui/sortable` | `SortableRoot`, `SortableItem` |
| `mithril-lynx-ui/swipe-action` | `SwipeAction` |
| `mithril-lynx-ui/layout` | `Box`, `Stack`, `Row`, `Column`, `Center`, `Spacer`, `ZStack`, `Grid`, `GridItem`, `Divider`, `AspectRatio` |
| `mithril-lynx-ui/scope` | `createScope` — the Context substitute described below |
| `mithril-lynx-ui/native` | `nativeBool` — see Native element interop |

### `slider` — one value model, two shapes

A single `internal/slider-utils.js` (ported close to verbatim — the original has no React import at all)
drives both a plain 0..1 value and a two-thumb `[number, number]` range: dragging near a thumb in range
mode picks whichever one is closer, a thumb can meet but never cross the other, and a collapsed range
(both thumbs equal) picks a direction to move based on which way you drag away from it.

```js
m(SliderRoot, { value, onValueChange: (v) => { value = v; } },
  m(SliderTrack, { className: "ui-slider-track" }, [
    m(SliderIndicator, { className: "ui-slider-indicator" }),
    m(SliderThumb, { className: "ui-slider-thumb" }),      // or two, with index: 0 / index: 1, for a range
  ]));
```

Track width isn't known on the very first touch, so the bounds are measured asynchronously (a
`boundingClientRect` UI method call, through `internal/native-ref.js`) and any move that arrives before
that resolves is queued and replayed once it does — ported as-is; that queuing is load-bearing, not
defensive paranoia.

Uses `on*` handlers rather than the original's `catch*` (Lynx's "stop this from also reaching an
ancestor" event modifier) — mithril-lynx's fake DOM has no capture/stop-propagation concept, only a
plain `addEventListener`. Verified this doesn't conflict with a surrounding `<scroll-view>` in this project's
own gallery, but that's one layout, not a guarantee.

### `draggable` — the drag loop without Main Thread Scripting

lynx-ui's Draggable carries twelve `'main thread'` directives: the whole drag loop (read the touch point,
compute the delta, clamp it, write the transform) runs on the main thread. mithril-lynx has no Main Thread
Scripting — component code runs on the background thread — so here each `touchmove` is forwarded there,
and the new position is written straight to the node with `setNativeProps` rather than through a diff.
mithril-lynx 3.0.0 coalesces the redraws that follow `touchmove`/`gesturemove`/`scroll` to one per frame.

The position is also kept in the rendered `style`, which matters more than it looks: a redraw mid-drag (an
app mirroring `onDragging` into its own state causes exactly this) re-applies `style` from attrs, and
without the transform there too, Mithril's own diff strips it back out mid-gesture. Found on device, not in
tests — the reported offset kept climbing while the element sat still.

### `input` — `Input` and `TextArea`

Both wrap the native `<input>`/`<textarea>`. On mithril-lynx 3.0.0 a field works like a web form field:

```js
import { Input, TextArea } from "mithril-lynx-ui/input";

let email = "";
const ref = {};

m(Input, {
  className: "ui-input",
  type: "email",                 // text | number | digit | email | tel | password
  placeholder: "tu@correo.com",
  value: email,                  // controlled: omit for uncontrolled
  onInput: (value, selectionStart, selectionEnd, isComposing) => { email = value; },
  onConfirm: (value) => submit(value),
  inputRef: ref,
  inputProps: { autofocus: true }, // any raw native attribute
});

m(TextArea, { className: "ui-textarea", defaultValue: "Notas…", maxLines: 4 });
```

- **`value` (controlled).** It is sent to the native editor (its `setValue` method) only when it differs
  from what the field holds. Text the user just typed is never echoed back, so the caret doesn't jump. A
  value the app changes — clearing it, forcing uppercase, trimming — is sent once. `null` clears the field.
- **`defaultValue` (uncontrolled).** It seeds the field once, when it is created; after that the field is on
  its own.
- **No `id` or timers needed.** The value, focus and the `inputRef` methods work from the moment the
  component is created. Before mithril-lynx 3.0.0 this took an `id`, `lynx.createSelectorQuery()` and a
  `setTimeout`.
- **`inputRef`:** `focus()`, `blur()`, `setValue(v)`, `getValue()` (resolves
  `{ value, selectionStart, selectionEnd, isComposing }`) and `setSelectionRange(start, end)`, all returning
  promises.
- **Autofocus:** pass `inputProps: { autofocus: true }` to focus the field once on creation.
- **Other attributes:** `readonly`, `maxLength` (default 140), `confirmType` (default `"send"`),
  `inputFilter`, `showSoftInputOnFocus`, plus `onFocus`, `onBlur`, `onSelectionChange`. `inputProps` passes
  any other native attribute through.

lynx-ui's `Input` handles input in Main Thread Scripting and marks the field readonly while a controlled
value round-trips from the background thread, so a keystroke can't race it. mithril-lynx 3.0.0 guards the
same race in its core instead:
- the main thread counts each field's keystrokes and drops a `setValue` computed before the latest one;
  that keystroke's own event re-renders with the right value;
- it drops the `input` events native fires on its own — every `setValue` is echoed back, and a `<textarea>`
  fires `input ""` when created — so `onInput` only runs when the text really changed.

See mithril-lynx's `INPUT.md`. Verified on an Android device: fast typing through a controlled uppercase
`Input`, and a `TextArea` with `defaultValue`.

`<input>`/`<textarea>` need the XElement input artifacts on the host (see "Native element interop" below).

### `list` — the native virtualized list

`List` renders mithril-lynx 3.0.0's native `list`/`list-item` elements: `renderItem(item, index)`, a stable
`getItemKey(item, index)`, per-item native attributes from `getItemAttrs` (`full-span`, `sticky-top`, …),
every other native `<list>` attribute and event passed straight through, and the native methods on
`listRef` (`scrollToPosition`, `scrollBy`, `autoScroll`, `getVisibleCells`, plus `scrollTo(index)`).
See `docs/native-papi/papi-07-list-redesign.md`.

### `presence` — animating things out

An element removed from the tree can't animate on its way out, because it's already gone. `Presence`
keeps it mounted until its leave animation actually reports finished, and falls back to a frame watchdog
when there's no animation at all. Dialog, Sheet, Drawer and Popover are built on it.

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

Three things bite when driving Lynx's native elements through Mithril's DOM-shaped API. All were found on
device, not in tests:

- **Attributes cross as strings, and booleans don't survive at all.** mithril-lynx's fake DOM mirrors the
  DOM, where `setAttribute` always stringifies — so `maxLength: 10` arrives as `"10"` (native parses it
  back, fine). Booleans are the fatal case: Mithril's HTML semantics turn `attr={true}` into
  `setAttribute(key, "")`, because on the web presence *is* the signal, and a native Lynx element reads
  that empty string as not-set. `visible={true}` on `<overlay>` therefore mounts silently and never
  appears. Use `nativeBool()` from `mithril-lynx-ui/native` for any boolean bound to a native element.
  (`<list>`/`<list-item>` are the exception: mithril-lynx 3.0.0 passes their attributes with real types.)
- **One copy of mithril-lynx.** Components call `redraw()` from `mithril-lynx/mount-redraw`, which talks to
  the app mounted by *that* copy's `renderApp()`. If the app and this package resolve two physical copies
  of mithril-lynx (an `npm link`, a nested install), a component's redraw goes to the copy with no app and
  silently does nothing. Make sure only one copy resolves, with a bundler alias if needed.
- **Several elements are opt-in native artifacts.** `<overlay>`, `<input>`, `<textarea>` and friends are
  not in the core `lynx` Maven artifact. Without the matching `org.lynxsdk.lynx:xelement-*` dependency
  (plus `XElementBehaviors().create()` registered on the `LynxViewBuilder`) they mount without error and
  render nothing at all. `demo-android/app/build.gradle.kts` lists the ones this project needs.

## Known gaps

- **No Main Thread Scripting.** lynx-ui runs per-frame work (drags, the controlled `Input`'s readonly lock)
  on the main thread through compiler-transformed closures. mithril-lynx has no such compiler: component
  code runs on the background thread. What replaces it:
  - native gesture detectors whose claim/release decision runs on the main thread (`internal/gesture.js`,
    used by Sheet, Swiper and SwipeAction — see `docs/native-papi/papi-05-native-gestures.md`);
  - direct `setNativeProps` writes instead of a diff per frame;
  - for `Input`, mithril-lynx's own race guard.

## License

Apache-2.0. Luna tokens are used unmodified and component behaviour is adapted from `@lynx-js/lynx-ui`,
both Apache-2.0 — see [NOTICE](./NOTICE).
