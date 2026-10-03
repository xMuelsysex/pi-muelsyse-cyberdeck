/**
 * Muelsyse-macaron Claude-style working spinner for Pi (interactive TUI only).
 *
 * Fork of pi-claude-shimmer, recolored for muelsyse-macaron:
 * - One verb per agent run, swept by a soft white highlight over muelsyse → sky stops
 * - Thinking: the effort tag breathes between its tier color and petal white
 * - Stall: after ~3s without stream updates the verb fades toward coral
 * - Tools: while a tool executes, the verb pulses toward mint
 * - HUD: ( EFFORT · ↑ prompt ↓ output · tok/s · ↻ turns · mm:ss ); "~" marks a live estimate
 *
 * The HUD's live statistics mirror pi-cyber-working-only: upstream/downstream token
 * counters, colour-banded throughput, and the run's model-round counter. Throughput
 * is output tokens over the summed model-request durations (turn start to final
 * message, first-token wait included), the footer telemetry's own definition, so the
 * live figure and the run summary agree.
 *
 * Lightweight by design: a single ~11 Hz clock drives the glyph, sweep, dots and
 * token tween while the agent streams; zero timers when idle; no output outside TUI.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { fgAnsi, getColorMode, paintFg, syncColorMode, type RGB } from "../shared/color";

type SpinnerMode = "requesting" | "thinking" | "responding" | "tool-input" | "tool-use";
export type RunOutcome = "completed" | "aborted" | "error";

// ─── Verbs ────────────────────────────────────────────────────────

export const VERBS = [
  "Baking", "Blooming", "Brewing", "Caramelizing", "Choreographing",
  "Churning", "Cogitating", "Composing", "Concocting", "Contemplating",
  "Crafting", "Crystallizing", "Cultivating", "Deliberating", "Doodling",
  "Dreaming", "Drizzling", "Dusting", "Embellishing", "Enchanting",
  "Fermenting", "Flambéing", "Fluttering", "Folding", "Frosting",
  "Garnishing", "Glazing", "Harmonizing", "Imagining", "Infusing",
  "Kneading", "Leavening", "Marinating", "Meandering", "Mulling",
  "Musing", "Noodling", "Orchestrating", "Percolating", "Polishing",
  "Pondering", "Proofing", "Puttering", "Ruminating", "Sautéing",
  "Sculpting", "Simmering", "Sketching", "Sparkling", "Sprouting",
  "Steeping", "Tempering", "Tinkering", "Unfurling", "Weaving",
  "Whisking", "Zesting",
] as const;

const COMPLETION_VERBS = [
  "Baked", "Brewed", "Churned", "Cooked", "Frosted", "Glazed", "Kneaded",
  "Polished", "Simmered", "Sparkled", "Tempered", "Whisked",
] as const;

// ─── Palette (muelsyse-macaron theme vars) ──────────────────────────

const MUELSYSE: RGB = [242, 167, 198]; // #F2A7C6
const PEACH: RGB = [246, 188, 154]; // #F6BC9A
const PETAL: RGB = [239, 195, 230]; // #EFC3E6
const LAVENDER: RGB = [199, 184, 245]; // #C7B8F5
const SKY: RGB = [159, 211, 242]; // #9FD3F2
const MINT: RGB = [174, 229, 197]; // #AEE5C5
const CORAL: RGB = [255, 143, 163]; // #FF8FA3
const BUTTER: RGB = [243, 217, 139]; // #F3D98B
const MUTED: RGB = [169, 155, 174]; // #A99BAE
const HIGHLIGHT: RGB = [255, 248, 252]; // petal white
const SWEEP_STOPS: readonly RGB[] = [MUELSYSE, PEACH, PETAL, LAVENDER, SKY];

// Claude-style ping-pong spinner glyphs.
const GLYPHS = ["·", "✢", "✳", "✶", "✻", "✽"];
const SPINNER_FRAMES = [...GLYPHS, ...[...GLYPHS].reverse()];

// ─── Timing ───────────────────────────────────────────────────────

/** The only animation clock (~11 Hz). */
export const TICK_MS = 90;
const SHIMMER_BAND = 5;
const DOTS_EVERY_TICKS = 10;
const STALL_TIMEOUT_MS = 3_000;
const STALL_FADE_MS = 2_000;
const THINKING_GLOW_DELAY_MS = 1_800;
const THINKING_GLOW_PERIOD_MS = 1_600;
const TOOL_PULSE_PERIOD_MS = 1_400;

// ─── Pure helpers (exported for tests) ────────────────────────────

export function pickVerb(random: () => number = Math.random): string {
  return VERBS[Math.floor(random() * VERBS.length) % VERBS.length]!;
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** Fixed-width clock: mm:ss, or hh:mm:ss past one hour. */
export function formatDigital(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const mm = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

const SMALL_NUMBER = new Intl.NumberFormat("en-US");
const COMPACT_NUMBER = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

export function formatTokenAmount(n: number): string {
  const value = Math.max(0, Math.round(n));
  return value < 1_000 ? SMALL_NUMBER.format(value) : COMPACT_NUMBER.format(value).replace("K", "k");
}

/** Output tokens per generation second, as the footer telemetry defines it. */
export function tokensPerSecond(outputTokens: number, generationMs: number): number | null {
  if (!(outputTokens > 0) || !(generationMs > 0)) return null;
  return outputTokens / (generationMs / 1000);
}

/** Throughput colour bands (pi-cyber-working-only's thresholds, macaron palette). */
export function tpsColor(tps: number): RGB {
  if (tps >= 100) return MINT;
  if (tps >= 60) return SKY;
  if (tps >= 30) return BUTTER;
  return CORAL;
}

/** Prompt tokens a request reports: uncached input plus both cache buckets. */
export function reportedPromptTokens(message: AssistantTokenMessage | undefined): number {
  const usage = message?.usage;
  const sum = [usage?.input, usage?.cacheWrite, usage?.cacheRead]
    .reduce((total: number, value) => total + (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0), 0);
  return Math.round(sum);
}

/** Fixed-width trailing dots so the HUD never shifts. */
function animatedDots(tick: number): string {
  const cycle = [".  ", ".. ", "..."] as const;
  return cycle[Math.floor(tick / DOTS_EVERY_TICKS) % cycle.length]!;
}

export type AssistantTokenMessage = {
  content?: Array<{
    type?: string;
    text?: string;
    thinking?: string;
    name?: string;
    arguments?: unknown;
  }>;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    totalTokens?: number;
  };
  stopReason?: string;
};

/** Provider-reported output tokens, or null when the provider has not reported any. */
export function reportedOutputTokens(message: AssistantTokenMessage | undefined, final = false): number | null {
  const usage = message?.usage;
  const output = usage?.output;
  if (typeof output !== "number" || !Number.isFinite(output) || output < 0) return null;
  if (output > 0) return Math.round(output);
  // Streaming messages start with zero-filled usage. At message_end, non-zero
  // input/cache/total proves the provider reported usage, so output=0 is real.
  const hasFinalUsage = final && [usage?.input, usage?.cacheRead, usage?.cacheWrite, usage?.totalTokens]
    .some((value) => typeof value === "number" && value > 0);
  return hasFinalUsage ? 0 : null;
}

const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const EMOJI_CHAR = /\p{Extended_Pictographic}/u;
// Extended_Pictographic includes text-style symbols such as © ® ™ ‼ that tokenize like normal chars.
const TEXT_SYMBOLS = new Set(["©", "®", "™", "‼", "⁉", "ℹ", "↔", "↕", "↖", "↗", "↘", "↙"]);

/** Quarter-token units make estimates additive across streamed deltas. */
export function estimateTextTokenUnits(text: string): number {
  let units = 0;
  for (const char of text) {
    if (char.codePointAt(0)! <= 0x7f) units += 1; // ≈ 4 ASCII chars/token
    else if (CJK_CHAR.test(char)) units += 4; // ≈ 1 token
    else if (EMOJI_CHAR.test(char) && !TEXT_SYMBOLS.has(char)) units += 8; // ≈ 2 tokens
    else units += 2;
  }
  return units;
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(estimateTextTokenUnits(text) / 4);
}

type ContentBlock = NonNullable<AssistantTokenMessage["content"]>[number];

function toolCallText(name: string | undefined, args: unknown): string {
  try {
    return (name ?? "") + JSON.stringify(args ?? {});
  } catch {
    return name ?? "";
  }
}

function estimateBlockTokenUnits(block: ContentBlock): number {
  if (block.type === "text" && typeof block.text === "string") return estimateTextTokenUnits(block.text);
  if (block.type === "thinking" && typeof block.thinking === "string") return estimateTextTokenUnits(block.thinking);
  if (block.type === "toolCall") return estimateTextTokenUnits(toolCallText(block.name, block.arguments));
  return 0;
}

export function estimateOutputTokens(message: AssistantTokenMessage | undefined): number {
  const units = message?.content?.reduce((sum, block) => sum + estimateBlockTokenUnits(block), 0) ?? 0;
  return Math.ceil(units / 4);
}

export interface TokenReading {
  tokens: number;
  /** True when the number is (partly) our estimate rather than provider usage. */
  estimated: boolean;
}

/**
 * While streaming, provider usage is often a stub (Anthropic reports output≈1 at
 * message_start), so show whichever is larger; it is only exact when the report
 * already covers the estimate.
 */
export function liveTokenReading(reported: number | null, estimate: number): TokenReading {
  const r = reported ?? 0;
  if (reported !== null && r >= estimate) return { tokens: r, estimated: false };
  return { tokens: Math.max(r, estimate), estimated: estimate > 0 };
}

/**
 * Final usage of a finished assistant message. Only a normal stop is authoritative;
 * aborted/errored messages may carry a stub usage, so they keep the larger value.
 */
export function finalTokenReading(message: AssistantTokenMessage | undefined): TokenReading {
  const reported = reportedOutputTokens(message, true);
  const estimate = estimateOutputTokens(message);
  const interrupted = message?.stopReason === "aborted" || message?.stopReason === "error";
  if (!interrupted && reported !== null) return { tokens: reported, estimated: false };
  return liveTokenReading(reported, estimate);
}

export function outcomeFromStopReason(stopReason: string | undefined): RunOutcome {
  if (stopReason === "aborted") return "aborted";
  if (stopReason === "error") return "error";
  return "completed";
}

/**
 * Plain-text completion notice: only successful runs get one. Pi already reports
 * aborts ("Operation aborted") and errors in the chat, so we stay quiet then.
 */
export function completionNotice(outcome: RunOutcome, elapsedMs: number, random: () => number = Math.random): string | undefined {
  if (outcome !== "completed") return undefined;
  const done = COMPLETION_VERBS[Math.floor(random() * COMPLETION_VERBS.length) % COMPLETION_VERBS.length];
  return `✻ ${done} for ${formatDuration(elapsedMs)}`;
}

/** Ease the displayed counter toward its target (one step per tick). */
export function tweenTokens(displayed: number, target: number): number {
  const gap = target - displayed;
  const distance = Math.abs(gap);
  if (distance === 0) return target;
  const step =
    distance < 8 ? distance :
    distance < 40 ? Math.max(2, Math.ceil(distance * 0.28)) :
    distance < 200 ? Math.max(8, Math.ceil(distance * 0.2)) :
    Math.max(24, Math.ceil(distance * 0.14));
  return displayed + Math.sign(gap) * Math.min(distance, step);
}

export function blend(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function sampleStops(pos: number): RGB {
  const scaled = Math.max(0, Math.min(1, pos)) * (SWEEP_STOPS.length - 1);
  const i = Math.min(SWEEP_STOPS.length - 2, Math.floor(scaled));
  return blend(SWEEP_STOPS[i]!, SWEEP_STOPS[i + 1]!, scaled - i);
}

/**
 * Highlight center for a sweep frame. It starts SHIMMER_BAND cells outside the
 * text and leaves SHIMMER_BAND cells past the other end, so it enters and exits smoothly.
 */
export function sweepPosition(length: number, frame: number, reverse: boolean): number {
  const total = length + SHIMMER_BAND * 2;
  const step = ((frame % total) + total) % total;
  return reverse ? length - 1 + SHIMMER_BAND - step : step - SHIMMER_BAND;
}

/**
 * Macaron sweep with a soft white bloom. `tint` pulls every char toward `tintColor`
 * (stall → coral, tool → mint) while keeping the sweep alive.
 */
export function colorSweep(text: string, frame: number, reverse: boolean, tint = 0, tintColor: RGB = CORAL): string {
  const chars = [...text];
  const pos = sweepPosition(chars.length, frame, reverse);
  const highlight = blend(HIGHLIGHT, tintColor, tint * 0.6);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const base = blend(sampleStops(chars.length <= 1 ? 0 : i / (chars.length - 1)), tintColor, tint);
    const t = Math.max(0, 1 - Math.abs(i - pos) / SHIMMER_BAND);
    out += fgAnsi(blend(base, highlight, t * t * 0.92)) + chars[i];
  }
  return getColorMode() === "none" ? out : `${out}\x1b[39m`;
}

/** Animations and notices only belong in the interactive terminal UI. */
export function isInteractiveTui(ctx: Pick<ExtensionContext, "mode" | "hasUI"> | undefined): boolean {
  if (!ctx) return false;
  return typeof ctx.mode === "string" ? ctx.mode === "tui" : ctx.hasUI === true;
}

const EFFORT_TAGS: Record<string, { tag: string; color: RGB }> = {
  minimal: { tag: "MINIMAL", color: MUTED },
  low: { tag: "LOW", color: SKY },
  medium: { tag: "MEDIUM", color: PETAL },
  high: { tag: "HIGH", color: MUELSYSE },
  xhigh: { tag: "XHIGH", color: LAVENDER },
  max: { tag: "MAX", color: CORAL },
};

// ─── Extension ────────────────────────────────────────────────────

export default function claudeShimmer(pi: ExtensionAPI) {
  let ctx_: ExtensionContext | null = null;

  // Agent run (agent_start … agent_settled; spans retries and tool rounds).
  let runActive = false;
  let runStart = 0;
  let verb = "";
  let runOutcome: RunOutcome = "completed";
  let completedTokens = 0;
  let completedEstimated = false;
  /** Reported prompt tokens of the run's finished requests. */
  let promptTokens = 0;
  /** Model rounds of this run (turn_start count). */
  let runTurns = 0;
  /** Summed model-request durations, the footer telemetry's generation time. */
  let generationMs = 0;

  // Current assistant message.
  let mode: SpinnerMode = "requesting";
  let thinkingStart = 0;
  let lastStreamAt = 0;
  let activeToolCount = 0;
  let toolStart = 0;
  let reportedTokens: number | null = null;
  /** Prompt tokens the in-flight request reported (0 until the provider does). */
  let stepPromptTokens = 0;
  /** Context size of the request that is still waiting to be reported on. */
  let pendingPromptTokens = 0;
  /** Wall clock when the in-flight model request started (0 = none). */
  let stepStart = 0;
  const blockUnits = new Map<number, number>();
  let estimateUnits = 0;

  // Animation.
  let timer: ReturnType<typeof setInterval> | null = null;
  let tick = 0;
  let displayedTokens = 0;

  // Working-line ownership.
  type WorkingSlotHold = {
    ui: ExtensionContext["ui"];
    /** The setter we wrapped; restored on release while our wrapper is still outermost. */
    previous: (message?: string) => void;
    wrapper: (message?: string) => void;
  };
  let workingSlot: WorkingSlotHold | null = null;
  let ownWorkingWrite = false;

  const currentEstimate = () => Math.ceil(estimateUnits / 4);

  function tokenTarget(): TokenReading {
    const live = liveTokenReading(reportedTokens, currentEstimate());
    return { tokens: completedTokens + live.tokens, estimated: completedEstimated || live.estimated };
  }

  /**
   * Upstream count for the HUD. Providers only report the prompt with the response,
   * so before the first report the host's context estimate stands in for the request
   * that is on its way, marked with the same "~" as an estimated output count.
   */
  function hudPrompt(): TokenReading {
    if (stepPromptTokens > 0) return { tokens: promptTokens + stepPromptTokens, estimated: false };
    if (promptTokens > 0) return { tokens: promptTokens, estimated: false };
    return { tokens: pendingPromptTokens, estimated: pendingPromptTokens > 0 };
  }

  /** Refresh the pending-prompt estimate; `ctx.getContextUsage()` scans the session. */
  function refreshPendingPrompt(ctx: ExtensionContext | null) {
    try {
      const tokens = ctx?.getContextUsage()?.tokens;
      pendingPromptTokens = typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : 0;
    } catch {
      // Stale context after a session switch: keep the previous estimate.
    }
  }

  function effortTag(): string | undefined {
    let level = "";
    try {
      level = String(pi.getThinkingLevel() || "").toLowerCase();
    } catch {}
    const info = level && level !== "off" ? EFFORT_TAGS[level] ?? { tag: level.toUpperCase(), color: LAVENDER } : undefined;
    const tag = info?.tag ?? (mode === "thinking" ? "THINK" : "");
    if (!tag) return undefined;
    const base = info?.color ?? LAVENDER;
    const thinkElapsed = Date.now() - thinkingStart;
    if (mode === "thinking" && thinkElapsed > THINKING_GLOW_DELAY_MS) {
      const phase = ((thinkElapsed - THINKING_GLOW_DELAY_MS) / THINKING_GLOW_PERIOD_MS) * Math.PI * 2;
      return paintFg(blend(base, HIGHLIGHT, (Math.sin(phase) + 1) / 2), tag);
    }
    return paintFg(base, tag);
  }

  function stallAmount(now: number): number {
    if (mode === "tool-use" || mode === "tool-input" || activeToolCount > 0 || lastStreamAt === 0) return 0;
    return Math.max(0, Math.min(1, (now - lastStreamAt - STALL_TIMEOUT_MS) / STALL_FADE_MS));
  }

  function buildMessage(): string {
    const now = Date.now();
    const glyph = paintFg(MUELSYSE, SPINNER_FRAMES[tick % SPINNER_FRAMES.length]!);
    const text = `${verb}${animatedDots(tick)}`;
    const reverse = mode !== "requesting";
    let verbText: string;
    if (mode === "tool-use") {
      const pulse = (Math.sin(((now - toolStart) / TOOL_PULSE_PERIOD_MS) * Math.PI * 2) + 1) / 2;
      verbText = colorSweep(text, tick, reverse, 0.25 + pulse * 0.5, MINT);
    } else {
      verbText = colorSweep(text, tick, reverse, stallAmount(now), CORAL);
    }

    const parts: string[] = [];
    const effort = effortTag();
    if (effort) parts.push(effort);
    const prompt = hudPrompt();
    if (prompt.tokens > 0) {
      parts.push(paintFg(SKY, `↑ ${prompt.estimated ? "~" : ""}${formatTokenAmount(prompt.tokens)}`));
    }
    const target = tokenTarget();
    const generating = mode !== "requesting";
    parts.push(paintFg(generating ? MINT : MUTED, `↓ ${target.estimated ? "~" : ""}${formatTokenAmount(displayedTokens)}`));
    const elapsedGeneration = generationMs + (stepStart > 0 ? now - stepStart : 0);
    const tps = tokensPerSecond(target.tokens, elapsedGeneration);
    if (tps !== null) {
      parts.push(paintFg(generating ? tpsColor(tps) : MUTED, `${tps.toFixed(1)} tok/s`));
    }
    if (runTurns > 0) parts.push(paintFg(MUTED, `↻ ${runTurns}`));
    parts.push(paintFg(MUTED, formatDigital(now - runStart)));
    const hud = `${paintFg(MUTED, "( ")}${parts.join(paintFg(MUTED, " · "))}${paintFg(MUTED, " )")}`;
    return `${glyph} ${verbText} ${hud}`;
  }

  /**
   * Pi exposes exactly one working-message slot (`ctx.ui.setWorkingMessage`) and no ownership
   * API, so any other extension that refreshes it on its own clock — Cockpit's ambient
   * "工作中 · 0:12" — paints over the HUD between our ticks. This never matches such an
   * extension by package, version or text: while our clock runs the slot is simply ours, so
   * foreign strings are dropped while clears and our own writes land. Non-TUI sessions are
   * never held, and the setter is restored when the session ends or rebinds.
   *
   * Holding from `session_start` means a later `ctx.ui.setWorkingMessage` capture inside
   * another extension captures this wrapper instead of the raw setter, and re-arming at every
   * clock start heals a setter that a third party replaced after us. If the host ever refuses
   * the wrap we keep animating and only lose the arbitration.
   */
  function holdWorkingSlot(ctx: ExtensionContext) {
    const ui = ctx.ui;
    if (workingSlot?.ui === ui && ui.setWorkingMessage === workingSlot.wrapper) return;
    if (workingSlot && workingSlot.ui !== ui) releaseWorkingSlot();
    const previous = ui.setWorkingMessage;
    const wrapper = ((message?: string) => {
      if (message !== undefined && !ownWorkingWrite && timer) return;
      previous.call(ui, message);
    }) as typeof ui.setWorkingMessage;
    workingSlot = { ui, previous, wrapper };
    try {
      ui.setWorkingMessage = wrapper;
    } catch {
      workingSlot = null;
    }
  }

  function releaseWorkingSlot() {
    const current = workingSlot;
    workingSlot = null;
    // A setter stacked on top of ours keeps its own chain; ours stays behind as a passthrough.
    if (current && current.ui.setWorkingMessage === current.wrapper) current.ui.setWorkingMessage = current.previous;
  }

  function updateDisplay() {
    const ctx = ctx_;
    if (!ctx || !timer) return;
    try {
      ownWorkingWrite = true;
      ctx.ui.setWorkingMessage(buildMessage());
    } catch {
      // UI disposed mid-tick (session replaced/shutdown): stop quietly.
      stopClock();
    } finally {
      ownWorkingWrite = false;
    }
  }

  function startClock() {
    if (timer || !isInteractiveTui(ctx_ ?? undefined)) return;
    try {
      // Glyph lives inside the message so our clock is the only one; hide Pi's.
      ctx_!.ui.setWorkingIndicator({ frames: [], intervalMs: TICK_MS });
    } catch {
      return;
    }
    holdWorkingSlot(ctx_!);
    timer = setInterval(() => {
      tick++;
      displayedTokens = tweenTokens(displayedTokens, tokenTarget().tokens);
      updateDisplay();
    }, TICK_MS);
    timer.unref?.();
    updateDisplay();
  }

  function stopClock() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function restoreUi() {
    const ctx = ctx_;
    if (!ctx || !isInteractiveTui(ctx)) return;
    try {
      ctx.ui.setWorkingMessage();
      ctx.ui.setWorkingIndicator();
    } catch {}
  }

  function resetMessage() {
    mode = "requesting";
    reportedTokens = null;
    blockUnits.clear();
    estimateUnits = 0;
    lastStreamAt = 0;
    stepPromptTokens = 0;
    stepStart = 0;
  }

  function setBlockUnits(index: number, units: number) {
    const next = Math.max(0, units);
    estimateUnits += next - (blockUnits.get(index) ?? 0);
    blockUnits.set(index, next);
  }

  function setMode(next: SpinnerMode) {
    if (mode === next) return;
    mode = next;
    updateDisplay();
  }

  function finishRun() {
    stopClock();
    if (!runActive) return;
    const elapsed = Date.now() - runStart;
    const outcome = runOutcome;
    runActive = false;
    restoreUi();
    const notice = completionNotice(outcome, elapsed);
    if (notice && ctx_ && isInteractiveTui(ctx_)) {
      try {
        const message = `${paintFg(MUELSYSE, notice.slice(0, 1))}${paintFg(MUTED, notice.slice(1))}`;
        pi.events.emit("muelsyse:completion-notice", message);
        ctx_.ui.notify(message, "info");
      } catch {}
    }
  }

  // ── Events ──────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    ctx_ = ctx;
    if (!isInteractiveTui(ctx)) return;
    syncColorMode(ctx.ui.theme);
    holdWorkingSlot(ctx);
  });

  pi.on("agent_start", async (_event, ctx) => {
    ctx_ = ctx;
    if (!isInteractiveTui(ctx)) return;
    syncColorMode(ctx.ui.theme);
    if (!runActive) {
      // New run: everything below stays stable across tool rounds and retries.
      runActive = true;
      runStart = Date.now();
      verb = pickVerb();
      runOutcome = "completed";
      completedTokens = 0;
      completedEstimated = false;
      promptTokens = 0;
      runTurns = 0;
      generationMs = 0;
      displayedTokens = 0;
      tick = 0;
    }
    resetMessage();
    activeToolCount = 0;
    refreshPendingPrompt(ctx);
    startClock();
  });

  pi.on("turn_start", async (_event, ctx) => {
    ctx_ = ctx;
    if (!runActive) return;
    runTurns += 1;
    resetMessage();
    // The footer telemetry measures a request from turn start (first-token wait
    // included); starting here keeps the live throughput and the summary equal.
    stepStart = Date.now();
    refreshPendingPrompt(ctx);
    startClock();
  });

  pi.on("message_start", async (event, ctx) => {
    if (!runActive || event.message.role !== "assistant") return;
    ctx_ = ctx;
    stepPromptTokens = reportedPromptTokens(event.message as AssistantTokenMessage);
  });

  pi.on("message_update", async (event, ctx) => {
    if (!runActive) return;
    ctx_ = ctx;
    const evt = event.assistantMessageEvent;
    const message = event.message as AssistantTokenMessage;
    reportedTokens = reportedOutputTokens(message) ?? reportedTokens;
    // Providers may fill the prompt usage mid-stream; keep the live segment honest.
    const reportedPrompt = reportedPromptTokens(message);
    if (reportedPrompt > 0) stepPromptTokens = reportedPrompt;

    // Incremental estimate keyed by contentIndex (streams may interleave blocks).
    switch (evt.type) {
      case "start":
        blockUnits.clear();
        estimateUnits = 0;
        break;
      case "text_start":
      case "thinking_start":
        setBlockUnits(evt.contentIndex, 0);
        break;
      case "text_delta":
      case "thinking_delta":
      case "toolcall_delta":
        setBlockUnits(evt.contentIndex, (blockUnits.get(evt.contentIndex) ?? 0) + estimateTextTokenUnits(evt.delta));
        lastStreamAt = Date.now();
        break;
      case "text_end":
      case "thinking_end":
        setBlockUnits(evt.contentIndex, estimateTextTokenUnits(evt.content));
        break;
      case "toolcall_start": {
        const block = message.content?.[evt.contentIndex];
        setBlockUnits(evt.contentIndex, block ? estimateBlockTokenUnits(block) : 0);
        break;
      }
      case "toolcall_end":
        setBlockUnits(evt.contentIndex, estimateTextTokenUnits(toolCallText(evt.toolCall.name, evt.toolCall.arguments)));
        break;
    }

    switch (evt.type) {
      case "thinking_start":
        thinkingStart = Date.now();
        setMode("thinking");
        break;
      case "thinking_delta":
        if (mode !== "thinking") {
          thinkingStart = Date.now();
          setMode("thinking");
        }
        break;
      case "text_start":
      case "text_delta":
        lastStreamAt = Date.now();
        setMode("responding");
        break;
      case "toolcall_start":
        setMode("tool-input");
        break;
    }
  });

  pi.on("message_end", async (event, ctx) => {
    if (!runActive || event.message.role !== "assistant") return;
    ctx_ = ctx;
    const message = event.message as AssistantTokenMessage;
    const final = finalTokenReading(message);
    // Exactly once per finalized assistant message; totals accumulate across tool turns.
    completedTokens += final.tokens;
    completedEstimated ||= final.estimated;
    promptTokens += stepPromptTokens;
    stepPromptTokens = 0;
    if (stepStart > 0) generationMs += Math.max(0, Date.now() - stepStart);
    stepStart = 0;
    runOutcome = outcomeFromStopReason(message.stopReason);
    resetMessage();
    mode = "responding";
    // Snap so a correction (either direction) lands before tools run.
    displayedTokens = completedTokens;
    updateDisplay();
  });

  pi.on("tool_execution_start", async (_event, ctx) => {
    if (!runActive) return;
    ctx_ = ctx;
    if (activeToolCount++ === 0) toolStart = Date.now();
    setMode("tool-use");
  });

  pi.on("tool_execution_end", async (_event, ctx) => {
    if (!runActive) return;
    ctx_ = ctx;
    activeToolCount = Math.max(0, activeToolCount - 1);
    if (activeToolCount === 0) setMode("requesting");
  });

  // Pi removes its working loader at agent_end; a retry/continuation restarts us
  // via agent_start. The run (verb, clock, totals) only ends at agent_settled.
  pi.on("agent_end", async (event, ctx) => {
    stopClock();
    if (!runActive) return;
    const last = [...event.messages].reverse().find((m) => m.role === "assistant") as AssistantTokenMessage | undefined;
    if (last) runOutcome = outcomeFromStopReason(last.stopReason);
    try {
      if (ctx.signal?.aborted) runOutcome = "aborted";
    } catch {}
  });

  pi.on("agent_settled", async (_event, ctx) => {
    ctx_ = ctx;
    finishRun();
  });

  pi.on("session_shutdown", async () => {
    stopClock();
    releaseWorkingSlot();
    runActive = false;
    ctx_ = null;
  });
}
