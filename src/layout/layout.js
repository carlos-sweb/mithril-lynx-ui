// layout.js
//
// Lynx itself provides no arrangement COMPONENTS — no `<Stack>`, `<Grid>`,
// `<Columns>`. What it provides are four CSS `display` modes applied
// directly to `<view>` (see lynx-api-docs' own layout/*.md, read in full
// before writing this file):
//   - `linear` (the default when `display` is omitted): Android
//     LinearLayout-style, `linear-direction: row|column`, `linear-weight`
//     for weighted space distribution. No wrapping. Cheapest to lay out —
//     the docs' own recommendation is "use Linear for simple lists."
//   - `flex`: closer to web Flexbox — `flex-wrap`, `flex-grow/shrink/
//     basis`, `align-content` for multi-line. Slightly more expensive.
//   - `grid`: a real subset of CSS Grid — `grid-template-columns/rows`,
//     `gap`, `grid-auto-flow`, item placement via `grid-*-start/end`. No
//     named lines, no `grid-area`, no subgrid.
//   - `relative` (Lynx-specific, not ported here): siblings positioned
//     against each other via `relative-id` + `relative-align-*`/
//     `relative-*-of`. Genuinely useful for one-off card layouts, but it's
//     a different shape (constraint graph, not a reusable arrangement
//     primitive) — not a good fit for a generic Stack/Grid package;
//     reach for raw `display: relative` CSS directly when it's the right
//     tool.
// `@lynx-js/lynx-ui` itself (confirmed by reading its real component list)
// ships NONE of Stack/Grid/Columns either — it's headless on purpose and
// leaves arrangement to the consumer's own CSS. This file is this
// project's own addition, not a port of anything upstream: thin,
// structural wrappers over the CSS above, in the same spirit as Chakra's
// or Radix's layout primitives. No new mithril-lynx-core capability is
// needed — this is 100% plain CSS on `<view>`, so there's nothing here to
// device-verify beyond "does the resulting CSS render the way the docs
// say it should," which the demo's own LAYOUT section exercises.
//
// One real, already-documented Lynx quirk this file has to design AROUND:
// an element with `position: fixed`/`absolute` and no explicit size
// measures ZERO-sized (found the hard way while building popover.js) —
// meaning `ZStack`'s own container must get an explicit width/height from
// the caller (or from a non-absolutely-positioned sibling establishing
// it), since its absolutely-positioned children can't contribute to the
// container's own intrinsic size. Documented on `ZStack` itself below.
//
// Naming choice, deliberate: `Stack`/`Row`/`Column`/`Center` use SHORT
// alignment prop names (`align`/`justify`) since a single-axis container
// only ever has one meaningful alignment concept per axis. `Grid` instead
// spells out the real CSS property names (`justifyContent`/`alignContent`
// for track alignment vs. `justifyItems`/`alignItems` for per-item
// alignment) because Grid genuinely has both concepts and short names
// would be ambiguous about which one a prop means.

import m from "mithril-runtime";
import { cx } from "../internal/cx.js";

function px(value) {
	return value == null ? undefined : `${value}px`;
}

function directionValue(direction, reverse) {
	const base = direction === "row" ? "row" : "column";
	return reverse ? `${base}-reverse` : base;
}

/** The base primitive every other export here is built from — a plain `<view>` taking only class/style, no arrangement opinion of its own. */
export const Box = {
	view(vnode) {
		const { className, style, boxProps } = vnode.attrs;
		return m("view", Object.assign({}, boxProps, { class: cx(className), style }), vnode.children);
	},
};

// Stack — the workhorse. Defaults to `display: linear` (cheapest, per the
// docs' own recommendation); switches to `display: flex` only when `wrap`
// is requested, since Linear Layout does not support wrapping at all.
export const Stack = {
	view(vnode) {
		const {
			direction = "column",
			reverse = false,
			wrap = false,
			gap,
			rowGap,
			columnGap,
			align,
			justify,
			className,
			style,
			stackProps,
		} = vnode.attrs;

		const dirValue = directionValue(direction, reverse);
		const computed = wrap
			? { display: "flex", "flex-direction": dirValue, "flex-wrap": "wrap" }
			: { display: "linear", "linear-direction": dirValue };

		if (gap != null) computed.gap = px(gap);
		if (rowGap != null) computed["row-gap"] = px(rowGap);
		if (columnGap != null) computed["column-gap"] = px(columnGap);
		if (align != null) computed["align-items"] = align;
		if (justify != null) computed["justify-content"] = justify;

		return m("view", Object.assign({}, stackProps, { class: cx(className), style: Object.assign(computed, style) }), vnode.children);
	},
};

/** `Stack` pinned to `direction: "row"` — a horizontal stack. */
export const Row = {
	view: (vnode) => m(Stack, Object.assign({}, vnode.attrs, { direction: "row" }), vnode.children),
};

/** `Stack` pinned to `direction: "column"` — a vertical stack (Stack's own default; provided for callers who'd rather be explicit). */
export const Column = {
	view: (vnode) => m(Stack, Object.assign({}, vnode.attrs, { direction: "column" }), vnode.children),
};

/** Centers its single child on both axes. */
export const Center = {
	view(vnode) {
		const { className, style, centerProps } = vnode.attrs;
		return m(
			"view",
			Object.assign({}, centerProps, {
				class: cx(className),
				style: Object.assign({ display: "flex", "align-items": "center", "justify-content": "center" }, style),
			}),
			vnode.children,
		);
	},
};

// Spacer — a flexible filler that grows to push its Stack siblings apart
// (the classic SwiftUI Spacer / "flex-grow: 1" trick). Sets BOTH
// `flex: 1` and `linear-weight: 1` unconditionally rather than trying to
// detect which mode its parent Stack is in: each layout engine only reads
// the property that belongs to its own `display` value and ignores the
// other, so this one node works correctly dropped into either a plain
// (linear) Stack or a `wrap`-enabled (flex) one with no extra prop needed.
export const Spacer = {
	view(vnode) {
		const { className, style, spacerProps } = vnode.attrs;
		return m("view", Object.assign({}, spacerProps, { class: cx(className), style: Object.assign({ flex: "1", "linear-weight": 1 }, style) }));
	},
};

// ZStack — overlapping (z-index-style) children, stacked in DOM order (last
// child renders on top). Each layer is pinned to fill the container
// (`position: absolute` + all four edges to `0`, not the `inset` CSS
// shorthand — not in Lynx's own supported-properties list, only the
// longhands are) — a deliberate "layers fill the frame" default (image +
// overlay, badge over content, spinner over a loading view), not a
// natural-size-then-centered stack. See this file's own header for why the
// CONTAINER itself needs an explicit width/height from the caller: with
// every child taken out of flow via `position: absolute`, none of them can
// establish the container's own size the way normal children would.
export const ZStack = {
	view(vnode) {
		const { className, style, zStackProps } = vnode.attrs;
		const children = vnode.children || [];
		return m(
			"view",
			Object.assign({}, zStackProps, { class: cx(className), style: Object.assign({ position: "relative" }, style) }),
			children.map((child, index) =>
				m("view", { key: index, style: { position: "absolute", top: "0px", left: "0px", right: "0px", bottom: "0px" } }, child),
			),
		);
	},
};

function trackList(value) {
	if (value == null) return undefined;
	return typeof value === "number" ? `repeat(${value}, 1fr)` : value;
}

export const Grid = {
	view(vnode) {
		const {
			columns,
			rows,
			autoColumns,
			autoRows,
			autoFlow,
			gap,
			rowGap,
			columnGap,
			justifyContent,
			alignContent,
			justifyItems,
			alignItems,
			className,
			style,
			gridProps,
		} = vnode.attrs;

		const computed = { display: "grid" };
		const cols = trackList(columns);
		const rws = trackList(rows);
		if (cols != null) computed["grid-template-columns"] = cols;
		if (rws != null) computed["grid-template-rows"] = rws;
		if (autoColumns != null) computed["grid-auto-columns"] = autoColumns;
		if (autoRows != null) computed["grid-auto-rows"] = autoRows;
		if (autoFlow != null) computed["grid-auto-flow"] = autoFlow;
		if (gap != null) computed.gap = px(gap);
		if (rowGap != null) computed["row-gap"] = px(rowGap);
		if (columnGap != null) computed["column-gap"] = px(columnGap);
		if (justifyContent != null) computed["justify-content"] = justifyContent;
		if (alignContent != null) computed["align-content"] = alignContent;
		if (justifyItems != null) computed["justify-items"] = justifyItems;
		if (alignItems != null) computed["align-items"] = alignItems;

		return m("view", Object.assign({}, gridProps, { class: cx(className), style: Object.assign(computed, style) }), vnode.children);
	},
};

// GridItem — placement for one child of a Grid. `colStart`/`colEnd`/
// `rowStart`/`rowEnd` (explicit grid line numbers) are the docs-verified
// path — grid-layout.md's own examples use exactly this shape. `colSpan`/
// `rowSpan` instead emit the standard `span N` end-value syntax, which
// Lynx's docs don't show in an example directly but which the same docs
// describe Grid as "generally follow[ing] the Web CSS Grid model" for —
// prefer colStart/colEnd if a `span` value ever turns out unsupported on a
// given SDK version.
export const GridItem = {
	view(vnode) {
		const { colStart, colEnd, colSpan, rowStart, rowEnd, rowSpan, className, style, gridItemProps } = vnode.attrs;
		const computed = {};
		if (colStart != null) computed["grid-column-start"] = colStart;
		if (colEnd != null) computed["grid-column-end"] = colEnd;
		else if (colSpan != null) computed["grid-column-end"] = `span ${colSpan}`;
		if (rowStart != null) computed["grid-row-start"] = rowStart;
		if (rowEnd != null) computed["grid-row-end"] = rowEnd;
		else if (rowSpan != null) computed["grid-row-end"] = `span ${rowSpan}`;

		return m("view", Object.assign({}, gridItemProps, { class: cx(className), style: Object.assign(computed, style) }), vnode.children);
	},
};

/** A thin line — `orientation: "horizontal"` (default, fills width) or `"vertical"` (fills height). Needs no default look on its own; `class: "ui-divider"` (css/layout.css) gives it a real, visible color. */
export const Divider = {
	view(vnode) {
		const { orientation = "horizontal", thickness = 1, className, style, dividerProps } = vnode.attrs;
		const horizontal = orientation !== "vertical";
		const computed = horizontal ? { width: "100%", height: px(thickness) } : { width: px(thickness), height: "100%" };
		return m(
			"view",
			Object.assign({}, dividerProps, {
				class: cx(className, { "ui-divider": true, "ui-divider--horizontal": horizontal, "ui-divider--vertical": !horizontal }),
				style: Object.assign(computed, style),
			}),
		);
	},
};

/** Reserves space by aspect ratio (`ratio = width / height`) — image/video/card frames. `width: 100%` by default since `aspect-ratio` alone needs at least one definite dimension to derive the other from. */
export const AspectRatio = {
	view(vnode) {
		const { ratio = 1, className, style, aspectRatioProps } = vnode.attrs;
		return m(
			"view",
			Object.assign({}, aspectRatioProps, { class: cx(className), style: Object.assign({ "aspect-ratio": String(ratio), width: "100%" }, style) }),
			vnode.children,
		);
	},
};
