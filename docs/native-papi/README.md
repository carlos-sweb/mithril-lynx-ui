# Native PAPI manuals for mithril-lynx

mithril-lynx doesn't ship, on its own, primitives for writing styles
without a redraw, imperatively reading/writing a node, registering native
gestures, or virtualizing lists — these are capabilities that any
"advanced" component (a slider, a sheet with drag-to-dismiss, a list with
thousands of items) ends up needing sooner or later, hand-built on top of
Lynx's native PAPI.

This folder is a practical guide for that: how to build that kind of
component in mithril-lynx, calling the native PAPI directly, ordered from
simplest to most complex. Each manual takes a real, already-solved case
from `mithril-lynx-ui` and explains the pattern so it can be reproduced in
any new component.

## Reading order

| # | Manual | Case | Complexity |
|---|---|---|---|
| 1 | [`papi-01-imperative-refs.md`](./papi-01-imperative-refs.md) | Invoking a native method on a node (focus/blur/setValue/getValue) | Simplest |
| 2 | [`papi-02-direct-style-writes.md`](./papi-02-direct-style-writes.md) | Writing `style`/attributes without going through a redraw, on high-frequency events | Low |
| 3 | [`papi-03-async-geometry-measurement.md`](./papi-03-async-geometry-measurement.md) | Measuring a node (`boundingClientRect`) asynchronously + handling events that arrive while measuring | Medium |
| 4 | [`papi-04-slider-full-case.md`](./papi-04-slider-full-case.md) | Combining measurement + continuous writes in a real interactive component | Medium-high |
| 5 | [`papi-05-native-gestures.md`](./papi-05-native-gestures.md) | Native gesture arena, worklets, PAPI callbacks | High |
| 6 | [`papi-06-virtualized-lists.md`](./papi-06-virtualized-lists.md) | Native virtualized lists and their synchronous recycling callback | Most complex |

Each manual can be read on its own, but the 1→6 order is recommended: each
case reuses the vocabulary of the previous one (manual 4 is a case study
combining 1-3; manuals 5 and 6 are the two cases where mithril-lynx runs on
a different thread than the native node, so the bridge between the two is
documented as an open design rather than a closed recipe).

## Component → applicable manuals map

| Component | Manuals | Note |
|---|---|---|
| `src/input/input.js` | 1 | Reference case for manual 1 |
| `src/draggable/draggable.js` | 2 | Reference case for manual 2 |
| `src/popover/popover.js` | 1, 3 | Invocation + measurement with retry |
| `src/slider/slider.js` | 1, 2, 3, 4 | Full case study for manual 4 |
| `src/swipe-action/swipe-action.js` | 1, 2, 3, 5 | Measurement + writes + native gesture |
| `src/swiper/swiper.js` | 2, 5 | Style writes + native gesture with axis-lock |
| `src/sheet/sheet.js` | 2, 5 | Reference case for manual 5 (drag-to-dismiss) |
| `src/list/list.js` | 1, 2, 6 | Reference case for manual 6 |
| `src/feed-list/feed-list.js` | 1, 6 | Composes `List` (manual 6) + refresh invocation (manual 1) |
| `src/drawer/drawer.js` | 5 (indirect) | No PAPI of its own — wraps `Sheet` |
| `src/form/form.js` | 1 (indirect) | No PAPI of its own — uses `Input` internally |
| `src/input-otp/input-otp.js` | 1 (indirect) | No PAPI of its own — uses `Input` internally |
| `src/sortable/sortable.js` | 2 (indirect) | No PAPI of its own — uses `Draggable` internally |

The four "indirect" components don't call PAPI on their own: they compose
another component from the list above and inherit its behavior. They don't
need a manual of their own.
