// internal/frames.js
//
// Port of lynx-ui-common's delayFrames: run a callback N animation frames
// from now. Presence uses it both to let a newly-mounted element lay out
// before its enter animation starts, and as the watchdog that gives up
// waiting for an animation that never fires.
//
// Frames, not milliseconds, on purpose — the point is to sequence against
// the render pipeline, which a wall-clock timer can't do reliably.
//
// requestFrame()/cancelFrame() below exist for swipe-action.js's (and any
// later gesture component's) own multi-frame animation loops — deliberately
// NOT the bare global requestAnimationFrame/cancelAnimationFrame. Those
// names are claimed by lynx-mithril-shim.js itself, polyfilled on top of
// queueMicrotask purely to give Mithril's OWN mount-redraw scheduler
// somewhere to hook into (see that file's header) — calling the bare global
// from app code drains the whole animation across a burst of microtasks
// instead of real device frames, so a "350ms" snap-back would visually snap
// instantly instead of animating. `lynx.requestAnimationFrame` is the actual
// device-paced primitive (same one delayFrames() below reaches for), so
// that's what these two use too.

export function delayFrames(frames, callback) {
	let count = 0;

	const step = () => {
		count += 1;
		if (count >= frames) callback();
		else raf(step);
	};

	raf(step);
}

function raf(fn) {
	// lynx.requestAnimationFrame is the real thing on device. The setTimeout
	// fallback exists for the jsdom test environment, which has no Lynx
	// frame pipeline at all — tests that care about exact frame counts drive
	// the state machine directly rather than relying on this.
	if (typeof lynx !== "undefined" && typeof lynx.requestAnimationFrame === "function") {
		lynx.requestAnimationFrame(fn);
	} else {
		setTimeout(fn, 16);
	}
}

/** Requests one more animation-paced frame; returns an id cancelFrame() understands. */
export function requestFrame(fn) {
	if (typeof lynx !== "undefined" && typeof lynx.requestAnimationFrame === "function") {
		return lynx.requestAnimationFrame(fn);
	}
	return setTimeout(fn, 16);
}

export function cancelFrame(id) {
	if (typeof lynx !== "undefined" && typeof lynx.cancelAnimationFrame === "function") {
		lynx.cancelAnimationFrame(id);
	} else {
		clearTimeout(id);
	}
}
