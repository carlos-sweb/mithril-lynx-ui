# mithril-lynx-ui

A component library for [mithril-lynx](https://github.com/carlos-sweb/mithril-lynx) applications. Components render Lynx native elements and expose Mithril component APIs.

## Requirements

- `mithril-lynx` 3.0.0 or later
- `mithril-runtime` 1.1.0 or later

## Install

```sh
npm install mithril-lynx-ui
```

To make the optional component styles available, add this to the app's `style.css`:

```css
@import "mithril-lynx-ui/styles.css";
```

The default styles are opt-in through classes such as `ui-button`, `ui-switch`, and `ui-checkbox`. They use CSS custom properties. Define the properties required by the styles in your app, or provide your own CSS. Omit the `ui-*` classes to use unstyled components.

For the button and switch in the example below, add these properties to the app's `style.css`:

```css
.Page {
  --primary: #3157d5;
  --primary-content: #ffffff;
  --neutral-faint: #e5e7eb;
  --paper-clear: #ffffff;
}
```

## Usage

This complete view can be used as the `view()` export in a `mithril-lynx` app:

```js
import m from "mithril-runtime";
import { Button } from "mithril-lynx-ui/button";
import { Switch, SwitchThumb, SwitchTrack } from "mithril-lynx-ui/switch";

let notificationsEnabled = false;
let message = "Ready";

export function view() {
  return m("view", { class: "Page" }, [
    m(
      Button,
      {
        class: "ui-button",
        onClick: () => { message = "Button tapped"; },
      },
      m("text", { class: "ui-button-label" }, "Continue"),
    ),
    m("text", message),
    m(
      Switch,
      {
        class: "ui-switch",
        checked: notificationsEnabled,
        onChange: (nextValue) => { notificationsEnabled = nextValue; },
      },
      [
        m(
          SwitchTrack,
          { class: "ui-switch-track" },
          m(SwitchThumb, { class: "ui-switch-thumb" }),
        ),
      ],
    ),
    m("text", notificationsEnabled ? "Notifications enabled" : "Notifications disabled"),
  ]);
}
```

## Events and state

Use `ontap` on native Lynx elements, for example `m("view", { ontap: handler })`. Components expose their own callback props: `Button` uses `onClick`, and `Switch` uses `onChange`. `Button` connects `onClick` to the native `ontap` event internally; `ontap` is not a `Button` prop.

Mithril redraws after state changes made inside native event callbacks. For changes from timers, network callbacks, or other asynchronous code, call `redraw()` from `mithril-lynx/mount-redraw`.

For components that support controlled and uncontrolled state, pass `value` or `checked` to control the state. Otherwise use `defaultValue` or `defaultChecked` to set its initial value.

## Components

| Import path | Exports |
| --- | --- |
| `mithril-lynx-ui/button` | `Button` |
| `mithril-lynx-ui/switch` | `Switch`, `SwitchTrack`, `SwitchThumb` |
| `mithril-lynx-ui/checkbox` | `Checkbox`, `CheckboxIndicator` |
| `mithril-lynx-ui/radio-group` | `RadioGroup`, `Radio`, `RadioIndicator` |
| `mithril-lynx-ui/input` | `Input`, `TextArea` |
| `mithril-lynx-ui/input-otp` | `InputOTP`, `InputOTPSlot`, `useInputOTPContext` |
| `mithril-lynx-ui/slider` | `SliderRoot`, `SliderTrack`, `SliderThumb`, `SliderIndicator` |
| `mithril-lynx-ui/form` | `FormRoot`, `FormField`, `FormSubmitButton`, `useForm` |
| `mithril-lynx-ui/list` | `List` |
| `mithril-lynx-ui/feed-list` | `FeedList` |
| `mithril-lynx-ui/swiper` | `Swiper` |
| `mithril-lynx-ui/sortable` | `SortableRoot`, `SortableItem` |
| `mithril-lynx-ui/draggable` | `Draggable` |
| `mithril-lynx-ui/swipe-action` | `SwipeAction` |
| `mithril-lynx-ui/presence` | `Presence`, `PresenceContent`, `usePresence`, `presenceClasses` |
| `mithril-lynx-ui/dialog` | `DialogRoot`, `DialogTrigger`, `DialogClose`, `DialogBackdrop`, `DialogContent`, `DialogView`, `DialogBody` |
| `mithril-lynx-ui/sheet` | `SheetRoot`, `SheetTrigger`, `SheetClose`, `SheetBackdrop`, `SheetHandle`, `SheetContent`, `SheetView` |
| `mithril-lynx-ui/drawer` | `DrawerRoot`, `DrawerTrigger`, `DrawerClose`, `DrawerView`, `DrawerBackdrop`, `DrawerContent` |
| `mithril-lynx-ui/popover` | `PopoverRoot`, `PopoverTrigger`, `PopoverAnchor`, `PopoverBackdrop`, `PopoverPositioner`, `PopoverContent`, `PopoverArrow` |
| `mithril-lynx-ui/layout` | `Box`, `Stack`, `Row`, `Column`, `Center`, `Spacer`, `ZStack`, `Grid`, `GridItem`, `Divider`, `AspectRatio` |
| `mithril-lynx-ui/lazy-component` | `LazyComponent` |
| `mithril-lynx-ui/scope` | `createScope` |
| `mithril-lynx-ui/native` | `nativeBool` |

See the [Dialog guide](docs/dialog.md) for dialog composition and options.

## Android host requirements

Some native elements are provided by optional Lynx XElement artifacts. Add the required `org.lynxsdk.lynx:xelement-*` dependencies and register `XElementBehaviors().create()` on the Android `LynxViewBuilder` for the elements used by your app, including inputs and overlays.

Use `nativeBool()` from `mithril-lynx-ui/native` when passing boolean attributes to native elements whose attributes go through Mithril's DOM-shaped API.

## License

Apache-2.0. See [NOTICE](./NOTICE) for third-party notices.
