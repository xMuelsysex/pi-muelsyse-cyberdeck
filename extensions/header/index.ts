import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { fgAnsi, getColorMode, syncColorMode, type RGB } from "../shared/color";
import { pickArtwork } from "./art-picker";

const MUELSYSE: RGB = [242, 167, 198];
const PEACH: RGB = [246, 188, 154];
const LAVENDER: RGB = [199, 184, 245];
const SKY: RGB = [159, 211, 242];
const LABEL = "◈  MUELSYSE CYBERDECK  ◈";
/** Fixed blank rows above the artwork (independent of terminal height). */
export const TOP_PADDING = 1;

function gradient(text: string, from: RGB, to: RGB, bold = false): string {
  if (getColorMode() === "none") return text;
  const chars = [...text];
  const span = Math.max(1, chars.length - 1);
  const open = bold ? "\x1b[1m" : "";
  return chars.map((char, index) => {
    if (char === " ") return char;
    const t = index / span;
    const color: RGB = [
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    ];
    return `${open}${fgAnsi(color)}${char}\x1b[0m`;
  }).join("");
}

const SGR_PATTERN = /\x1b\[[0-9;:]*m/g;
const ANIME_ART = readArtwork(fileURLToPath(new URL("./muelsyse-header.ansi", import.meta.url)));

function readArtwork(path: string): string[] {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path))
    .replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  const plain = text.replace(SGR_PATTERN, "");
  if (/[\x00-\x09\x0b-\x1f\x7f-\x9f]/u.test(plain)) {
    throw new Error("Artwork must contain text and ANSI SGR colors only; replace tabs with spaces.");
  }
  if (!/[^\s\u2800]/u.test(plain)) throw new Error("Artwork is empty.");
  return text.split("\n");
}

/** Centered left padding with an optical nudge, never pushing content past `width`. */
function centerPad(width: number, contentWidth: number, nudge = 0): string {
  const pad = Math.floor((width - contentWidth) / 2) + nudge;
  return " ".repeat(Math.max(0, Math.min(width - contentWidth, pad)));
}

/** Header lines; every line fits within `width` columns and the height never depends on the terminal. */
export function renderHeader(width: number, artwork: readonly string[] = ANIME_ART): string[] {
  const w = Math.floor(width);
  if (!Number.isFinite(w) || w <= 0) return [];

  const artWidth = Math.min(w, Math.max(1, ...artwork.map(visibleWidth)));
  const artPad = centerPad(w, artWidth, -2);
  const hasAnsi = artwork.some((line) => line.includes("\x1b["));
  // 纯文本沿用渐变，彩色画保留原色；截断仍由 Pi 处理宽字符和 ANSI。
  const art = artwork.map((line) => {
    const colored = getColorMode() === "none" ? stripVTControlCharacters(line)
      : hasAnsi ? `${line}\x1b[0m` : gradient(line, MUELSYSE, SKY);
    return `${artPad}${truncateToWidth(colored, artWidth, "")}`;
  });

  // Keep the divider visually subordinate: inset it symmetrically from the artwork.
  const railInset = artWidth >= 8 ? Math.max(2, Math.round(artWidth * 0.15)) : 0;
  const railWidth = Math.max(1, artWidth - railInset * 2);
  const rail = `${centerPad(w, railWidth, 1)}${gradient("━".repeat(railWidth), MUELSYSE, SKY)}`;

  const label = truncateToWidth(gradient(LABEL, LAVENDER, PEACH, true), w, "…");
  const labelLine = `${centerPad(w, visibleWidth(label), 1)}${label}`;

  return [...Array<string>(TOP_PADDING).fill(""), ...art, "", rail, labelLine, ""];
}

function isInteractiveTui(ctx: Pick<ExtensionContext, "mode" | "hasUI">): boolean {
  return typeof ctx.mode === "string" ? ctx.mode === "tui" : ctx.hasUI === true;
}

export default function muelsyseCyberdeckHeader(pi: ExtensionAPI): void {
  let artwork: readonly string[] = ANIME_ART;

  const installHeader = (ctx: ExtensionContext) => {
    syncColorMode(ctx.ui.theme);
    let cachedWidth = -1;
    let cachedLines: string[] = [];
    ctx.ui.setHeader(() => ({
      render(width: number): string[] {
        if (width !== cachedWidth) {
          cachedLines = renderHeader(width, artwork);
          cachedWidth = width;
        }
        return cachedLines;
      },
      invalidate() {
        cachedWidth = -1;
      },
    }));
  };

  pi.on("session_start", (_event, ctx) => {
    const openTuiLoaded = pi.getCommands().some((command) =>
      command.source === "extension" && command.name === "open-tui",
    );
    if (isInteractiveTui(ctx) && !openTuiLoaded) installHeader(ctx);
  });

  pi.registerCommand("muelsyse-art", {
    description: "Load header artwork from a UTF-8 text/ANSI file, or reset to the default",
    handler: async (args, ctx) => {
      if (!isInteractiveTui(ctx)) {
        ctx.ui.notify("Muelsyse artwork needs the interactive terminal UI.", "warning");
        return;
      }
      let input = args.trim();
      if (input === "reset") {
        artwork = ANIME_ART;
        installHeader(ctx);
        ctx.ui.notify("Default Muelsyse artwork restored.", "info");
        return;
      }
      if (!input) {
        const selected = await pickArtwork(ctx);
        if (selected === undefined) return;
        input = selected;
      }
      if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
        input = input.slice(1, -1);
      }
      const path = resolve(ctx.cwd, input.startsWith("~/") ? resolve(homedir(), input.slice(2)) : input);
      let loaded: string[];
      try {
        loaded = readArtwork(path);
      } catch (error) {
        ctx.ui.notify(`Could not load artwork ${path}: ${error instanceof Error ? error.message : String(error)}`, "error");
        return;
      }
      artwork = loaded;
      installHeader(ctx);
      ctx.ui.notify(`Artwork loaded: ${path} (${loaded.length} rows).`, "info");
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!isInteractiveTui(ctx)) return;
    try {
      ctx.ui.setHeader(undefined);
    } catch {
      // UI may already be disposed.
    }
  });
}
