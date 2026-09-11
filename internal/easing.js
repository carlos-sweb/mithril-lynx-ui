// internal/easing.js
//
// Cubic-bezier sampling, ported verbatim from @lynx-js/lynx-ui-swipe-action
// (Newton's method with a bisection fallback — the standard CSS
// `cubic-bezier()` algorithm). Pure math, framework-agnostic, so this is a
// straight port rather than a redesign — same spirit as
// internal/slider-utils.js. Swiper's bounce/fling easing (Phase 5, not yet
// built) is expected to reuse this rather than re-deriving it.

function sampleCurveX(t, a, b, c) {
	return ((a * t + b) * t + c) * t;
}

function sampleCurveY(t, a, b, c) {
	return ((a * t + b) * t + c) * t;
}

function solveCurveX(x, ax, bx, cx, epsilon = 1e-6) {
	let t2 = x;
	let x2, d2;
	for (let i = 0; i < 8; i++) {
		x2 = sampleCurveX(t2, ax, bx, cx) - x;
		if (Math.abs(x2) < epsilon) return t2;
		d2 = (3 * ax * t2 + 2 * bx) * t2 + cx;
		if (Math.abs(d2) < 1e-6) break;
		t2 = t2 - x2 / d2;
	}
	let t0 = 0;
	let t1 = 1;
	t2 = x;
	while (t0 < t1) {
		x2 = sampleCurveX(t2, ax, bx, cx);
		if (Math.abs(x2 - x) < epsilon) return t2;
		if (x > x2) t0 = t2;
		else t1 = t2;
		t2 = (t1 - t0) * 0.5 + t0;
	}
	return t2;
}

/** Samples a CSS-style cubic-bezier(0,0,p2x,p2y-shaped) curve at `t`. */
export function cubicBezier(t, p1x, p1y, p2x, p2y) {
	const cx = 3 * p1x;
	const bx = 3 * (p2x - p1x) - cx;
	const ax = 1 - cx - bx;

	const cy = 3 * p1y;
	const by = 3 * (p2y - p1y) - cy;
	const ay = 1 - cy - by;

	return sampleCurveY(solveCurveX(t, ax, bx, cx), ay, by, cy);
}

/** cubic-bezier(0, 0, 0.4, 1) — the ease lynx-ui-swipe-action animates with. */
export function easeInOut(t) {
	return cubicBezier(t, 0, 0, 0.4, 1);
}
