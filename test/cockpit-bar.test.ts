import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { Component } from "@earendil-works/pi-tui";
import { installCockpitBarGradient } from "../extensions/zentui/cockpit-bar";
import { setGradientTheme } from "../extensions/zentui/gradient";
import { setColorMode } from "../extensions/shared/color";

const PINK = [242, 167, 198];
const SKY = [159, 211, 242];

const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const gradientCodes = (text: string) => [...text.matchAll(/\x1b\[38;2;\d+;\d+;\d+m/g)].map((match) => match[0]);

/** Effective foreground of every visible character, in line order. */
function visibleColors(painted: string): string[] {
	const colors: string[] = [];
	let current = "";
	for (const part of painted.split(/(\x1b\[[0-9;]*m)/g)) {
		if (part.startsWith("\x1b[")) {
			if (/^\x1b\[38;2;\d+;\d+;\d+m$/.test(part)) current = part;
			continue;
		}
		for (const char of part) if (char !== " ") colors.push(current);
	}
	return colors;
}

const PLAIN_LINE = "▸ ○ @main · 空闲                                Alt+R Agent";

/** The bar as Cockpit paints it: chip foregrounds, then the dim shortcut hint. */
function cockpitLine(padding = 32): string {
	const fg = (text: string) => `\x1b[38;5;250m${text}\x1b[39m`;
	return `${fg("▸")} ${fg("○")} \x1b[1m@main\x1b[22m${fg(" · 空闲")}${" ".repeat(padding)}${fg("Alt+R Agent")}`;
}

function harness() {
	const mounted = new Map<string, unknown>();
	const originalSetWidget = (key: string, content?: unknown): void => {
		if (typeof content === "function") mounted.set(key, content);
		else mounted.delete(key);
	};
	const ctx = { ui: { setWidget: originalSetWidget } };
	const cleanup = installCockpitBarGradient(ctx as never);
	const mount = (key: string, line: string) => {
		// The host calls the factory it received, so tests call that one back.
		ctx.ui.setWidget(key, (() => ({
			render: () => [line],
			invalidate: () => {},
			dispose: () => {},
		})) as unknown as () => Component);
		return mounted.get(key) as unknown as () => Component;
	};
	return { ctx, cleanup, mount, originalSetWidget };
}

afterEach(() => {
	setColorMode("truecolor");
	setGradientTheme(undefined);
});

test("the cockpit bar is repainted with the pack gradient, hint included", () => {
	const h = harness();
	const line = cockpitLine();
	const rendered = h.mount("cockpit-session-bar", line)().render(90) as string[];

	assert.equal(rendered.length, 1);
	assert.equal(strip(rendered[0]!), strip(line), "text is untouched");
	assert.match(rendered[0]!, /^\x1b\[38;5;250m\x1b\[38;2;242;167;198m▸/, "the sweep opens on the muelsyse pink");
	assert.match(rendered[0]!, /\x1b\[38;2;\d+;\d+;\d+mA/, "the Alt+R hint is painted too");
	h.cleanup();
});

test("the sweep spans the visible content, ending on sky", () => {
	const h = harness();
	const painted = (h.mount("cockpit-session-bar", cockpitLine())().render(150) as string[])[0]!;
	const colors = visibleColors(painted);
	assert.deepEqual(colors[0], `\x1b[38;2;${PINK.join(";")}m`);
	assert.deepEqual(colors.at(-1), `\x1b[38;2;${SKY.join(";")}m`, "the hint closes on the sky stop");
	assert.ok(new Set(colors).size >= 15, `visible characters walk the spectrum (${new Set(colors).size} distinct colors)`);
	h.cleanup();
});

test("padding does not consume the sweep", () => {
	const h = harness();
	const paint = (line: string) => visibleColors((h.mount("cockpit-session-bar", line)().render(150) as string[])[0]!);
	assert.deepEqual(paint(cockpitLine(120)), paint(cockpitLine(0)), "the same content keeps the same colors at any width");
	h.cleanup();
});

test("a theme that collapses the gradient roles still gets the pack rainbow", () => {
	// The synced Noctalia palette maps mdCode/success and warning/mdLink to one color each.
	const collapsed = { kind: "rgb" as const, r: 223, g: 189, b: 204 };
	setGradientTheme({
		colors: { accent: collapsed, mdCode: collapsed, success: collapsed, warning: collapsed, mdLink: collapsed } as never,
	});
	const h = harness();
	const colors = visibleColors((h.mount("cockpit-session-bar", cockpitLine())().render(150) as string[])[0]!);
	assert.ok(new Set(colors).size >= 15, "the bar keeps its own palette instead of the flattened theme stops");
	assert.deepEqual(colors[0], `\x1b[38;2;${PINK.join(";")}m`);
	h.cleanup();
});

test("other widget keys are left alone even when their text matches", () => {
	const h = harness();
	const line = cockpitLine();
	const rendered = h.mount("todo-panel", line)().render(90) as string[];
	assert.equal(rendered[0], line, "no gradient pass on a foreign widget");
	h.cleanup();
});

test("a bar re-mounted later is decorated too", () => {
	const h = harness();
	h.mount("cockpit-session-bar", cockpitLine());
	const rendered = h.mount("cockpit-session-bar", cockpitLine())().render(90) as string[];
	assert.ok(gradientCodes(rendered[0]!).length > 0, "each mount is decorated");
	h.ctx.ui.setWidget("cockpit-session-bar", undefined);
	h.cleanup();
});

test("cleanup restores the host slot and the component's own render", () => {
	const h = harness();
	const component = h.mount("cockpit-session-bar", cockpitLine())();
	assert.ok(gradientCodes((component.render(90) as string[])[0]!).length > 0);
	h.cleanup();
	assert.equal(h.ctx.ui.setWidget, h.originalSetWidget, "widget slot restored");
	assert.equal((component.render(90) as string[])[0], cockpitLine(), "component render restored");
});

test("color-less terminals receive the plain line", () => {
	setColorMode("none");
	const h = harness();
	const rendered = h.mount("cockpit-session-bar", PLAIN_LINE)().render(80) as string[];
	assert.equal(rendered[0], PLAIN_LINE);
	h.cleanup();
});
