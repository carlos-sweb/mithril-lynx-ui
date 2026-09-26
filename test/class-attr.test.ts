import { describe, expect, it } from "@rstest/core";
import m from "mithril-runtime";
import { mount } from "./harness.js";
import { classOf } from "../src/internal/cx.js";
import { Button } from "../src/button/button.js";
import { Switch } from "../src/switch/switch.js";
import { Checkbox } from "../src/checkbox/checkbox.js";
import { RadioGroup, Radio } from "../src/radio-group/radio-group.js";
import { Input, TextArea } from "../src/input/input.js";
import { Draggable } from "../src/draggable/draggable.js";
import { SliderRoot } from "../src/slider/slider.js";
import { List } from "../src/list/list.js";
import { FeedList } from "../src/feed-list/feed-list.js";
import { Box, Stack, Row, Column, Center, Grid, Divider, AspectRatio } from "../src/layout/layout.js";
import { Swiper } from "../src/swiper/swiper.js";
import { SwipeAction } from "../src/swipe-action/swipe-action.js";
import { InputOTP } from "../src/input-otp/input-otp.js";
import { LazyComponent } from "../src/lazy-component/lazy-component.js";

// Mithril code passes `class` to a component the way it does to an element;
// lynx-ui code passes `className`. Every component accepts both, combined
// (internal/cx.js's classOf) — before, `class` was silently dropped.

function classesUnder(node: any, out: string[] = []): string[] {
	if (node == null) return out;
	if (node._className) out.push(...String(node._className).split(" "));
	for (let child = node.firstChild; child; child = child.nextSibling) classesUnder(child, out);
	return out;
}

// Swiper/SwipeAction write their initial transform from oncreate, retried a
// microtask later; let that settle before the next mount replaces the page.
const settle = () => new Promise((r) => setTimeout(r, 0));

async function classesOf(vnode: () => unknown): Promise<string[]> {
	const app = mount(vnode);
	await settle();
	return classesUnder(app.root);
}

const listProps = { items: ["a"], renderItem: (item: string) => m("text", item), getItemKey: (item: string) => item };

const components: [string, (attrs: Record<string, unknown>) => unknown][] = [
	["Button", (a) => m(Button, a)],
	["Switch", (a) => m(Switch, a)],
	["Checkbox", (a) => m(Checkbox, a)],
	["Radio", (a) => m(RadioGroup, { defaultValue: "x" }, m(Radio, { value: "x", ...a }))],
	["Input", (a) => m(Input, a)],
	["TextArea", (a) => m(TextArea, a)],
	["Draggable", (a) => m(Draggable, a)],
	["SliderRoot", (a) => m(SliderRoot, a)],
	["List", (a) => m(List, { ...listProps, ...a })],
	["FeedList", (a) => m(FeedList, { ...listProps, ...a })],
	["Box", (a) => m(Box, a)],
	["Stack", (a) => m(Stack, a)],
	["Row", (a) => m(Row, a)],
	["Column", (a) => m(Column, a)],
	["Center", (a) => m(Center, a)],
	["Grid", (a) => m(Grid, a)],
	["Divider", (a) => m(Divider, a)],
	["AspectRatio", (a) => m(AspectRatio, a)],
	["Swiper", (a) => m(Swiper, { items: [1], renderItem: () => m("view"), ...a })],
	["SwipeAction", (a) => m(SwipeAction, a)],
	["InputOTP", (a) => m(InputOTP, a)],
	["LazyComponent", (a) => m(LazyComponent, a)],
];

describe("class and className on components", () => {
	for (const [name, render] of components) {
		it(`${name} accepts class, className, and both`, async () => {
			expect(await classesOf(() => render({ class: "from-class" }))).toContain("from-class");
			expect(await classesOf(() => render({ className: "from-classname" }))).toContain("from-classname");
			const both = await classesOf(() => render({ class: "a", className: "b" }));
			expect(both).toContain("a");
			expect(both).toContain("b");
		});
	}

	it("a class set in a component's raw *Props bag is kept, not overwritten", () => {
		expect(classesUnder(mount(() => m(Box, { class: "outer", boxProps: { class: "bag" } })).root)).toEqual(
			expect.arrayContaining(["outer", "bag"]),
		);
		expect(classesUnder(mount(() => m(Input, { inputProps: { class: "bag" } })).root)).toContain("bag");
	});

	it("a class is applied once, not duplicated through a wrapper (Row -> Stack)", () => {
		const classes = classesUnder(mount(() => m(Row, { class: "once" })).root);
		expect(classes.filter((c) => c === "once")).toHaveLength(1);
	});

	it("classOf combines class then className, and is undefined when there are none", () => {
		expect(classOf({ class: "a", className: "b" })).toBe("a b");
		expect(classOf({}, { class: "c" })).toBe("c");
		expect(classOf({ class: "", className: null })).toBeUndefined();
	});
});
