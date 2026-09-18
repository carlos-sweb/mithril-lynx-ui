// drawer.js
//
// Not a port of anything upstream — @lynx-js/lynx-ui has no Drawer at all
// (confirmed against its real component list: Dialog, Sheet, Popover, and
// 17 others, no Drawer). This is this project's own addition, for the
// exact same reason layout.js was: something genuinely commonly needed
// that neither Lynx nor lynx-ui provides on its own.
//
// A "drawer" (edge-anchored navigation panel, conventionally left/right)
// is not a new primitive at all, though — it's a Sheet with `side: "left"`
// and its own visual identity. sheet.js's own `side` prop already covers
// "left"/"right"/"start"/"end" (and top/bottom, which a drawer has no
// business using), and its presence-group/native-gesture-drag machinery
// is exactly what a drawer needs too: mount/unmount timing, backdrop,
// drag-to-dismiss that correctly wins against the page's own ancestor
// `<scroll-view>`. Reimplementing that here would be several hundred
// lines of copy-pasted logic for zero behavioral difference — so this
// file is thin wrappers over the real sheet.js components, not a second
// implementation.
//
// What IS genuinely Drawer's own: the DEFAULT side (`"left"`, not Sheet's
// own `"bottom"` default — set here, still overridable by the caller, NOT
// pinned the way layout.js's Row/Column force their own direction), and a
// separate, independent CSS class contract (`ui-drawer-backdrop` /
// `ui-drawer-content`, not `ui-sheet-backdrop` / `ui-sheet-content`) so a
// consumer can theme a Drawer differently from a bottom Sheet in the same
// app without one selector fighting the other. See css/drawer.css's own
// header for exactly how that's wired without touching sheet.js or
// duplicating its presence/gesture logic — only the visual layer repeats,
// keyed off the SAME `ui-sheet-side-*`/`ui-entering`/`ui-leaving` classes
// sheet.js's own sheetClasses() already emits regardless of which
// className the caller passes in.
//
// DrawerTrigger/DrawerClose/DrawerView carry no visual identity of their
// own in sheet.js either (a trigger is just a Button; a view is just a
// plain positioning box) — those three are re-exported as-is, not
// wrapped, since wrapping them would add a layer of indirection with
// nothing to actually customize.
//
// Known, deliberate rough edge from that re-export: sheet.js's own
// "used outside its ancestor" errors are worded against ITS OWN names
// (e.g. "<SheetTrigger> must be used inside a <SheetRoot>"), since
// sheetScope is module-private to sheet.js and DrawerTrigger has no way to
// check it itself first and throw a Drawer-flavored message instead
// without re-implementing that check (and duplicating sheet.js's own
// scope logic, which is exactly what this file exists to avoid). A
// forgotten <DrawerRoot> therefore surfaces a "SheetRoot" error, not a
// "DrawerRoot" one — a real but minor cost, confined to a developer-time
// misuse case, not something an end user of a correctly-wired app ever
// sees. Worth fixing (by having sheet.js export sheetScope, or accept a
// caller-supplied component-name pair) if a THIRD wrapper family over
// sheet.js's scope ever shows up.

import m from "mithril";
import { SheetBackdrop, SheetClose, SheetContent, SheetRoot, SheetTrigger, SheetView } from "../sheet/sheet.js";
import { cx } from "../internal/cx.js";

export const DrawerRoot = {
	view: (vnode) => m(SheetRoot, Object.assign({ side: "left" }, vnode.attrs), vnode.children),
};

export const DrawerTrigger = SheetTrigger;
export const DrawerClose = SheetClose;
export const DrawerView = SheetView;

export const DrawerBackdrop = {
	view(vnode) {
		const { className } = vnode.attrs;
		return m(SheetBackdrop, Object.assign({}, vnode.attrs, { className: cx(className, { "ui-drawer-backdrop": true }) }), vnode.children);
	},
};

export const DrawerContent = {
	view(vnode) {
		const { className } = vnode.attrs;
		return m(SheetContent, Object.assign({}, vnode.attrs, { className: cx(className, { "ui-drawer-content": true }) }), vnode.children);
	},
};
