// internal/frames.js
//
// Port of lynx-ui-common's delayFrames: run a callback N animation frames
// from now. Presence uses it both to let a newly-mounted element lay out
// before its enter animation starts, and as the watchdog that gives up
// waiting for an animation that never fires.
//
// Frames, not milliseconds, on purpose — the point is to sequence against
// the render pipeline, which a wall-clock timer can't do reliably.

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
