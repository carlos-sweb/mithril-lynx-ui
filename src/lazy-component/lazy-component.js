// lazy-component.js
//
// Mithril port of @lynx-js/lynx-ui-lazy-component (Apache-2.0 — see
// ./NOTICE): renders a tiny placeholder until the element is about to enter
// the viewport (with a configurable pre-load margin), then swaps in the
// real children — the standard "don't build the expensive subtree until
// it's actually needed" pattern for long lists/pages.
//
// The original's real mechanism, confirmed by reading BOTH the component
// source and its own `useGlobalEventListener` hook (@lynx-js/lynx-ui-common)
// rather than guessing from the prop names: it does NOT listen on the node
// itself. It sets `exposure-id`/`exposure-scene`/`exposure-screen-margin-*`
// attributes (a real, documented native attribute set — @lynx-js/types'
// common/props.d.ts) to register the node for exposure tracking, then
// subscribes to a GLOBAL, page-wide pub/sub bus —
// `lynx.getJSModule('GlobalEventEmitter').addListener('exposure'/
// 'disexposure', ...)` — filtering the batched events for ones matching its
// own pid/scene. That API only exists on the BACKGROUND thread
// (@lynx-js/types' background-thread/lynx.d.ts declares getJSModule; the
// main-thread one does not) — a genuine cross-thread requirement, unlike
// every MTS use this project has ported so far, which turned out to be
// artifacts of ReactLynx's background-owned component model rather than
// anything intrinsic.
//
// Ported differently, on purpose: the SAME underlying native exposure
// system also delivers per-node `bind uiappear`/`uidisappear` events
// (@lynx-js/types' common/events.d.ts UIAppearanceDetailEvent — its own
// detail carries the same exposure-id/exposure-scene the global bus
// filters by) — an ordinary PER-NODE event, exactly this project's
// established on*-maps-to-addEventListener contract, with no thread hop
// and no manual pid/scene filtering needed (a node's own binduiappear only
// ever fires for itself). This is the same central bet as everywhere else
// in this project: the original's cross-thread plumbing is a ReactLynx
// modeling artifact, not something the underlying native feature actually
// requires. NOT yet confirmed on a real device that `uiappear`/`uidisappear`
// actually fire for an exposure-configured node the way `exposure`/
// `disexposure` do on the global bus — de-risk this on-device before
// trusting it in a real app, the same way `<overlay>` was smoke-tested in
// Phase 0 before anything was built on it.
//
// `onlayoutchange` (used to cache the last real size before unmounting, so
// a re-appearance after unmountOnExit doesn't flash to the estimated size)
// is likewise ported as a plain on* event — already used the same way by
// sortable.js, but that component was never itself device-verified (blocked
// on an unrelated core bug), so this is this project's first ACTUAL
// hardware confirmation that `onlayoutchange` fires as expected.
//
// `flatten={false}` on the original's placeholder (a compositing-layer
// hint) is dropped — a v1 simplification, not a correctness requirement.

import m from "mithril-runtime";

// A zero-size placeholder can never register as visible, so the exposure
// system would never fire and the real content would never load — this is
// a correctness floor, not a visual choice, so it's applied unconditionally
// here rather than left to an opt-in CSS class a consumer might not import.
const MIN_SIZE_STYLE = { "min-width": "1px", "min-height": "1px" };

export const LazyComponent = {
	oninit(vnode) {
		const s = vnode.state;
		s.shown = false;
		s.cachedSize = null;
	},

	view(vnode) {
		const s = vnode.state;
		const {
			className,
			style,
			pid,
			scene,
			top = "10px",
			bottom = "10px",
			left = "10px",
			right = "10px",
			unmountOnExit,
			unloadable = false,
			estimatedStyle = {},
			onAppear,
			onDisappear,
		} = vnode.attrs;
		const shouldUnmountOnExit = unmountOnExit ?? unloadable;

		const exposureAttrs = {
			class: className,
			"exposure-id": pid,
			"exposure-scene": scene,
			"exposure-screen-margin-top": top,
			"exposure-screen-margin-bottom": bottom,
			"exposure-screen-margin-left": left,
			"exposure-screen-margin-right": right,
			onuiappear: () => {
				s.shown = true;
				if (typeof onAppear === "function") onAppear();
			},
			onuidisappear: () => {
				if (shouldUnmountOnExit) s.shown = false;
				if (typeof onDisappear === "function") onDisappear();
			},
		};

		if (shouldUnmountOnExit) {
			const { width, height, ...restEstimated } = estimatedStyle;
			const placeholderStyle = s.shown
				? {}
				: Object.assign({}, restEstimated, {
						width: (s.cachedSize && s.cachedSize.width) ?? width,
						height: (s.cachedSize && s.cachedSize.height) ?? height,
					});
			return m(
				"view",
				Object.assign({}, exposureAttrs, {
					style: Object.assign({}, MIN_SIZE_STYLE, style, placeholderStyle),
					onlayoutchange: (e) => {
						if (s.shown && e && e.detail) {
							s.cachedSize = { width: `${e.detail.width}px`, height: `${e.detail.height}px` };
						}
					},
				}),
				s.shown ? vnode.children : null,
			);
		}

		// Loaded once, stays loaded: no wrapper element at all once shown — same
		// headless-once-loaded contract as the original.
		if (s.shown) return vnode.children;

		return m("view", Object.assign({}, exposureAttrs, { style: Object.assign({}, MIN_SIZE_STYLE, style, estimatedStyle) }));
	},
};
