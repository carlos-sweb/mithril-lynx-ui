# Dialog

Import the compound components from `mithril-lynx-ui/dialog` and load
`mithril-lynx-ui/styles.css`. Native event handlers use `ontap`.

## Lifecycle and motion

`DialogRoot` supports controlled `show` + `onShowChange`, or uncontrolled
`defaultShow`. In controlled mode, update `show` in the callback.
`onOpen` fires after all parts finish entering. `onClose` fires after all parts
finish leaving, including a dismissed opening that never reached `onOpen`.
Callbacks are deferred outside the render pass and cancelled on removal.

Backdrop and content animation classes are enabled by default. The optional
default CSS fades/scales in from 0.96 over 200 ms, then fades out over 160 ms.
The backdrop fades in/out over 180/150 ms. Close controls remain usable during
entry. Missing native completion events cannot leave the dialog busy forever:
`DialogView.animationTimeout` defaults to 500 ms. Increase it if custom
animations take longer. Set `DialogRoot.reducedMotion` to skip built-in motion;
the application supplies this preference (there is no automatic system probe).

`forceMount` preserves children while closed but hides the wrapper with
`display: none` and excludes it from accessibility and hit testing. Give
dynamic direct children stable Mithril keys. Native overlays outside the
current LynxView are not implemented: `container` and `overlayLevel` remain
unsupported compatibility props.

## Configurable backdrop

| Attribute | Default | Meaning |
| --- | --- | --- |
| `variant` | `"dim"` | `"dim"`, `"blur"`, or `"transparent"` |
| `color` | Luna backdrop token | Scrim color, including alpha |
| `clickToClose` | `true` | Allow dismissal by tapping outside |
| `blurRadius` | `"12px"` | Native blur strength, as a length string |
| `captureTarget` | Required for blur | Raw background view id, without `#` |
| `blurViewProps` | — | Additional native blur attributes |
| `style`, `dialogBackdropProps` | — | Visual and native overrides |

Transparent does not mean touch-through: the modal still blocks the background.
An explicit color in blur mode is drawn above the blurred content.

## Android blur setup

Blur uses Lynx's native `<blur-view>`, not CSS `backdrop-filter`. Add the official
artifact matching your SDK (the demo uses 4.1.0):

```kotlin
implementation("org.lynxsdk.lynx:xelement-blur-view:4.1.0")
```

Register `XElementBehaviors().create()` on your `LynxViewBuilder` and keep the
window hardware accelerated. Use a separate background sibling with
`flatten: "false"`; **the capture target must not contain the dialog or its
blur view**. An empty/missing `captureTarget` throws an explanatory error.
The component cannot detect whether your native host has registered the element;
choose `variant: "dim"` for hosts without blur support.

```typescript
import m from "mithril-runtime";
import {
  DialogRoot, DialogTrigger, DialogView, DialogBackdrop,
  DialogContent, DialogClose,
} from "mithril-lynx-ui/dialog";

export const Example: m.Component = {
  view: () => m(DialogRoot, { initialFocusId: "dialog-title" }, [
    m("view", { id: "app-background", flatten: "false",
      style: { width: "100%", height: "100%" } }, [
      m("text", "Background content"),
      m(DialogTrigger, { class: "ui-button" }, m("text", "Open")),
    ]),
    m(DialogView, { class: "luna-light" }, [
      m(DialogBackdrop, { key: "backdrop", class: "ui-dialog-backdrop",
        variant: "blur", captureTarget: "app-background",
        blurRadius: "14px", color: "rgba(0,0,0,0.20)" }),
      m(DialogContent, { key: "content", class: "ui-dialog-content" }, [
        m("text", { id: "dialog-title", "accessibility-heading": "true" }, "Sample dialog"),
        m("text", "No data is changed."),
        m(DialogClose, { class: "ui-button" }, m("text", "Close")),
      ]),
    ]),
  ]),
};
```

The theme must also cover the modal sibling, as shown above. For a full-page
blur, the capture target must fill the visible page; Android only blurs its
intersection with the blur view.

## Android Back and routing

Exported `handleDialogBack(): boolean` consumes Back for the topmost modal.
When no modal exists it returns false. `closeOnBack: false` consumes Back without
closing, preventing route navigation behind a locked modal. Closing animations
also consume Back until the modal is removed.

Install **one dispatcher** for `mithrilLynx:back`: call `handleDialogBack()`
first and only call `route.back()` when it returns false. Do not also leave
`route.listenBackButton()` listening to that same native event: both listeners
would run. Its configurable `eventName` can reserve a separate route-only event
while its `onCanGoBackChange` still observes history.

`subscribeDialogVisibility(listener)` reports whether a modal can consume Back,
calls the listener immediately, and returns an unsubscribe function. Notify the
native navigation module with `routeCanGoBack || dialogVisible`. Remove global
listeners/subscriptions when disposing your application. See the demo's
`src/background.ts` for the complete dispatcher.

## Accessibility and long content

The visible wrapper enables native `accessibility-exclusive-focus`; closed
force-mounted wrappers and decorative backdrops are accessibility-hidden.
`initialFocusId` requests accessibility focus after opening; `restoreFocusId`
restores it after closing, defaulting to the last trigger id. These are
accessibility focus requests, **not keyboard/input focus**. Unsupported native
focus requests are ignored; test TalkBack in your own host.

Use `buttonProps` on Trigger/Close to supply native ids and accessible labels.
Use a named heading inside content. Keep title and action buttons outside
`DialogBody`; it renders a bounded vertical `scroll-view`. Its `height` defaults
to `"240px"`, capped at `55vh`. Content is capped at 85% of its container. Custom
content without `DialogBody` remains the caller's responsibility. Keyboard/IME
insets depend on the Android host window configuration, not this JS component.

Public API declarations cover all seven components and both Back helpers in
`src/dialog/dialog.d.ts`. The demo type-checks their usage and exercises blur,
dim, transparent, reduced motion, long content and dismissal settings.

## References

- [Lynx blur-view](https://lynxjs.org/api/elements/built-in/blur-view.html)
- [Lynx Android integration](https://lynxjs.org/guide/start/integrate-with-existing-apps.html)
- [Lynx view accessibility](https://lynxjs.org/api/elements/built-in/view.html)
- [Android dialog guidance](https://developer.android.com/develop/ui/compose/components/dialog)
