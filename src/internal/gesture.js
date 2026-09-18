// internal/gesture.js
//
// Thin wrapper around mithril-lynx (2.4.0+) fake-dom's own
// setGestureDetector()/removeGestureDetector() — see
// docs/native-papi/papi-05-native-gestures.md for the full design. Call
// registerGesture(vnode, type, arenaPolicy) from a component's oncreate;
// it returns `{ remove() }` for onremove. The resulting touches-down/move/
// up events arrive at the SAME node as plain "gesturedown"/"gesturemove"/
// "gestureup" events — wire ongesturedown/ongesturemove/ongestureup
// handlers on that node's own attrs in view(), exactly like any other
// native event (ontouchstart, etc). No controller object, no
// interceptGesture()/fail() call of your own — the claim/release decision
// described by `arenaPolicy` already happened on the main thread before
// the event reaches here.
//
// `arenaPolicy` is one of:
//   { mode: "claim" } — claim on touches-down, hold it for the whole
//     gesture (a single-axis drag with nothing else competing for it).
//   { mode: "axis-lock", axis: "horizontal" | "vertical", referenceMoves }
//     — claim eagerly, then release+fail if the losing axis wins once
//     there's a real delta to judge (referenceMoves: 0 decides on the
//     first move using touches-down as the reference; 1 uses the first
//     move as the reference and decides on the second).

/** `vnode.dom` is the node to register the gesture on directly — pass the
 * specific child node if the gesture belongs to something other than this
 * component's own top-level element (see sheet.js/swipe-action.js/
 * swiper.js for the "gesture lives on an inner node" case). */
export function registerGesture(node, type, arenaPolicy) {
	const gestureId = node.setGestureDetector(type, arenaPolicy);
	return {
		remove() {
			node.removeGestureDetector(gestureId);
		},
	};
}
