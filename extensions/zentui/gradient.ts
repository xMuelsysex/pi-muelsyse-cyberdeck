import type { Theme } from "@earendil-works/pi-coding-agent";
import { colorToHex } from "@earendil-works/pi-tui";
import { fgAnsi, getColorMode, hexToRgb, paintFg } from "../shared/color";

export type RGB = readonly [number, number, number];

export const MUELSYSE_MACARON_GRADIENT = "muelsyse-macaron-gradient";
const MUELSYSE_MACARON_STOPS: readonly [RGB, RGB, RGB, RGB, RGB] = [
	[242, 167, 198], // pink         #F2A7C6
	[252, 201, 185], // cherry pink  #FCC9B9
	[239, 195, 230], // petal        #EFC3E6
	[199, 184, 245], // lavender     #C7B8F5
	[159, 211, 242], // sky macaron  #9FD3F2
];
const MUELSYSE_MACARON_CACHE_KEY = MUELSYSE_MACARON_STOPS.map((stop) => stop.join(",")).join(";");

type ActiveGradientPalette = {
	colors: Theme["colors"];
	stops: readonly RGB[];
	cacheKey: string;
	gauge: { warning: RGB; error: RGB; muted: RGB };
};
let activeTheme: Pick<Theme, "colors"> | undefined;
let activePalette: ActiveGradientPalette | undefined;

const RESET = "\x1b[0m";
const GRADIENT_CACHE_LIMIT = 256;
/** LRU of static (phase 0) gradients; animated frames are never cached. */
const gradientCache = new Map<string, string>();
let gradientCacheMode = getColorMode();

export function setGradientTheme(theme?: Pick<Theme, "colors">): void {
	activeTheme = theme;
	activePalette = undefined;
	gradientCache.clear();
	gradientCacheMode = getColorMode();
}

function currentThemePalette(): ActiveGradientPalette | undefined {
	const colors = activeTheme?.colors;
	if (!colors) return undefined;
	// Pi replaces the colors object when the active theme or terminal palette changes.
	if (activePalette?.colors !== colors) {
		// Muelsyse 的 Noctalia 模板保留这些角色映射和原有五段渐变。
		const stops: readonly RGB[] = [
			hexToRgb(colorToHex(colors.accent)),
			hexToRgb(colorToHex(colors.mdCode)),
			hexToRgb(colorToHex(colors.success)),
			hexToRgb(colorToHex(colors.warning)),
			hexToRgb(colorToHex(colors.mdLink)),
		];
		activePalette = {
			colors,
			stops,
			cacheKey: stops.map((stop) => stop.join(",")).join(";"),
			gauge: {
				warning: hexToRgb(colorToHex(colors.warning)),
				error: hexToRgb(colorToHex(colors.error)),
				muted: hexToRgb(colorToHex(colors.muted)),
			},
		};
	}
	return activePalette;
}

function gradientCacheKey(text: string, paletteKey: string): string {
	return `${paletteKey}\0${text}`;
}

/** Soft period for footer shimmer / pulse (ms). */
const FOOTER_PULSE_PERIOD_MS = 1800;

export function mix(from: RGB, to: RGB, amount: number): RGB {
	const t = Math.max(0, Math.min(1, amount));
	return [
		Math.round(from[0] + (to[0] - from[0]) * t),
		Math.round(from[1] + (to[1] - from[1]) * t),
		Math.round(from[2] + (to[2] - from[2]) * t),
	];
}

/** Continuous 0..1 phase from wall clock. */
export function pulsePhase(now = Date.now(), periodMs = FOOTER_PULSE_PERIOD_MS): number {
	const p = periodMs > 0 ? periodMs : FOOTER_PULSE_PERIOD_MS;
	return (((now % p) + p) % p) / p;
}

function sampleStops(stops: readonly RGB[], position: number, phase = 0): RGB {
	// Keep phase shimmer as a true 0..1 wrap; bare position=1 must hit the last stop.
	const clamped = Math.max(0, Math.min(1, position));
	const normalized = phase === 0 ? clamped : (((clamped + phase) % 1) + 1) % 1;
	const scaled = normalized * (stops.length - 1);
	const index = Math.min(stops.length - 2, Math.floor(scaled));
	const from = stops[index] ?? stops[0] ?? [242, 167, 198];
	const to = stops[index + 1] ?? from;
	return mix(from, to, scaled - index);
}

function sampleMuelsyseGradient(stops: readonly RGB[], position: number, phase = 0): RGB {
	return sampleStops(stops, position, phase);
}

const graphemeSegmenter =
	typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
		? new Intl.Segmenter(undefined, { granularity: "grapheme" })
		: undefined;

/** Split into user-perceived characters; ASCII fast path avoids the segmenter. */
export function splitGraphemes(text: string): string[] {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: ASCII range check
	if (/^[\x00-\x7f]*$/.test(text) || !graphemeSegmenter) return [...text];
	return Array.from(graphemeSegmenter.segment(text), (part) => part.segment);
}

function cacheGet(key: string): string | undefined {
	const mode = getColorMode();
	if (mode !== gradientCacheMode) {
		gradientCache.clear();
		gradientCacheMode = mode;
		return undefined;
	}
	const cached = gradientCache.get(key);
	if (cached !== undefined) {
		// Refresh recency (Map preserves insertion order).
		gradientCache.delete(key);
		gradientCache.set(key, cached);
	}
	return cached;
}

function cacheSet(key: string, value: string): void {
	if (gradientCache.size >= GRADIENT_CACHE_LIMIT) {
		const oldest = gradientCache.keys().next().value;
		if (oldest !== undefined) gradientCache.delete(oldest);
	}
	gradientCache.set(key, value);
}

/** Test helper: current number of cached gradient strings. */
export function gradientCacheSize(): number {
	return gradientCache.size;
}

function paintPositions(text: string, colorAt: (position: number) => RGB): string {
	if (getColorMode() === "none") return text;
	// 保留 bold、背景、光标标记及链接，ANSI 控制序列不占渐变位置。
	const parts = text.split(/(\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][\s\S]*?(?:\x07|\x1b\\))/g);
	const count = parts.reduce((total, part, index) =>
		total + (index % 2 === 0 ? splitGraphemes(part).length : 0), 0);
	if (count === 0) return text;
	const span = Math.max(1, count - 1);
	let rendered = "";
	let position = 0;
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index]!;
		if (index % 2 === 1) {
			rendered += part;
			continue;
		}
		for (const char of splitGraphemes(part)) {
			rendered += char === " " ? char : `${fgAnsi(colorAt(position / span))}${char}`;
			position += 1;
		}
	}
	return `${rendered}${RESET}`;
}

/** Render the active Pi theme gradient. Optional phase shifts the stops for shimmer. */
export function renderMuelsyseGradient(text: string, phase = 0): string {
	if (!text) return text;
	const palette = currentThemePalette();
	const stops = palette?.stops ?? MUELSYSE_MACARON_STOPS;
	if (phase !== 0) {
		return paintPositions(text, (pos) => sampleMuelsyseGradient(stops, pos, phase));
	}
	const cacheKey = gradientCacheKey(text, palette?.cacheKey ?? MUELSYSE_MACARON_CACHE_KEY);
	const cached = cacheGet(cacheKey);
	if (cached !== undefined) return cached;
	const rendered = paintPositions(text, (pos) => sampleMuelsyseGradient(stops, pos));
	cacheSet(cacheKey, rendered);
	return rendered;
}

/**
 * Box-frame gradient: active-theme accent at both ends with its macaron spectrum through the middle.
 */
export function renderMuelsyseFrameGradient(text: string): string {
	if (!text) return text;
	const palette = currentThemePalette();
	const stops = palette?.stops ?? MUELSYSE_MACARON_STOPS;
	const cacheKey = `\0frame\0${gradientCacheKey(text, palette?.cacheKey ?? MUELSYSE_MACARON_CACHE_KEY)}`;
	const cached = cacheGet(cacheKey);
	if (cached !== undefined) return cached;
	const rendered = paintPositions(text, (pos) =>
		sampleMuelsyseGradient(stops, pos <= 0.5 ? pos * 2 : (1 - pos) * 2),
	);
	cacheSet(cacheKey, rendered);
	return rendered;
}

/** Context fill palettes — stay macaron, shift with severity. */
export type GaugeTier = "normal" | "warning" | "error";

const WARNING_FILL: RGB = [243, 217, 139]; // solid butter — no pink end that looks "healthy"
const ERROR_FILL: RGB = [255, 143, 163]; // solid coral
const GAUGE_TRACK: RGB = [180, 168, 184]; // soft lilac track, readable on light + dark

/**
 * Macaron gauge body (no frame). Fill walks the muelsyse palette for the normal
 * tier and uses a solid warning/error color otherwise; soft hotspot with phase.
 */
export function renderMacaronGauge(
	percent: number,
	width = 10,
	options: { phase?: number; tier?: GaugeTier } = {},
): string {
	const cells = Math.max(1, Math.floor(width));
	const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
	const filled = Math.round((clamped / 100) * cells);
	const phase = options.phase ?? 0;
	const tier = options.tier ?? "normal";
	const palette = currentThemePalette();
	const stops = palette?.stops ?? MUELSYSE_MACARON_STOPS;
	const warningFill = palette?.gauge.warning ?? WARNING_FILL;
	const errorFill = palette?.gauge.error ?? ERROR_FILL;
	const track = palette?.gauge.muted ?? GAUGE_TRACK;
	let body = "";
	for (let i = 0; i < cells; i++) {
		if (i >= filled) {
			body += paintFg(track, "░");
			continue;
		}
		const base =
			tier === "warning"
				? warningFill
				: tier === "error"
					? errorFill
					: sampleMuelsyseGradient(stops, cells <= 1 ? 0 : i / Math.max(1, filled - 1), phase * 0.2);
		const wave = 0.5 + 0.5 * Math.sin((i / cells + phase) * Math.PI * 2);
		body += paintFg(mix(base, [255, 252, 250], wave * 0.15), "█");
	}
	return body;
}
