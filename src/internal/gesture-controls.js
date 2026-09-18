// internal/gesture-controls.js
//
// Thin wrapper around the raw controller mithril-lynx/gesture's
// createGesture() hands a callback: `(event, controller) => {}`, where
// `controller` is `{__SetGestureState, __ConsumeGesture}` — see gesture.js's
// own header. That's the native gesture-arena handle itself, called with
// `(elementHandle, gestureId, ...)`, not a per-callback convenience object —
// confirmed by reading how createGesture()'s OWN returned `setState(state)`
// calls it: `__SetGestureState(handle, id, state)`, three args, matching
// @lynx-js/gesture-runtime's InternalStateManager interface (the real,
// shipped library this was cross-checked against — same native primitive
// under both @lynx-js/gesture-runtime's fluent `manager.fail()`/
// `manager.interceptGesture()` API and mithril-lynx core's raw one).
//
// This gives every "gesture" component (SwipeAction today; Swiper/Sortable
// later, if they end up needing gesture-arena composition too) the same
// fail()/interceptGesture() vocabulary lynx-ui's own MTS code uses, without
// depending on the event argument carrying an element reference — the
// handle/id are already known from createGesture()'s own return value, so
// they're captured directly instead.

const GestureState = { active: 1, fail: 2, end: 3 };

/**
 * @param {unknown} handle - the node handle the gesture was registered on (same one passed to createGesture()).
 * @param {number} gestureId - createGesture()'s returned `.id`.
 */
export function makeGestureControls(handle, gestureId) {
	function setState(controller, state) {
		if (controller != null && typeof controller.__SetGestureState === "function") {
			controller.__SetGestureState(handle, gestureId, state);
		}
	}

	return {
		fail(controller) {
			setState(controller, GestureState.fail);
		},
		active(controller) {
			setState(controller, GestureState.active);
		},
		end(controller) {
			setState(controller, GestureState.end);
		},
		/** True: claim the gesture (block ancestors, e.g. a <scroll-view>). False: release it back to them. */
		interceptGesture(controller, shouldIntercept) {
			if (controller != null && typeof controller.__ConsumeGesture === "function") {
				controller.__ConsumeGesture(handle, gestureId, { consume: shouldIntercept, inner: false });
			}
		},
	};
}
