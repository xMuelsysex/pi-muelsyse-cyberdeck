/**
 * Muelsyse Matrix: a short candy-colored rain widget shown above the editor while
 * the agent works. Opt-in (`/muelsyse-matrix on`), interactive TUI only, and a pure
 * widget: it never touches Pi's working message/indicator (the shimmer owns those).
 * One timer runs only while the rain is visible; idle CPU is zero.
 *
 * The widget slot is reserved once at `session_start` and kept for the whole session
 * (idle ⇒ zero rendered lines), because Pi renders widgets in registration order:
 * a slot re-registered later would land below every widget mounted meanwhile — the
 * Cockpit agent bar among them — and the rain has to stay above that bar.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { fgAnsi, getColorMode, syncColorMode, type RGB } from "../shared/color";

const WIDGET_KEY = "muelsyse-matrix-engine";
export const CONFIG_PATH = join(getAgentDir(), "muelsyse-cyberdeck-matrix.json");
const PREVIEW_MS = 5_000;
const GLYPHS = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾗﾘﾙﾚﾛﾜﾝ"];
const BG: RGB = [20, 17, 26];
const TEXT: RGB = [247, 238, 248];
const CANDY: readonly RGB[] = [
  [242, 167, 198], // muelsyse
  [246, 188, 154], // peach
  [239, 195, 230], // petal
  [199, 184, 245], // lavender
  [159, 211, 242], // sky
  [174, 229, 197], // mint
];

type Phase = "thinking" | "working" | "tool";
type Timer = ReturnType<typeof setTimeout>;

export interface MatrixConfig {
  enabled: boolean;
  fps: number;
  density: number;
  height: number;
}

interface Drop {
  x: number;
  offset: number;
  speed: number;
  length: number;
  gap: number;
  seed: number;
  color: RGB;
}

export const LIMITS = {
  fps: { min: 8, max: 18 },
  density: { min: 0.45, max: 0.95 },
  height: { min: 3, max: 6 },
} as const;

export const DEFAULT_CONFIG: Readonly<MatrixConfig> = {
  enabled: false,
  fps: 10,
  density: 0.65,
  height: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberOr(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Normalize any parsed JSON into a valid config (unknown/invalid fields fall back to defaults). */
export function normalizeConfig(parsed: unknown): MatrixConfig {
  const raw = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<Record<keyof MatrixConfig, unknown>>;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_CONFIG.enabled,
    fps: Math.round(clamp(numberOr(raw.fps, DEFAULT_CONFIG.fps), LIMITS.fps.min, LIMITS.fps.max)),
    density: Math.round(clamp(numberOr(raw.density, DEFAULT_CONFIG.density), LIMITS.density.min, LIMITS.density.max) * 100) / 100,
    height: Math.round(clamp(numberOr(raw.height, DEFAULT_CONFIG.height), LIMITS.height.min, LIMITS.height.max)),
  };
}

export function loadConfig(path = CONFIG_PATH): { config: MatrixConfig; error?: string } {
  try {
    if (!existsSync(path)) return { config: { ...DEFAULT_CONFIG } };
    return { config: normalizeConfig(JSON.parse(readFileSync(path, "utf8"))) };
  } catch (error) {
    return { config: { ...DEFAULT_CONFIG }, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Returns an error message instead of throwing. */
export function saveConfig(config: MatrixConfig, path = CONFIG_PATH): string | undefined {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    renameSync(tmp, path);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export type MatrixCommand =
  | { type: "status" }
  | { type: "help" }
  | { type: "on" }
  | { type: "off" }
  | { type: "preview" }
  | { type: "set"; key: "fps" | "density" | "height"; value: number }
  | { type: "invalid"; message: string };

export const HELP_TEXT = [
  "/muelsyse-matrix status        show current settings",
  "/muelsyse-matrix on | off      enable or disable the rain while the agent works",
  "/muelsyse-matrix preview       show the rain for 5 seconds",
  `/muelsyse-matrix fps N         frame rate (${LIMITS.fps.min}-${LIMITS.fps.max})`,
  `/muelsyse-matrix density N     column density (${LIMITS.density.min}-${LIMITS.density.max})`,
  `/muelsyse-matrix height N      rows (${LIMITS.height.min}-${LIMITS.height.max})`,
].join("\n");

export function parseMatrixCommand(args: string): MatrixCommand {
  const [command = "", value] = args.trim().toLowerCase().split(/\s+/);
  switch (command) {
    case "":
    case "status":
      return { type: "status" };
    case "help":
    case "?":
      return { type: "help" };
    case "on":
    case "off":
    case "preview":
      return { type: command };
    case "fps":
    case "density":
    case "height": {
      const { min, max } = LIMITS[command];
      const n = Number(value);
      if (value === undefined || !Number.isFinite(n) || n < min || n > max) {
        return { type: "invalid", message: `Usage: /muelsyse-matrix ${command} <${min}-${max}>` };
      }
      const rounded = command === "density" ? Math.round(n * 100) / 100 : Math.round(n);
      return { type: "set", key: command, value: rounded };
    }
    default:
      return { type: "invalid", message: `Unknown subcommand "${command}".\n${HELP_TEXT}` };
  }
}

export function describeConfig(config: MatrixConfig): string {
  return `Muelsyse Matrix: ${config.enabled ? "on" : "off"} · ${config.fps} FPS · ${config.height} lines · density ${config.density}`;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(from: RGB, to: RGB, amount: number): RGB {
  return [
    Math.round(from[0] + (to[0] - from[0]) * amount),
    Math.round(from[1] + (to[1] - from[1]) * amount),
    Math.round(from[2] + (to[2] - from[2]) * amount),
  ];
}

function colorize(char: string, color: RGB, bold: boolean): string {
  const open = fgAnsi(color);
  if (!open) return char;
  return `${bold ? "\x1b[1m" : ""}${open}${char}\x1b[0m`;
}

function stableGlyph(seed: number, row: number, timeSlice: number): string {
  let hash = Math.imul(seed ^ (row + 17), 0x45d9f3b);
  hash = Math.imul(hash ^ timeSlice, 0x45d9f3b);
  hash ^= hash >>> 16;
  return GLYPHS[Math.abs(hash) % GLYPHS.length] ?? "0";
}

export function createDrops(width: number, density: number, height: number): Drop[] {
  const random = mulberry32((width * 2654435761) ^ 0x53414b55);
  const columns = Array.from({ length: Math.ceil(width / 2) }, (_, index) => index * 2);
  const active = columns.filter(() => random() < density);
  const selected = active.length >= 8 ? active : columns.slice(0, Math.min(columns.length, 8));
  return selected.slice(0, 96).map((x, index) => {
    const length = 3 + Math.floor(random() * 5);
    const gap = 1 + Math.floor(random() * 5);
    const cycle = height + length + gap;
    return {
      x,
      offset: random() * cycle,
      speed: 5.5 + random() * 7.5,
      length,
      gap,
      seed: Math.floor(random() * 0x7fffffff) ^ (index * 7919),
      color: CANDY[index % CANDY.length]!,
    };
  });
}

export function renderMuelsyseMatrix(
  width: number,
  height: number,
  elapsedSeconds: number,
  phase: Phase,
  drops: readonly Drop[],
): string[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const safeHeight = clamp(Math.round(height), LIMITS.height.min, LIMITS.height.max);
  const grid: string[][] = Array.from({ length: safeHeight }, () => Array(safeWidth).fill(" "));
  const timeSlice = Math.floor(elapsedSeconds * 8);
  const phaseSpeed = phase === "tool" ? 1.12 : phase === "thinking" ? 1.06 : 1;

  for (const drop of drops) {
    if (drop.x >= safeWidth) continue;
    const cycle = safeHeight + drop.length + drop.gap;
    const head = ((drop.offset + elapsedSeconds * drop.speed * phaseSpeed) % cycle) - drop.gap;
    for (let trail = 0; trail < drop.length; trail++) {
      const row = Math.floor(head - trail);
      if (row < 0 || row >= safeHeight) continue;
      const glyph = stableGlyph(drop.seed + trail * 97, row, timeSlice);
      const color = trail === 0
        ? mix(drop.color, TEXT, 0.58)
        : trail === 1
          ? drop.color
          : mix(drop.color, BG, clamp((trail - 1) * 0.16, 0, 0.72));
      grid[row]![drop.x] = colorize(glyph, color, trail <= 1);
    }
  }

  const reset = getColorMode() === "none" ? "" : "\x1b[0m";
  return grid.map((row) => `${row.join("")}${reset}`);
}

function isInteractiveTui(ctx: Pick<ExtensionContext, "mode" | "hasUI">): boolean {
  return typeof ctx.mode === "string" ? ctx.mode === "tui" : ctx.hasUI === true;
}

/** Idle renders nothing: the reserved slot must not occupy any row. */
const NO_LINES: readonly string[] = [];

export default function muelsyseMatrixExtension(pi: ExtensionAPI): void {
  const loaded = loadConfig();
  const config = loaded.config;
  let configWarning = loaded.error
    ? `Muelsyse Matrix: could not read ${CONFIG_PATH} (${loaded.error}); using defaults. Changing a setting will overwrite that file.`
    : undefined;

  let phase: Phase = "working";
  let active = false;
  let previewing = false;
  let timer: Timer | undefined;
  let previewTimer: Timer | undefined;
  let startedAt = 0;
  let nextDeadline = 0;
  let lastHostUpdateAt = 0;
  let frame = 0;
  let generation = 0;
  let requestRender: (() => void) | undefined;
  let cachedKey = "";
  let cachedLines: string[] = [];
  const dropsByWidth = new Map<number, Drop[]>();

  const invalidate = () => {
    cachedKey = "";
    cachedLines = [];
  };

  const component = {
    render(width: number): string[] {
      if (!active) return NO_LINES as string[];
      const safeWidth = Math.max(1, width);
      const key = `${safeWidth}:${config.height}:${frame}:${phase}`;
      if (key === cachedKey) return cachedLines;
      let drops = dropsByWidth.get(safeWidth);
      if (!drops) {
        drops = createDrops(safeWidth, config.density, config.height);
        if (dropsByWidth.size >= 4) dropsByWidth.delete(dropsByWidth.keys().next().value ?? safeWidth);
        dropsByWidth.set(safeWidth, drops);
      }
      cachedLines = renderMuelsyseMatrix(safeWidth, config.height, Math.max(0, performance.now() - startedAt) / 1000, phase, drops);
      cachedKey = key;
      return cachedLines;
    },
    invalidate(): void {
      dropsByWidth.clear();
      invalidate();
    },
  };

  const clearTimers = () => {
    if (timer) clearTimeout(timer);
    if (previewTimer) clearTimeout(previewTimer);
    timer = undefined;
    previewTimer = undefined;
  };

  const schedule = (token: number) => {
    if (!active || token !== generation) return;
    const frameMs = 1000 / config.fps;
    const now = performance.now();
    if (now - nextDeadline > frameMs * 3) nextDeadline = now;
    nextDeadline += frameMs;
    timer = setTimeout(() => {
      if (!active || token !== generation) return;
      frame += 1;
      invalidate();
      // Streaming/tool updates already trigger a host render; skip a redundant one.
      if (performance.now() - lastHostUpdateAt >= frameMs) requestRender?.();
      schedule(token);
    }, Math.max(16, nextDeadline - performance.now()));
    timer.unref?.();
  };

  const stop = () => {
    generation += 1;
    active = false;
    previewing = false;
    clearTimers();
    lastHostUpdateAt = 0;
    invalidate();
    // The slot stays registered; repaint so the rain's rows disappear.
    requestRender?.();
  };

  /** Reserves the widget slot for this session — once, before other extensions mount theirs. */
  const mountSlot = (ctx: ExtensionContext): boolean => {
    if (!isInteractiveTui(ctx)) return false;
    syncColorMode(ctx.ui.theme);
    try {
      ctx.ui.setWidget(WIDGET_KEY, (tui) => {
        requestRender = () => tui.requestRender();
        return component;
      });
      return true;
    } catch {
      // UI disposed mid-session-start: the rain simply has no slot this session.
      return false;
    }
  };

  /** Starts the rain; returns false when it cannot run (non-TUI or UI failure). */
  const start = (ctx: ExtensionContext, initialPhase: Phase = "working"): boolean => {
    stop();
    if (!isInteractiveTui(ctx)) return false;
    active = true;
    phase = initialPhase;
    frame = 0;
    startedAt = performance.now();
    nextDeadline = startedAt;
    dropsByWidth.clear();
    const token = generation;
    schedule(token);
    return true;
  };

  const noteHostUpdate = () => {
    lastHostUpdateAt = performance.now();
  };

  const setPhase = (next: Phase) => {
    noteHostUpdate();
    if (!active || phase === next) return;
    phase = next;
    frame += 1;
    invalidate();
  };

  const notify = (ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info") => {
    try {
      ctx.ui.notify(message, type);
    } catch {}
  };

  const persist = (ctx: ExtensionContext, done: string) => {
    const error = saveConfig(config);
    if (error) notify(ctx, `${done} (not saved: ${error})`, "warning");
    else notify(ctx, done);
    configWarning = undefined;
  };

  pi.on("session_start", (_event, ctx) => {
    if (!isInteractiveTui(ctx)) return;
    syncColorMode(ctx.ui.theme);
    mountSlot(ctx);
    if (configWarning) {
      notify(ctx, configWarning, "warning");
      configWarning = undefined;
    }
  });

  pi.on("agent_start", (_event, ctx) => {
    if (config.enabled) start(ctx);
  });
  pi.on("agent_end", () => stop());
  pi.on("agent_settled", () => stop());
  pi.on("session_shutdown", () => stop());

  pi.on("message_update", (event) => {
    if (!active) return;
    noteHostUpdate();
    const type = (event.assistantMessageEvent as { type?: string } | undefined)?.type;
    if (type === "thinking_start" || type === "thinking_delta") setPhase("thinking");
    else if (type === "thinking_end" || type === "text_delta") setPhase("working");
  });

  pi.on("tool_execution_start", () => setPhase("tool"));
  pi.on("tool_execution_update", () => noteHostUpdate());
  pi.on("tool_execution_end", () => setPhase("working"));

  pi.registerCommand("muelsyse-matrix", {
    description: "Muelsyse Matrix rain: status | on | off | preview | fps N | density N | height N | help",
    handler: async (args, ctx) => {
      const command = parseMatrixCommand(args ?? "");
      switch (command.type) {
        case "status":
          notify(ctx, describeConfig(config));
          return;
        case "help":
          notify(ctx, HELP_TEXT);
          return;
        case "invalid":
          notify(ctx, command.message, "error");
          return;
        case "on":
          config.enabled = true;
          // Takes effect from the next agent run (or immediately when one is running).
          if (!active && !ctx.isIdle()) start(ctx);
          persist(ctx, "Muelsyse Matrix enabled");
          return;
        case "off":
          config.enabled = false;
          stop();
          persist(ctx, "Muelsyse Matrix disabled");
          return;
        case "set":
          config[command.key] = command.value;
          dropsByWidth.clear();
          invalidate();
          persist(ctx, describeConfig(config));
          return;
        case "preview": {
          if (!isInteractiveTui(ctx)) {
            notify(ctx, "Muelsyse Matrix preview needs the interactive terminal UI", "warning");
            return;
          }
          if (active && !previewing) {
            notify(ctx, "Muelsyse Matrix is already running");
            return;
          }
          if (!start(ctx, "thinking")) {
            notify(ctx, "Muelsyse Matrix preview could not start", "warning");
            return;
          }
          previewing = true;
          const token = generation;
          previewTimer = setTimeout(() => {
            if (generation === token && previewing) stop();
          }, PREVIEW_MS);
          previewTimer.unref?.();
          notify(ctx, "Muelsyse Matrix preview: 5 seconds");
          return;
        }
      }
    },
  });
}
