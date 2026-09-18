# 2 — Direct style/attribute writes without a redraw

## What this solves

When a component needs to update `style`/attributes on every event of a
continuous gesture (dragging, swiping), going through Mithril's normal
cycle (change state → redraw → diff → patch) on every `touchmove` is too
much: it pays the full cost of a diff per frame to write, in practice, a
single property. This pattern skips the redraw entirely — it writes
straight to the native node.

## The native PAPI involved

A handful of native functions, one per write kind:

- `__SetInlineStyles(handle, styles)` — an object of CSS properties.
- `__SetClasses(handle, classString)` — replaces the `class` attribute.
- `__SetID(handle, id)` — replaces the `id` attribute.
- `__AddDataset(handle, key, value)` — a `data-*`.
- `__SetAttribute(handle, name, value)` — any other attribute.

## What an implementation looks like

A helper that routes each write kind to the right native function:

```js
function wrapElement(node) {
	const handle = node._handle;

	return {
		setStyleProperty(name, value) {
			__SetInlineStyles(handle, { [name]: value });
		},

		setStyleProperties(styles) {
			__SetInlineStyles(handle, styles);
		},

		setAttribute(name, value) {
			if (name === "class") __SetClasses(handle, value == null ? "" : String(value));
			else if (name === "id") __SetID(handle, value == null ? null : String(value));
			else if (name.slice(0, 5) === "data-") __AddDataset(handle, name.slice(5), value);
			else __SetAttribute(handle, name, value == null ? null : value);
		},
		// ...
	};
}
```

Real usage in `src/draggable/draggable.js` — writing `transform` on every
move, without a redraw:

```js
function writeTransform(s, x, y) {
	s.translate = { x, y };
	if (s.el != null) s.el.setStyleProperty("transform", `translate(${x}px, ${y}px)`);
}

export const Draggable = {
	// ...
	oncreate(vnode) {
		const s = vnode.state;
		s.el = wrapElement(vnode.dom);

		const draggableRef = vnode.attrs.draggableRef;
		if (draggableRef != null) {
			draggableRef.setTransform = (x, y) => writeTransform(s, x, y);
			draggableRef.getTranslate = () => s.translate;
		}
	},

	view(vnode) {
		const s = vnode.state;
		// ...
		const onMove = (e) => {
			if (!s.dragging || s.startPoint == null) return;
			const point = pagePoint(e);
			if (point == null) return;

			const bounds = boundsFor(vnode.attrs);
			const dx = clamp(point.x - s.startPoint.x, bounds.minX, bounds.maxX);
			const dy = clamp(point.y - s.startPoint.y, bounds.minY, bounds.maxY);
			writeTransform(s, s.translateAtStart.x + dx, s.translateAtStart.y + dy);

			if (typeof vnode.attrs.onDragging === "function") vnode.attrs.onDragging(s.translate);
		};
		// ...
	},
};
```

It's also used for attributes Mithril doesn't need to re-diff on every
render, as in `src/list/list.js`:

```js
const ref = wrapElement(s.list);
if (style != null) ref.setStyleProperties(style);
ref.setAttribute("list-main-axis-gap", mainAxisGap);
ref.setAttribute("list-cross-axis-gap", crossAxisGap);
```

And for writing several properties at once, as in `src/swiper/swiper.js`:

```js
function setTransform(s, value, animate) {
	s.currentTransform = value;
	if (s.trackEl == null) return;
	s.trackEl.setStyleProperties({
		transform: `translateX(${value}px)`,
		transition: animate ? `transform ${s.attrs.duration ?? 300}ms ease-out` : "none",
	});
}
```

## Applying this in mithril-lynx

The component runs on the background thread; the real native node only
exists on the main-thread side, which applies patches. Writing a "direct"
style therefore means crossing that bridge on every call — unlike manual 1
(a single one-off invocation), the problem here is that a `touchmove` can
fire dozens of these writes per second.

The practical rule: don't queue every write, only send the latest pending
one. If the bridge hasn't finished processing the previous write by the
time a new one arrives, the old one no longer matters — drop it and
replace it:

```js
function createStyleWriter(selector) {
	let pending = null;
	let sending = false;

	function flush() {
		if (sending || pending == null) return;
		sending = true;
		const styles = pending;
		pending = null;

		lynx.createSelectorQuery()
			.select(selector)
			.setNativeProps(styles)
			.exec();

		// No confirmation callback for setNativeProps — assume it already went out.
		sending = false;
		if (pending != null) flush(); // a new write arrived while this one was going out
	}

	return {
		setStyleProperties(styles) {
			pending = Object.assign(pending || {}, styles);
			flush();
		},
	};
}
```

`setNativeProps` (visible in `NodesRef`'s typings) has no confirmation
callback — unlike `invoke()`, it's fire-and-forget. That makes this pattern,
in practice, simpler to bridge than manual 1's: there's nothing to wait on,
only a need to avoid sending more updates than necessary. This is real,
implemented code — see `src/internal/native-ref.js`'s `createNativeWriter`
(and `createRef`'s `setStyleProperty`/`setStyleProperties`, which wrap it).

**A real, confirmed surprise, found writing `draggable.js`'s tests.**
`@lynx-js/testing-environment`'s real `NodesRef.setNativeProps()` writes
each prop with `element.setAttributeNS(null, key, value)` — a plain DOM
**attribute**, not `element.style[key] = value`. That's a genuinely
different place on the real element than where a normal DECLARATIVE style
render lands: a component's `view()` returning `style: {transform: ...}`
goes through `apply-patch.js`'s ordinary op path instead
(`__AddInlineStyle(handle, key, value)` → `element.style[key] = value`).
So the same `transform` value can sit in TWO different places on the same
element depending on which path wrote it last — `element.getAttribute(key)`
for an imperative `setNativeProps()` write, `element.style[key]` for a
declarative render. A test reading a component's current value back has to
check both:

```ts
function transformOf(app, node) {
	const handle = app.applier.getHandle(node._id);
	return handle.getAttribute("transform") ?? handle.style.transform ?? undefined;
}
```

Whether this attribute-vs-style split reflects real device behavior too,
or is purely an artifact of how the testing environment happens to
simulate `setNativeProps()`, is unconfirmed — flagged the same way the
exact expected shape of `setNativeProps`'s argument object already was.

**A real timing gap, found porting `swiper.js`.** Every component up to
this point only ever wrote imperatively in response to a LATER event
(a touchmove, well after mount) — `swiper.js` is the first to write its
initial value synchronously, inside `oncreate` itself
(`setTransform(s, s.currentTransform, false)`, to seed the track's
position). That crashed immediately: `oncreate` can run BEFORE this same
render's own patch — including the very `id` attribute the write needs to
select by — has actually been applied on the main thread. Calling
`lynx.createSelectorQuery().select(...)` for an id that doesn't exist yet
throws synchronously (confirmed real, not a test artifact — the real
`NodesRef.select()` throws the same way). `createNativeWriter()` now
catches that and retries a few times, a microtask apart — by the next
microtask the patch reliably has landed, the same ordering async
`invoke()` calls already relied on elsewhere. Any component writing
imperatively from `oncreate` itself (not from a later event handler) needs
to go through this retry path; one that only ever writes in response to a
real, later event never hits it.

## How to test this without a device

`lynx.createSelectorQuery()` needs no mock of its own — see manual 1's "how
to test" section for how `@lynx-js/testing-environment`'s real
implementation gets wired up (the one fix needed lives in
`test/harness.ts`'s `mount()`, not in a stub). Fire the touch event
directly on the node and read the write back with the combined
attribute/style helper above.

## Where this pattern is used

- `src/draggable/draggable.js` — reference case for this manual.
- `src/list/list.js` — gap attributes on the native list.
- `src/swiper/swiper.js` — the track's `transform`/`transition`.
- `src/slider/slider.js`, `src/sheet/sheet.js`, `src/swipe-action/swipe-action.js` — position writes combined with other patterns (see manuals 4 and 5).
