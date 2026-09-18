import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { AspectRatio, Box, Center, Column, Divider, Grid, GridItem, Row, Spacer, Stack, ZStack } from "../src/layout/layout.js";

// layout.js is pure structural CSS on <view> — no gestures, no presence, no
// scope. These tests just assert the emitted class/style contract for each
// primitive, mirroring button.test.ts's own plain mount()/papiCalls() style.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mount(view: () => unknown): any {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  return shimModule.renderToPage(page, m({ view })) as any;
}

const papiCalls = (): { fn: string; args: unknown[] }[] => (globalThis as any).__papiCalls;
const classOf = (node: any): string =>
  (papiCalls().filter((c) => c.fn === "__SetClasses" && c.args[0] === node._handle).at(-1)?.args[1] as string) ?? "";
// The shim's own LynxStyleProxy camelize()s every style key AND
// String()-ifies every value before it ever reaches __SetInlineStyles
// (see lynx-mithril-shim.js's own header: "Accepts BOTH setProperty
// ('font-size', v) and style['fontSize'] = v; all keys are camelize()'d").
// layout.js itself authors kebab-case keys (e.g. "linear-direction"),
// matching every other component in this project — read this back with
// the SAME camelCase names native actually receives, and expect every
// value (including numbers) as a string.
const styleOf = (node: any): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const call of papiCalls()) {
    if (call.fn === "__SetInlineStyles" && call.args[0] === node._handle) Object.assign(out, call.args[1] as Record<string, unknown>);
  }
  return out;
};

describe("layout.js", () => {
  describe("Box", () => {
    it("renders a plain <view> with class/style passthrough", () => {
      const root = mount(() => m(Box, { className: "card", style: { padding: "8px" } }, m("text", "hola")));
      const box = root.firstChild;
      expect(box._tag).toBe("view");
      expect(box.textContent).toBe("hola");
      expect(classOf(box)).toBe("card");
      expect(styleOf(box).padding).toBe("8px");
    });
  });

  describe("Stack / Row / Column", () => {
    it("defaults to a vertical linear container", () => {
      const root = mount(() => m(Stack, {}, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.display).toBe("linear");
      expect(style.linearDirection).toBe("column");
    });

    it("direction: row switches linear-direction, reverse appends -reverse", () => {
      const root = mount(() => m(Stack, { direction: "row", reverse: true }, m("text", "a")));
      expect(styleOf(root.firstChild).linearDirection).toBe("row-reverse");
    });

    it("wrap switches the container to flex + flex-wrap", () => {
      const root = mount(() => m(Stack, { wrap: true }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.display).toBe("flex");
      expect(style.flexDirection).toBe("column");
      expect(style.flexWrap).toBe("wrap");
    });

    it("gap/rowGap/columnGap and align/justify map to the expected CSS properties", () => {
      const root = mount(() => m(Stack, { gap: 12, rowGap: 4, columnGap: 8, align: "center", justify: "space-between" }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.gap).toBe("12px");
      expect(style.rowGap).toBe("4px");
      expect(style.columnGap).toBe("8px");
      expect(style.alignItems).toBe("center");
      expect(style.justifyContent).toBe("space-between");
    });

    it("a caller's own style overrides the computed one for the same property", () => {
      const root = mount(() => m(Stack, { gap: 12, style: { gap: "99px" } }, m("text", "a")));
      expect(styleOf(root.firstChild).gap).toBe("99px");
    });

    it("Row forces direction: row regardless of a passed direction", () => {
      const root = mount(() => m(Row, { direction: "column" } as any, m("text", "a")));
      expect(styleOf(root.firstChild).linearDirection).toBe("row");
    });

    it("Column forces direction: column regardless of a passed direction", () => {
      const root = mount(() => m(Column, { direction: "row" } as any, m("text", "a")));
      expect(styleOf(root.firstChild).linearDirection).toBe("column");
    });
  });

  describe("Center", () => {
    it("centers on both axes via flex", () => {
      const root = mount(() => m(Center, {}, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.display).toBe("flex");
      expect(style.alignItems).toBe("center");
      expect(style.justifyContent).toBe("center");
    });
  });

  describe("Spacer", () => {
    it("sets both flex and linear-weight so it works in either parent mode", () => {
      const root = mount(() => m(Spacer, {}));
      const style = styleOf(root.firstChild);
      expect(style.flex).toBe("1");
      expect(style.linearWeight).toBe("1"); // stringified by the shim, like every other style value
    });
  });

  describe("ZStack", () => {
    it("makes the container relative and pins every child to fill it, in order", () => {
      const root = mount(() => m(ZStack, { style: { width: "100px", height: "100px" } }, [m("text", "back"), m("text", "front")]));
      const container = root.firstChild;
      expect(styleOf(container).position).toBe("relative");

      const layer1 = container.firstChild;
      const layer2 = layer1.nextSibling;
      expect(layer1.textContent).toBe("back");
      expect(layer2.textContent).toBe("front");
      for (const layer of [layer1, layer2]) {
        const style = styleOf(layer);
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
      const root = mount(() => m(Grid, { columns: 3, rows: "100px auto" }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.display).toBe("grid");
      expect(style.gridTemplateColumns).toBe("repeat(3, 1fr)");
      expect(style.gridTemplateRows).toBe("100px auto");
    });

    it("gap/autoFlow/content+items alignment map to the expected CSS properties", () => {
      const root = mount(() =>
        m(
          Grid,
          { gap: 16, autoFlow: "row dense", justifyContent: "center", alignContent: "start", justifyItems: "stretch", alignItems: "end" },
          m("text", "a"),
        ),
      );
      const style = styleOf(root.firstChild);
      expect(style.gap).toBe("16px");
      expect(style.gridAutoFlow).toBe("row dense");
      expect(style.justifyContent).toBe("center");
      expect(style.alignContent).toBe("start");
      expect(style.justifyItems).toBe("stretch");
      expect(style.alignItems).toBe("end");
    });
  });

  describe("GridItem", () => {
    it("colStart/rowStart and explicit colEnd/rowEnd are set verbatim", () => {
      const root = mount(() => m(GridItem, { colStart: 1, colEnd: 3, rowStart: 2, rowEnd: 4 }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.gridColumnStart).toBe("1");
      expect(style.gridColumnEnd).toBe("3");
      expect(style.gridRowStart).toBe("2");
      expect(style.gridRowEnd).toBe("4");
    });

    it("colSpan/rowSpan emit a span-N end value when no explicit end is given", () => {
      const root = mount(() => m(GridItem, { colSpan: 2, rowSpan: 3 }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.gridColumnEnd).toBe("span 2");
      expect(style.gridRowEnd).toBe("span 3");
    });

    it("an explicit colEnd/rowEnd takes precedence over colSpan/rowSpan", () => {
      const root = mount(() => m(GridItem, { colEnd: 5, colSpan: 2 }, m("text", "a")));
      expect(styleOf(root.firstChild).gridColumnEnd).toBe("5");
    });
  });

  describe("Divider", () => {
    it("defaults to horizontal: full width, thickness as height", () => {
      const root = mount(() => m(Divider, {}));
      const divider = root.firstChild;
      expect(classOf(divider)).toContain("ui-divider");
      expect(classOf(divider)).toContain("ui-divider--horizontal");
      const style = styleOf(divider);
      expect(style.width).toBe("100%");
      expect(style.height).toBe("1px");
    });

    it("orientation: vertical fills height, thickness as width", () => {
      const root = mount(() => m(Divider, { orientation: "vertical", thickness: 2 }));
      const divider = root.firstChild;
      expect(classOf(divider)).toContain("ui-divider--vertical");
      const style = styleOf(divider);
      expect(style.width).toBe("2px");
      expect(style.height).toBe("100%");
    });
  });

  describe("AspectRatio", () => {
    it("sets aspect-ratio and defaults width to 100%", () => {
      const root = mount(() => m(AspectRatio, { ratio: 16 / 9 }, m("text", "a")));
      const style = styleOf(root.firstChild);
      expect(style.aspectRatio).toBe(String(16 / 9));
      expect(style.width).toBe("100%");
    });
  });
});
