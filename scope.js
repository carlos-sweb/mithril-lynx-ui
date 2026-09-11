// scope.js
//
// A small Context substitute for mithril-lynx apps — nearest-provider-wins
// semantics. mithril-lynx core has no equivalent (confirmed absent — see
// the project plan's "New primitive: Scope" section); this lives in
// mithril-lynx-ui itself rather than core.
//
// Reserve this for genuine ambient/cross-nesting-level state (e.g. a
// KeyboardAware-style root affecting arbitrarily-nested descendants). For
// the simpler "parent passes state straight to its own children" case
// (e.g. a compound component like Button reading {active, disabled}),
// prefer an ordinary scoped-slot — call `attrs.children(state)` directly
// where children is a function — no Scope needed at all.
//
// Why this ISN'T built on oncreate/onremove (the obvious first instinct,
// and what an earlier version of this file did): those hooks are collected
// during the tree walk but only *flushed* afterwards — oncreate fires only
// once the whole tree has already been created, which is too late for a
// descendant's view() to see a value pushed there. What actually runs at
// the right time, on both the initial create pass AND every later update
// pass, is view() itself — Mithril's diff calls a component's view()
// synchronously, depth-first, exactly when it reaches that vnode in tree
// order. So Provider pushes inside its own view(), and a trailing,
// invisible PopMarker child — positioned last, so it's only reached once
// every real child has fully finished its own subtree — pops inside ITS
// view(). Nesting depth-first traversal does the rest: by the time
// Provider's own siblings run, the marker for every Provider nested inside
// it has already popped.
//
// The real children are kept as one nested array (`[vnode.children,
// m(PopMarker)]`, not flattened) so Mithril's "all keyed or none" sibling
// rule is checked separately per nesting level — a keyed list passed as
// Provider's children stays keyed among itself, unaffected by the unkeyed
// PopMarker one level up. (A PopMarker keyed to match a keyed children
// array isn't attempted here — it doesn't need a key at all with the
// children kept nested rather than concatenated flat.)
//
// Each createScope() call is independent: a useScope() only ever resolves
// against Provider instances created by that same createScope() call.

import m from "mithril";

export function createScope() {
	const stack = [];

	const PopMarker = {
		view() {
			stack.pop();
			// A real (if trivial) native node, not null — removing a
			// null-rendering component hit a "Cannot read properties of null
			// (reading 'nextSibling')" crash somewhere in the shim's diff when
			// an ancestor got removed/replaced across a redraw. A zero-size
			// <view> sidesteps that path entirely and costs nothing visible.
			return m("view", { style: { display: "none" } });
		},
	};

	const Provider = {
		view(vnode) {
			stack.push(vnode.attrs.value);
			return [vnode.children, m(PopMarker)];
		},
	};

	function useScope() {
		return stack.length === 0 ? undefined : stack[stack.length - 1];
	}

	return { Provider, useScope };
}
