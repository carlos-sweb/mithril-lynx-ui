import { describe, expect, it } from "@rstest/core";
import m from "mithril";
import shim from "mithril-lynx";
import { createScope } from "../scope.js";

// Exercised the same way mithril-lynx core's own navigation.test.ts tests a
// real component tree: shim.renderToPage() against a real page wrapper from
// the testing environment's PAPI polyfill, so oncreate/onupdate/onremove
// fire for real, not simulated. Mutable test state lives in a closure
// variable read fresh inside a root component's view() — the same pattern
// navigation.js itself uses (see its `top()`) — so a bare shim.redraw() is
// enough to trigger a real re-diff; no need to call renderToPage() again.

const shimModule = ((shim as any).default ?? shim) as {
  renderToPage(pageElement: unknown, vnode: unknown): unknown;
  redraw(): void;
};

function mountRoot(view: () => unknown) {
  lynxTestingEnv.switchToMainThread();
  const page = __CreatePage("0", 0);
  const Root = { view };
  shimModule.renderToPage(page, m(Root));
}

describe("scope.js", () => {
  it("useScope() returns undefined with no Provider mounted", () => {
    const { useScope } = createScope<string>();
    expect(useScope()).toBeUndefined();
  });

  it("a descendant sees the nearest (innermost) Provider's value", () => {
    const { Provider, useScope } = createScope<string>();
    const seen: (string | undefined)[] = [];
    const Consumer = {
      view: () => {
        seen.push(useScope());
        return m("text");
      },
    };

    mountRoot(() => m(Provider, { value: "outer" }, m(Provider, { value: "inner" }, m(Consumer))));

    expect(seen).toEqual(["inner"]);
  });

  it("onupdate: a Provider's new value is visible to descendants in the same redraw pass", () => {
    const { Provider, useScope } = createScope<number>();
    const seen: (number | undefined)[] = [];
    const Consumer = {
      view: () => {
        seen.push(useScope());
        return m("text");
      },
    };

    let value = 1;
    mountRoot(() => m(Provider, { value }, m(Consumer)));
    expect(seen.at(-1)).toBe(1);

    value = 2;
    shimModule.redraw();
    expect(seen.at(-1)).toBe(2);
  });

  it("onremove: unmounting the inner Provider falls back to the next-outer one", () => {
    const { Provider, useScope } = createScope<string>();
    const seen: (string | undefined)[] = [];
    const Consumer = {
      view: () => {
        seen.push(useScope());
        return m("text");
      },
    };

    let showInner = true;
    mountRoot(() =>
      m(
        Provider,
        { value: "outer" },
        showInner ? m(Provider, { value: "inner" }, m(Consumer)) : m(Consumer),
      ),
    );
    expect(seen.at(-1)).toBe("inner");

    showInner = false;
    shimModule.redraw();
    expect(seen.at(-1)).toBe("outer");
  });

  it("two independent scopes never see each other's Providers", () => {
    const scopeA = createScope<string>();
    const scopeB = createScope<string>();
    const seenA: (string | undefined)[] = [];
    const seenB: (string | undefined)[] = [];
    const Consumer = {
      view: () => {
        seenA.push(scopeA.useScope());
        seenB.push(scopeB.useScope());
        return m("text");
      },
    };

    mountRoot(() => m(scopeA.Provider, { value: "a" }, m(Consumer)));

    expect(seenA.at(-1)).toBe("a");
    expect(seenB.at(-1)).toBeUndefined();
  });
});
