import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { AspectRatio, Box, Center, Column, Divider, Grid, GridItem, Row, Spacer, Stack, ZStack } from "../src/layout/layout.js";
import { mount, textOf, styleOf } from "./harness.js";

// layout.js is pure structural CSS on <view> — no gestures, no presence, no
// scope. These tests just assert the emitted class/style contract for each
// primitive.

describe("layout.js", () => {
	describe("Box", () => {
		it("renders a plain <view> with class/style passthrough", () => {
			const app = mount(() => m(Box, { className: "card", style: { padding: "8px" } }, m("text", "hola")));
			const box = app.root;
			expect(box.tag).toBe("view");
			expect(textOf(box)).toBe("hola");
			expect(box.className).toBe("card");
			expect(styleOf(app, box).padding).toBe("8px");
		});
	});

	describe("Stack / Row / Column", () => {
		it("defaults to a vertical linear container", () => {
			const app = mount(() => m(Stack, {}, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style.display).toBe("linear");
			expect(style["linear-direction"]).toBe("column");
		});

		it("direction: row switches linear-direction, reverse appends -reverse", () => {
			const app = mount(() => m(Stack, { direction: "row", reverse: true }, m("text", "a")));
			expect(styleOf(app, app.root)["linear-direction"]).toBe("row-reverse");
		});

		it("wrap switches the container to flex + flex-wrap", () => {
			const app = mount(() => m(Stack, { wrap: true }, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style.display).toBe("flex");
			expect(style["flex-direction"]).toBe("column");
			expect(style["flex-wrap"]).toBe("wrap");
		});

		it("gap/rowGap/columnGap and align/justify map to the expected CSS properties", () => {
			const app = mount(() => m(Stack, { gap: 12, rowGap: 4, columnGap: 8, align: "center", justify: "space-between" }, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style.gap).toBe("12px");
			expect(style["row-gap"]).toBe("4px");
			expect(style["column-gap"]).toBe("8px");
			expect(style["align-items"]).toBe("center");
			expect(style["justify-content"]).toBe("space-between");
		});

		it("a caller's own style overrides the computed one for the same property", () => {
			const app = mount(() => m(Stack, { gap: 12, style: { gap: "99px" } }, m("text", "a")));
			expect(styleOf(app, app.root).gap).toBe("99px");
		});

		it("Row forces direction: row regardless of a passed direction", () => {
			const app = mount(() => m(Row, { direction: "column" } as any, m("text", "a")));
			expect(styleOf(app, app.root)["linear-direction"]).toBe("row");
		});

		it("Column forces direction: column regardless of a passed direction", () => {
			const app = mount(() => m(Column, { direction: "row" } as any, m("text", "a")));
			expect(styleOf(app, app.root)["linear-direction"]).toBe("column");
		});
	});

	describe("Center", () => {
		it("centers on both axes via flex", () => {
			const app = mount(() => m(Center, {}, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style.display).toBe("flex");
			expect(style["align-items"]).toBe("center");
			expect(style["justify-content"]).toBe("center");
		});
	});

	describe("Spacer", () => {
		it("sets both flex and linear-weight so it works in either parent mode", () => {
			const app = mount(() => m(Spacer, {}));
			const style = styleOf(app, app.root);
			expect(style.flex).toBe("1");
			expect(style["linear-weight"]).toBe("1");
		});
	});

	describe("ZStack", () => {
		it("makes the container relative and pins every child to fill it, in order", () => {
			const app = mount(() => m(ZStack, { style: { width: "100px", height: "100px" } }, [m("text", "back"), m("text", "front")]));
			const container = app.root;
			expect(styleOf(app, container).position).toBe("relative");

			const layer1 = container.firstChild!;
			const layer2 = layer1.nextSibling!;
			expect(textOf(layer1)).toBe("back");
			expect(textOf(layer2)).toBe("front");
			for (const layer of [layer1, layer2]) {
				const style = styleOf(app, layer);
				expect(style.position).toBe("absolute");
				expect(style.top).toBe("0px");
				expect(style.left).toBe("0px");
				expect(style.right).toBe("0px");
				expect(style.bottom).toBe("0px");
			}
		});
	});

	describe("Grid", () => {
		it("a numeric columns/rows becomes repeat(n, 1fr); a string passes through", () => {
			const app = mount(() => m(Grid, { columns: 3, rows: "100px auto" }, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style.display).toBe("grid");
			expect(style["grid-template-columns"]).toBe("repeat(3, 1fr)");
			expect(style["grid-template-rows"]).toBe("100px auto");
		});

		it("gap/autoFlow/content+items alignment map to the expected CSS properties", () => {
			const app = mount(() =>
				m(
					Grid,
					{ gap: 16, autoFlow: "row dense", justifyContent: "center", alignContent: "start", justifyItems: "stretch", alignItems: "end" },
					m("text", "a"),
				),
			);
			const style = styleOf(app, app.root);
			expect(style.gap).toBe("16px");
			expect(style["grid-auto-flow"]).toBe("row dense");
			expect(style["justify-content"]).toBe("center");
			expect(style["align-content"]).toBe("start");
			expect(style["justify-items"]).toBe("stretch");
			expect(style["align-items"]).toBe("end");
		});
	});

	describe("GridItem", () => {
		it("colStart/rowStart and explicit colEnd/rowEnd are set verbatim", () => {
			const app = mount(() => m(GridItem, { colStart: 1, colEnd: 3, rowStart: 2, rowEnd: 4 }, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style["grid-column-start"]).toBe("1");
			expect(style["grid-column-end"]).toBe("3");
			expect(style["grid-row-start"]).toBe("2");
			expect(style["grid-row-end"]).toBe("4");
		});

		it("colSpan/rowSpan emit a span-N end value when no explicit end is given", () => {
			const app = mount(() => m(GridItem, { colSpan: 2, rowSpan: 3 }, m("text", "a")));
			const style = styleOf(app, app.root);
			expect(style["grid-column-end"]).toBe("span 2");
			expect(style["grid-row-end"]).toBe("span 3");
		});

		it("an explicit colEnd/rowEnd takes precedence over colSpan/rowSpan", () => {
			const app = mount(() => m(GridItem, { colEnd: 5, colSpan: 2 }, m("text", "a")));
			expect(styleOf(app, app.root)["grid-column-end"]).toBe("5");
		});
	});

	describe("Divider", () => {
		it("defaults to horizontal: full width, thickness as height", () => {
			const app = mount(() => m(Divider, {}));
			const divider = app.root;
			expect(divider.className).toContain("ui-divider");
			expect(divider.className).toContain("ui-divider--horizontal");
			const style = styleOf(app, divider);
			expect(style.width).toBe("100%");
			expect(style.height).toBe("1px");
		});

		it("orientation: vertical fills height, thickness as width", () => {
			const app = mount(() => m(Divider, { orientation: "vertical", thickness: 2 }));
			const divider = app.root;
			expect(divider.className).toContain("ui-divider--vertical");
			const style = styleOf(app, divider);
			expect(style.width).toBe("2px");
			expect(style.height).toBe("100%");
		});
	});

	describe("AspectRatio", () => {
		it("sets aspect-ratio and defaults width to 100%", () => {
			const app = mount(() => m(AspectRatio, { ratio: 16 / 9 }, m("text", "a")));
			const style = styleOf(app, app.root);
			// layout.js authors this one as a literal dash-case key ("aspect-ratio")
			// rather than through the camelCase style-object path everything
			// else in this file uses — v2's style proxy only converts
			// camelCase->dash-case, so an already-dash-case key reaches
			// __AddInlineStyle unchanged (see fake-dom.js's DASH_CASE check).
			expect(style["aspect-ratio"]).toBe(String(16 / 9));
			expect(style.width).toBe("100%");
		});
	});
});
