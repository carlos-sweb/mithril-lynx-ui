import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { createScope } from "../src/scope/scope.js";
import { mount } from "./harness.js";

// Exercised the same way mithril-lynx v2 core's own end-to-end.test.ts tests
// a real component tree: renderApp() + a real patch replay via
// @lynx-js/testing-environment, so oncreate/onupdate/onremove fire for
// real, not simulated. Mutable test state lives in a closure variable read
// fresh inside a root component's view(), so app.redraw() is enough to
// trigger a real re-diff; no need to mount again.

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

		mount(() => m(Provider, { value: "outer" }, m(Provider, { value: "inner" }, m(Consumer))));

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
		const app = mount(() => m(Provider, { value }, m(Consumer)));
		expect(seen.at(-1)).toBe(1);

		value = 2;
		app.redraw();
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
		const app = mount(() =>
			m(
				Provider,
				{ value: "outer" },
				showInner ? m(Provider, { value: "inner" }, m(Consumer)) : m(Consumer),
			),
		);
		expect(seen.at(-1)).toBe("inner");

		showInner = false;
		app.redraw();
		expect(seen.at(-1)).toBe("outer");
	});

	it("accepts keyed children without tripping Mithril's all-keyed-or-none rule", () => {
		// Regression: the Provider used to put its own (unkeyed) pop marker in the
		// same sibling list as the caller's children, which threw "In fragments,
		// vnodes must either all have keys or none have keys" as soon as those
		// children were keyed — caught on device, not by the original tests.
		const { Provider, useScope } = createScope<string>();
		const seen: (string | undefined)[] = [];
		const Item = {
			view: () => {
				seen.push(useScope());
				return m("text");
			},
		};

		expect(() =>
			mount(() =>
				m(
					Provider,
					{ value: "v" },
					["a", "b", "c"].map((id) => m(Item, { key: id })),
				),
			),
		).not.toThrow();

		expect(seen).toEqual(["v", "v", "v"]);
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

		mount(() => m(scopeA.Provider, { value: "a" }, m(Consumer)));

		expect(seenA.at(-1)).toBe("a");
		expect(seenB.at(-1)).toBeUndefined();
	});
});
