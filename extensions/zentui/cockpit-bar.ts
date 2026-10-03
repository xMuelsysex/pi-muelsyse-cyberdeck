import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { renderMacaronContentGradient } from "./gradient";
import { installPrototypePatch } from "./prototype-patch-registry";

/**
 * Cockpit renders its agent/session bar into the host widget slot above the
 * editor (`AGENT_BAR_WIDGET_KEY`), so the pack styles that bar by wrapping the
 * widget slot instead of patching Cockpit: Cockpit updates keep the gradient,
 * and a renamed key only costs the gradient, never an error.
 *
 * The pack's extensions load before Cockpit's in the preview, and Pi runs
 * `session_start` handlers in load order, so wrapping here covers the first
 * mount. A mount that happened earlier is repainted on Cockpit's next bar
 * re-mount.
 */
const COCKPIT_BAR_WIDGET_KEYS = new Set(["cockpit-session-bar"]);

type WidgetComponent = Component & { dispose?(): void };
type WidgetFactory = (tui: TUI, theme: Theme) => WidgetComponent;
type WidgetSlot = (key: string, content: WidgetFactory | string[] | undefined, options?: unknown) => void;

export function installCockpitBarGradient(ctx: ExtensionContext): () => void {
	const cleanups: (() => void)[] = [];
	let active = true;

	const decorate = (component: WidgetComponent) => {
		cleanups.push(
			installPrototypePatch(component, "render", "cockpit-bar-render", ({ predecessor, receiver, args }) => {
				const lines = Reflect.apply(predecessor, receiver, args);
				return Array.isArray(lines)
					? lines.map((line: unknown) => (typeof line === "string" ? renderMacaronContentGradient(line) : line))
					: lines;
			}),
		);
	};

	const original = ctx.ui.setWidget as unknown as WidgetSlot;
	const wrap = ((key: string, content?: WidgetFactory | string[] | undefined, options?: unknown) => {
		const decorateBar = typeof content === "function" && active && COCKPIT_BAR_WIDGET_KEYS.has(key);
		original.call(
			ctx.ui,
			key,
			decorateBar
				? (tui: TUI, theme: Theme) => {
						const component = (content as WidgetFactory)(tui, theme);
						decorate(component);
						return component;
					}
				: content,
			options,
		);
	}) as typeof ctx.ui.setWidget;
	ctx.ui.setWidget = wrap;

	return () => {
		active = false;
		if (ctx.ui.setWidget === wrap) ctx.ui.setWidget = original as unknown as typeof ctx.ui.setWidget;
		for (const cleanup of cleanups.reverse()) cleanup();
	};
}
