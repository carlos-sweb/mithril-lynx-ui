# 4 — Full case: measurement + continuous writes

## What this solves

This manual doesn't add a new primitive — it's the case study where
manuals 1-3 combine in a real interactive component: `Slider` needs to know
the track's width (measurement, manual 3/1) before it can convert a
finger's position into a value, and needs to write the thumb's position on
every move (writes, manual 2). The interesting part is what happens when
the user starts dragging BEFORE the measurement has resolved.

## What an implementation looks like

Store the latest pending move if there's no measurement yet, and "flush"
it as soon as the measurement arrives:

```js
const flushPendingMoveX = () => {
	if (s.pendingMoveX == null || !s.bounds.measured) return;
	const x = s.pendingMoveX;
	const shouldFinish = s.pendingEnd;
	s.pendingMoveX = null;
	applyMeasuredMoveX(x);
	if (shouldFinish) finishInteraction();
};

const measureBounds = () => {
	if (s.bounds.measuring || s.trackEl == null) return;
	s.bounds.measuring = true;

	s.trackEl
		.invoke("boundingClientRect", { relativeTo: "" })
		.then((res) => {
			s.bounds.measuring = false;
			const data = (res && res.data) || {};
			const width = typeof data.width === "number" ? data.width : Number.NaN;
			const left = typeof data.left === "number" ? data.left : Number.NaN;

			if (Number.isFinite(width) && Number.isFinite(left) && width > 0) {
				s.bounds.width = width;
				s.bounds.left = left;
				s.bounds.measured = true;
				flushPendingMoveX();
			} else {
				s.bounds.width = 0;
				s.bounds.measured = false;
				if (s.pendingEnd) finishInteraction();
			}
		})
		.catch(() => {
			s.bounds.measuring = false;
			if (s.pendingEnd) finishInteraction();
		});
};

const handleMoveX = (x) => {
	if (vnode.attrs.disabled === true || !s.interaction.pointerActive) return;
	if (!Number.isFinite(x)) return;

	if (!s.bounds.measured || s.bounds.width <= 0) {
		s.pendingMoveX = x;
		measureBounds();
		return;
	}
	applyMeasuredMoveX(x);
};
```

Note the `s.bounds.measuring` guard: if a measurement is already in
flight, a second `touchmove` doesn't trigger a second query — it only
updates `s.pendingMoveX` (overwriting the previous one) and waits for the
in-flight one to resolve. It's the same "only the latest pending write
wins" principle from manual 2, applied to the read side instead of the
write side.

Once measured, writing the position is straightforward — the same pattern
from manual 2:

```js
const applyNativeValue = (next) => {
	const enableRTL = vnode.attrs.enableRTL === true;
	const { offset, size } = getSliderIndicatorGeometry(next);

	if (s.indicatorEl != null) {
		s.indicatorEl.setStyleProperties(
			enableRTL
				? { right: `${offset * 100}%`, width: `${size * 100}%` }
				: { left: `${offset * 100}%`, width: `${size * 100}%` },
		);
	}

	const lower = getSliderThumbValue(next, 0);
	if (s.thumbEls[0] != null) s.thumbEls[0].setStyleProperty("left", `${getVisualRatio(lower, enableRTL) * 100}%`);

	const upper = getSliderThumbValue(next, 1);
	if (s.thumbEls[1] != null) s.thumbEls[1].setStyleProperty("left", `${getVisualRatio(upper, enableRTL) * 100}%`);
};
```

The nodes (`trackEl`, `indicatorEl`, `thumbEls`) are captured in each
subcomponent's own `oncreate` (`SliderTrack`, `SliderThumb`,
`SliderIndicator`), each wrapping its own node with the same helper from
manuals 1 and 2.

## Applying this in mithril-lynx

There's nothing new to solve here beyond applying the manuals 1-3
translation (measurement via `createSelectorQuery`, writes via
`setNativeProps`) at every point this component uses them. That's exactly
the value of this case: it serves as a template for any "measurement +
writes only" component — no gestures, no lists — built from scratch. The
`handleMoveX → measureBounds / flushPendingMoveX → applyMeasuredMoveX` flow
is generic, not slider-specific.

## How to test this without a device

Combines the two mocks already seen: `__InvokeUIMethod` overridden to
return a fixed track rect (manual 3), and reading `__SetInlineStyles` to
verify the final written position (manual 2):

```ts
globalThis.__InvokeUIMethod = (_node, method, params, callback) => {
	if (method === "boundingClientRect") callback({ code: 0, data: { left: 0, top: 0, width: 200, height: 20 } });
	else callback({ code: 0, data: {} });
};

fireTouchStart(thumbNode, { clientX: 0 });
fireTouchMove(thumbNode, { clientX: 100 }); // halfway through a 200px track
await flushMicrotasks();

const write = papiCalls().filter((c) => c.fn === "__SetInlineStyles").at(-1);
expect(write.args[1].left).toBe("50%");
```

Given the case study, the specific thing worth testing: that a `touchmove`
arriving BEFORE the measurement resolves (for example, firing the event
without waiting for the intervening microtask) still ends up reflected once
the measurement lands — i.e. that `pendingMoveX`/`flushPendingMoveX`
actually don't drop the move.

## Where this pattern is used

- `src/slider/slider.js` — full case study for this manual.
- `src/swipe-action/swipe-action.js` — combines this with native gestures (see manual 5).
