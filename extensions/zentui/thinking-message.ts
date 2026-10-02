import { getColorMode } from "../shared/color";
import { renderMuelsyseGradient } from "./gradient";

/**
 * Hidden-thinking label via Pi's public `ctx.ui.setHiddenThinkingLabel` (Pi >= 0.87.1).
 * Visible thinking blocks are left entirely to Pi (toggle, per-run overrides, mouse, markers).
 */

export const MUELSYSE_HIDDEN_THINKING_LABEL = "✦ Thought";

type HiddenThinkingLabelUi = { setHiddenThinkingLabel?: (label?: string) => void };

export function muelsyseThinkingLabel(): string {
	return getColorMode() === "none"
		? MUELSYSE_HIDDEN_THINKING_LABEL
		: renderMuelsyseGradient(MUELSYSE_HIDDEN_THINKING_LABEL);
}

/** Set (or with `enabled = false`, restore Pi's default) hidden-thinking label. No-op if unsupported. */
export function applyThinkingLabel(ctx: { ui?: unknown }, enabled = true): void {
	const ui = ctx.ui as HiddenThinkingLabelUi | undefined;
	if (typeof ui?.setHiddenThinkingLabel !== "function") return;
	try {
		ui.setHiddenThinkingLabel(enabled ? muelsyseThinkingLabel() : undefined);
	} catch {
		// Older/alternate hosts: keep Pi's default label.
	}
}
