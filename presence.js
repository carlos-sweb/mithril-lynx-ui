// presence.js
//
// Mithril port of @lynx-js/lynx-ui-presence (Apache-2.0 — see ./NOTICE):
// keeps an element mounted until its leave animation has actually finished,
// so content can animate out instead of vanishing. Everything Dialog, Sheet
// and Popover need to animate is built on this.
//
// The state machine is ported faithfully, including the parts that look
// paranoid but aren't:
//   - Enter is scheduled 8 frames out (16 with enableDelay) so the element
//     lays out before its animation starts; otherwise the first frame of the
//     animation races the first frame of layout.
//   - Every wait loop carries a loop id, bumped whenever a real animation
//     starts or a competing transition is scheduled. A stale loop that wakes
//     up late sees the id moved and bails, instead of driving the machine
//     from a state it no longer owns.
//   - Both animation kinds (keyframes and transitions) are tracked
//     separately, because either or both may be running; a state only
//     advances once neither is.
//   - If no animation ever starts, a 24-frame watchdog advances the state
//     anyway — an element with no CSS animation still has to open and close.
//
// React → Mithril mapping: useState/useRef become fields on the component's
// own vnode.state, and the two useEffects (on `state`, and on `show`) become
// one runEffects() call from oncreate/onupdate. Those hooks are the right
// analogue: like useEffect they run after the tree is committed, not during
// view(), so a state change made there re-renders rather than re-entering.

import m from "mithril";
import shim from "mithril-lynx";
import { cx } from "./internal/cx.js";
import { delayFrames } from "./internal/frames.js";
import { renderChildren } from "./internal/press.js";
import { createScope } from "./scope.js";

export const PresenceState = {
	Initial: 0,
	Entering: 1,
	/** Enter, deferred one extra beat so content can lay out first. */
	DelayedEntering: 2,
	Entered: 3,
	Leaving: 4,
	Left: 5,
};

const MAX_WAIT_FRAMES = 24;

const presenceScope = createScope();

/** Reads the enclosing Presence's {status, animationAttrs} — for custom animated parts. */
export function usePresence() {
	return presenceScope.useScope();
}

/**
 * Turns the internal state into the flags a caller actually reasons about.
 * Mirrors lynx-ui's resolveAnimationStatus, including the `grouped` variant:
 * a grouped member must stay open while leaving, so its own children don't
 * disappear before the group's animation finishes.
 */
export function resolveAnimationStatus(state, enableDelay, grouped) {
	const enteringState = enableDelay ? PresenceState.DelayedEntering : PresenceState.Entering;
	const isOpen = state === enteringState || state === PresenceState.Entered;
	const isClosed =
		state === PresenceState.Leaving ||
		state === PresenceState.Left ||
		(enableDelay && state === PresenceState.Entering);

	return {
		entering: state === enteringState,
		leaving: state === PresenceState.Leaving,
		animating: state === PresenceState.Leaving || state === enteringState,
		open: grouped ? isOpen || state === PresenceState.Leaving : isOpen,
		closed: grouped ? state === PresenceState.Left : isClosed,
	};
}

/** The class contract lynx-ui styles against: ui-entering/leaving/animating/open/closed. */
export function presenceClasses(status, className) {
	return cx(className, {
		"ui-entering": status.entering,
		"ui-leaving": status.leaving,
		"ui-animating": status.animating,
		"ui-open": status.open,
		"ui-closed": status.closed,
	});
}

function currentState(s) {
	return s.attrs.state !== undefined ? s.attrs.state : s.internalState;
}

function makeController(s) {
	// React's useEffect runs after the commit, outside render. Mithril's
	// oncreate/onupdate are flushed at the END of a render pass but still
	// INSIDE it, so redrawing synchronously from there re-enters the renderer
	// and throws "Node is currently being rendered to and thus is locked."
	// State is written immediately; the redraw is deferred and coalesced, so
	// the next pass observes it.
	// Anything the app hands us — onOpen/onClose — runs deferred for the same
	// reason: these fire from the effects, i.e. inside the render pass, and an
	// app callback will very reasonably call shim.redraw(). Calling it there
	// throws "Node is currently being rendered to and thus is locked", which
	// would make the component unusable in the most obvious way anyone would
	// use it. Deferring is the library's job, not the caller's.
	const defer = (fn) => {
		if (typeof fn !== "function") return;
		delayFrames(1, fn);
	};

	const scheduleRedraw = () => {
		if (s.redrawScheduled) return;
		s.redrawScheduled = true;
		delayFrames(1, () => {
			s.redrawScheduled = false;
			shim.redraw();
		});
	};

	const setState = (next) => {
		if (typeof s.attrs.setPresenceState === "function") s.attrs.setPresenceState(next);
		else s.internalState = next;
		scheduleRedraw();
	};

	const setMount = (next) => {
		if (s.mount === next) return;
		s.mount = next;
		scheduleRedraw();
	};

	const notAnimating = () => s.isKFAnimating === false && s.isTransitionAnimating === false;

	const cancelShowTimer = () => {
		s.showScheduleId += 1;
	};
	const cancelEnteringWait = () => {
		s.enteringLoopId += 1;
	};
	const cancelLeavingWait = () => {
		s.leavingLoopId += 1;
	};

	const scheduleShow = () => {
		const scheduleId = s.showScheduleId;
		setMount(true);
		delayFrames(8, () => {
			if (scheduleId !== s.showScheduleId || !s.attrs.show) return;
			setState(PresenceState.Entering);
		});
		if (s.attrs.enableDelay === true) {
			delayFrames(16, () => {
				if (scheduleId !== s.showScheduleId || !s.attrs.show) return;
				setState(PresenceState.DelayedEntering);
			});
		}
	};

	const restartShow = () => {
		cancelShowTimer();
		scheduleShow();
	};

	const onAnimationEnd = () => {
		const state = currentState(s);
		if (
			(state === PresenceState.Entering || state === PresenceState.DelayedEntering) &&
			notAnimating()
		) {
			// An enter animation can still land after show flipped false. Going
			// to Leaving (not Left) keeps the leave animation able to run.
			setState(s.attrs.show ? PresenceState.Entered : PresenceState.Leaving);
		}
		if (state === PresenceState.Leaving && notAnimating()) {
			cancelLeavingWait();
			if (s.attrs.show) restartShow();
			else setState(PresenceState.Left);
		}
	};

	const animationAttrs = {
		onanimationstart: () => {
			s.isKFAnimating = true;
			cancelEnteringWait();
			cancelLeavingWait();
		},
		onanimationend: () => {
			s.isKFAnimating = false;
			onAnimationEnd();
		},
		onanimationcancel: () => {
			s.isKFAnimating = false;
			onAnimationEnd();
		},
		ontransitionstart: () => {
			s.isTransitionAnimating = true;
			cancelEnteringWait();
			cancelLeavingWait();
		},
		ontransitionend: () => {
			s.isTransitionAnimating = false;
			onAnimationEnd();
		},
		ontransitioncancel: () => {
			s.isTransitionAnimating = false;
			onAnimationEnd();
		},
	};

	// ---- state handlers ----

	const onEntered = () => {
		if (s.hasNotifiedOpen) return;
		s.hasNotifiedOpen = true;
		defer(s.attrs.onOpen);
	};

	const onLeft = () => {
		if (s.attrs.show) {
			restartShow();
			return;
		}
		if (!s.isInitialRender && s.hasNotifiedOpen) {
			s.hasNotifiedOpen = false;
			defer(s.attrs.onClose);
		}
		setMount(false);
	};

	/** Waits for a leave animation to start; gives up after MAX_WAIT_FRAMES. */
	const onLeaving = () => {
		cancelEnteringWait();
		s.leavingWaitFrames = 0;
		s.leavingLoopId += 1;
		const loopId = s.leavingLoopId;

		const tryLeft = () => {
			if (loopId !== s.leavingLoopId) return;
			if (!notAnimating()) return;
			if (s.leavingWaitFrames >= MAX_WAIT_FRAMES) {
				if (s.attrs.show) restartShow();
				else setState(PresenceState.Left);
				return;
			}
			s.leavingWaitFrames += 1;
			delayFrames(1, tryLeft);
		};

		delayFrames(1, tryLeft);
	};

	/** The mirror of onLeaving, for the enter side. */
	const onEntering = () => {
		cancelLeavingWait();
		s.enteringWaitFrames = 0;
		s.enteringLoopId += 1;
		const loopId = s.enteringLoopId;

		const tryEntered = () => {
			if (loopId !== s.enteringLoopId) return;
			if (!notAnimating()) return;
			if (s.enteringWaitFrames >= MAX_WAIT_FRAMES) {
				setState(s.attrs.show ? PresenceState.Entered : PresenceState.Leaving);
				return;
			}
			s.enteringWaitFrames += 1;
			delayFrames(1, tryEntered);
		};

		delayFrames(1, tryEntered);
	};

	const dismiss = () => {
		const state = currentState(s);
		if (
			state === PresenceState.Entered ||
			state === PresenceState.Entering ||
			state === PresenceState.DelayedEntering
		) {
			cancelEnteringWait();
			setState(PresenceState.Leaving);
		} else if ((state === PresenceState.Initial || state === PresenceState.Left) && s.mount) {
			setMount(false);
		}
	};

	/**
	 * Stands in for the component's two useEffects. Runs after the tree is
	 * committed, and only on an actual change — the state effect first, then
	 * the show effect, matching the order they're declared in upstream.
	 */
	const runEffects = () => {
		const state = currentState(s);
		const show = s.attrs.show === true;
		const enableDelay = s.attrs.enableDelay === true;
		const enteringState = enableDelay ? PresenceState.DelayedEntering : PresenceState.Entering;

		if (!s.effectsStarted || s.lastState !== state) {
			s.lastState = state;
			if (state === PresenceState.Entered) onEntered();
			if (state === PresenceState.Left) onLeft();
			if (state === PresenceState.Leaving) onLeaving();
			if (state === enteringState) onEntering();
		}

		if (!s.effectsStarted || s.lastShow !== show || s.lastEnableDelay !== enableDelay) {
			s.lastShow = show;
			s.lastEnableDelay = enableDelay;
			if (show) restartShow();
			else {
				cancelShowTimer();
				dismiss();
			}
		}

		s.effectsStarted = true;
		s.isInitialRender = false;
	};

	return { animationAttrs, runEffects };
}

export const Presence = {
	oninit(vnode) {
		const s = vnode.state;
		s.attrs = vnode.attrs;
		s.internalState = PresenceState.Left;
		s.mount = false;
		s.isKFAnimating = false;
		s.isTransitionAnimating = false;
		s.hasNotifiedOpen = false;
		s.isInitialRender = true;
		s.effectsStarted = false;
		s.enteringLoopId = 0;
		s.leavingLoopId = 0;
		s.showScheduleId = 0;
		s.enteringWaitFrames = 0;
		s.leavingWaitFrames = 0;
		s.controller = makeController(s);
	},

	view(vnode) {
		const s = vnode.state;
		// Refreshed every render so the controller's closures always read the
		// current attrs rather than whatever they were at oninit.
		s.attrs = vnode.attrs;

		const status = resolveAnimationStatus(
			currentState(s),
			vnode.attrs.enableDelay === true,
			vnode.attrs.grouped === true,
		);
		const api = { status, animationAttrs: s.controller.animationAttrs };
		const visible = s.mount || vnode.attrs.forceMount === true;

		// Nothing at all while closed — not even the scope Provider, which
		// would otherwise leave its (invisible) pop marker behind and make
		// "is this mounted?" untrue for callers and tests alike. With no
		// children rendered there is nobody left to read the scope anyway.
		if (!visible) return null;

		return m(presenceScope.Provider, { value: api }, renderChildren(api, vnode.children));
	},

	oncreate(vnode) {
		vnode.state.controller.runEffects();
	},

	onupdate(vnode) {
		vnode.state.controller.runEffects();
	},
};

/**
 * The animated element itself: applies the presence class contract and wires
 * up the six animation/transition events the state machine listens for.
 * Use it inside a Presence; for anything more custom, read usePresence()
 * and spread its animationAttrs yourself.
 */
export const PresenceContent = {
	view(vnode) {
		const api = usePresence();
		if (api == null) {
			throw new Error("mithril-lynx-ui: <PresenceContent> must be used inside a <Presence>");
		}

		return m(
			"view",
			Object.assign({}, api.animationAttrs, {
				class: presenceClasses(api.status, vnode.attrs.className),
				style: vnode.attrs.style,
			}),
			vnode.children,
		);
	},
};
