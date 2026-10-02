# pi-muelsyse-cyberdeck

Lightweight Muelsyse Macaron visual pack for [Pi](https://pi.dev).

> Chinese version: [README.md](README.md).

**v1.2.0** — robustness, performance and footprint release: no idle redraws, no rewriting of tool or command output, safer git, fixed-editor removed, matrix opt-in, 256-color/`NO_COLOR` support, and an in-app changelog. See [what changed](#120).

## What’s inside

| Piece | Role |
|-------|------|
| **Theme** `muelsyse-macaron` | Dark macaron palette (muelsyse / peach / petal / lavender / sky / mint / coral), incl. fullscreen scrollbar and search colors |
| **Header** | Default color-ANSI Muelsyse art; pick text or ANSI artwork with `/muelsyse-art` |
| **Zentui** | Editor rails, Starship-style footer, muelsyse tool/message frames, Chinese/English settings UI |
| **Claude shimmer** | Working line with macaron sweep, effort + token HUD |
| **Matrix** | Pastel digital-rain widget while working — **off by default**, `/muelsyse-matrix on` |
| **Telemetry** | TPS, TTFT, duration, tokens, stalls and cost rate after each run — local statistics only |
| **Changelog** | One-time “what’s new” notice after updates, `/muelsyse-changelog` viewer |

No runtime dependencies; everything uses Pi’s public extension API except three small, guarded render patches (user messages, tool card frames, selector borders). The Open TUI gradient adaptation and the fullscreen-selection optimization touch host component internals, so re-check them after a Pi upgrade.

## Look (v1.2)

**Footer**

```text
◆  project  on ⎇ main [!3 ?2 ↑1]   [███░░░░░░░] 4%/128k › ↑12k ↓1.4k › Cache 70.0% › $0.06
```

> In the terminal, `◆` and `⎇` are Nerd Font icons (OS logo and git branch). Without a Nerd Font, set `icons.mode: "ascii"`.

- Context gauge: macaron gauge; context label **sky**, cost **peach**
- Separators / cwd / os: muelsyse gradient accents
- Totals match Pi’s own footer (incl. compaction and subagent/tool usage)
- Cache hit rate covers the latest model reply, `cacheRead / (input + cacheRead + cacheWrite)`; `0.0%` for zero hits and `--` when there is no data yet
- Git status shows file counts by default; the “Git counts” switch falls back to plain symbols
- Static by default; `/zentui pulse on` animates it while the agent works

**Working line**

```text
✻ Whisking...  ( HIGH · ↓ ~1.2k tokens · 00:12 )
```

- Effort MINIMAL→MAX, tier-colored; one verb per run
- Tokens: `~` marks the live estimate; the provider’s final count replaces it and accumulates across tool turns
- Fades toward coral when the stream stalls; pulses mint while a tool runs
- `✻ Whisked for 12s` after a successful run (whole-run time), followed by a blank line and the telemetry summary when it is enabled
- Telemetry: TPS, TTFT, total duration, `U/R` input split, output tokens, stalls and dollars per million tokens; every field can be switched off in `/zentui` → Telemetry

**History**

```text
╭─ ✓ READ ─────────────────────────╮
┃  read src/app.ts                 │
┃  …Pi’s own output, unchanged…    │
╰──────────────────────────────────╯
```

- Tool cards: muelsyse frame + status rail (sky running / mint done / coral failed); the body is Pi’s own render, byte-for-byte
- `!cmd` output, edit diffs and images: stock Pi
- Hidden thinking shows a muelsyse `✦ Thought` label; visible thinking is stock Pi

## Requirements

- Pi **>= 0.87.1**; the 1.2.0 release line was verified on 0.87.1 and 0.99.1, while the current Open TUI integration uses `pi.getCommands()` and host component internals, so run it on a Pi version that provides them
- Dark terminal background (the theme does not paint a background)
- Truecolor recommended; 256-color terminals get the nearest palette colors, `NO_COLOR` disables the pack’s own colors
- Nerd Font for the default icons (`icons.mode: "ascii"` works without)

## Install

```bash
pi install git:github.com/xMuelsysex/pi-muelsyse-cyberdeck
```

Local:

```bash
pi install /path/to/pi-muelsyse-cyberdeck
```

Then `/settings` → theme **muelsyse-macaron** (Pi 0.99 defaults to its `system` theme). Restart Pi once.

> Prefer **this package’s shimmer** over stock `npm:pi-claude-shimmer`.

### Updating

For an unpinned Git installation:

```bash
pi update git:github.com/xMuelsysex/pi-muelsyse-cyberdeck
```

Restart Pi after updating. The first session after an update shows **what’s new** above the editor (it disappears after your next message); run `/muelsyse-changelog` any time to read the full changelog inside Pi, or see [CHANGELOG.md](CHANGELOG.md).

Pi does not push package updates automatically. Users who pinned a tag or commit must explicitly select the new version:

```bash
pi install git:github.com/xMuelsysex/pi-muelsyse-cyberdeck@v1.2.0
```

Notes for 1.2.0:

- Existing theme and Zentui settings are preserved.
- The fixed-editor compositor was removed. Old `fixedEditor` settings are removed from your config automatically (with a one-time notice if it was enabled); use Pi’s fullscreen mode below instead.
- If an earlier `/zentui fixed-editor disable` turned your editor off (a 1.1.x bug), run `/zentui editor on` once.
- Muelsyse Matrix is now off by default. If you had explicitly saved it on, it stays on; otherwise run `/muelsyse-matrix on`.
- The footer pulse animation is now opt-in (`/zentui pulse on`).

### Sticky editor (Pi fullscreen mode)

For a sticky editor and scrollable transcript use Pi’s native fullscreen TUI:

```jsonc
// ~/.pi/agent/settings.json
{
  "tuiMode": "fullscreen"
}
```

Or start with `pi --tui-mode fullscreen`. Pack styling (editor chrome, footer, shimmer, theme scrollbar/search colors) still applies.

## Configuration

Zentui config file: `~/.pi/agent/muelsyse-cyberdeck-zentui.json` (edit with `/zentui`). If the file contains invalid JSON, the pack warns you at startup and does not overwrite it.

Settings default to Simplified Chinese. Use **`/zentui` → Features → “Language / 语言”** to switch between **简体中文** and **English**; the change applies immediately, is saved, and survives a restart. It controls the Zentui settings text only, not Pi's or Open TUI's own language.

```jsonc
// ~/.pi/agent/muelsyse-cyberdeck-zentui.json (excerpt)
{
  "language": "zh-CN",         // zh-CN (Simplified Chinese) or en
  "colors": {
    "contextNormal": "syntaxFunction",
    "cost": "mdCode",
    "editorBorder": "muelsyse-macaron-gradient"
  },
  "features": {
    "messageStyle": true      // muelsyse frames for messages and tool cards
  },
  "animations": {
    "footerPulse": false      // animate footer gradients while the agent works
  }
}
```

Matrix settings live in `~/.pi/agent/muelsyse-cyberdeck-matrix.json` (edit with `/muelsyse-matrix`).

## Commands

```text
/zentui                                   settings UI (editor, footer, messages, icons, colors…)
/zentui editor|statusline|messages|copy-friendly|pulse on|off|toggle
/zentui format "<template>"               custom footer format ("" = segment layout)

/muelsyse-matrix [status]                   current rain settings
/muelsyse-matrix on|off                     enable / disable the rain widget
/muelsyse-matrix preview                    show the rain for 5 seconds
/muelsyse-matrix fps N | density N | height N
/muelsyse-matrix help

/muelsyse-changelog [version]               scrollable changelog (q / Esc to close)

/muelsyse-art [path]                        load header art (no path = TUI file browser)
/muelsyse-art reset                         restore the default header art
```

`/muelsyse-art` opens a scrollable TUI file browser in the current project directory: ↑/↓
to select, Enter to enter a directory or load a file, ←/Backspace to go up, Esc to cancel.
Only UTF-8 text or ANSI files are usable. Plain ASCII/Unicode/Braille art gets the
Muelsyse→sky gradient, ANSI SGR art keeps its colors (`NO_COLOR` removes them), tabs must
be replaced with spaces, and cursor-control sequences are rejected. The choice lasts for
the current Pi process; restarting Pi restores the default.

```text
/muelsyse-art extensions/header/muelsyse-header.ansi
/muelsyse-art "./my art/portrait.ansi"
```

## Conflicts

Avoid stacking with `pi-zentui`, `pi-powerline-footer`, stock `pi-claude-shimmer`, or a second copy of this pack. They share the footer / working line / editor surfaces.

When pi-open-tui is loaded, this pack keeps its header, footer and custom editor, and only themes the decoration colors with the same gradient. Cache hit rate and telemetry stay owned by Open TUI: the matching `/zentui` entries read “Managed by /open-tui” and are configured in `/open-tui` instead.

## Changelog

Full history: [CHANGELOG.md](CHANGELOG.md) (also available in Pi via `/muelsyse-changelog`).

### 1.2.0

A robustness, performance and "lighter footprint" release based on a full code review
against Pi 0.99.1. Extension code shrank from ~12,000 to ~8,700 lines, the pack no longer
redraws the terminal while idle, and it no longer rewrites tool or command output.
Supported Pi versions: 0.87.1 and newer (tested on 0.87.1 and 0.99.1).

#### Highlights

- **Idle means idle**: the footer no longer redraws the screen 4×/second forever (0 bytes written while idle, was ~3.4 KB/s).
- **Your output stays yours**: tool results, `!cmd` output and thinking are shown exactly as Pi renders them — no more added ✓/× glyphs, lost indentation, 200-line caps or replaced lines.
- **Fixed** `/zentui fixed-editor disable` turning off (and saving) the main editor.
- **Fixed** the working HUD being stuck at `↓ 1 token` on Anthropic models, and "done in 0s" after multi-step runs.
- **Safer git**: no more `index.lock` collisions with the agent's own git commands; far fewer git processes.
- **Removed** the obsolete fixed-editor compositor (~1,950 lines); use Pi's native `"tuiMode": "fullscreen"`.
- **Matrix rain is now opt-in** (`/muelsyse-matrix on`) and no longer fights the shimmer.
- **256-color terminals and `NO_COLOR`** are now respected by every effect.
- **New**: this what's-new notice after updates, and `/muelsyse-changelog` to read the changelog inside Pi.

#### Fixed — editor, footer and settings (Zentui)

- `/zentui fixed-editor disable|enable|toggle` was parsed as the *editor* switch and disabled the main editor, persisting it to config. Direct commands are now parsed strictly (`/zentui <target> <on|off|toggle>`); anything else shows usage. If this bug turned your editor off earlier, run `/zentui editor on` once.
- Lines you typed in the editor that contained both the model and provider name (e.g. "compare gpt-5 with OpenAI") were deleted from the editor view. Only lines Zentui itself renders are ever stripped now.
- Footer token and cost totals undercounted: compaction, branch-summary, `usage` entries and tool-result usage (subagents / codemode) were missing. Totals now match Pi's own footer.
- An extension status with a key such as `constructor` or `__proto__` crashed every footer render.
- Settings changes (enabling git commit/metrics, package version, footer format, icon mode) did not apply until the next refresh or restart; they now apply immediately.
- Built-in defaults disagreed with what users actually got (refresh interval, footer format, icons). Defaults now come from one place.
- A corrupt `muelsyse-cyberdeck-zentui.json` silently reset every setting to defaults. You now get a warning naming the file and the JSON error, and the file is never overwritten until fixed.
- `$sep` in a custom `footerFormat` always rendered ` | ` regardless of the separator setting.
- Numbers from 999,500 to 999,999 were shown as `1000k` (now `1.0M`).
- A `"bold accent"` style spec dropped the theme color.
- Gradients split emoji ZWJ sequences and combining marks (e.g. accented folder names) into broken pieces.
- The git segment silently froze with stale data when `git status` output exceeded 1 MB (very large change sets); the buffer is now 16 MB and failures show `[git n/a]`.
- Non-English git locales made normal folders look like git errors; git now runs with `LC_ALL=C`.
- Windows absolute paths were not recognised in git path handling.
- Runtime versions ignored the project folder and went stale after `nvm use` / `pyenv local`; they now run in the project folder and refresh when version files change.
- Thinking level `max` had no color of its own (new `colors.editorThinkingMax`).

#### Fixed — tool cards, messages and thinking

- `!cmd` output: expanded output was capped at ~19 lines, the bottom border was drawn as a second "BASH · COMPLETE" header, output lines that looked like box edges or `───` rules were replaced by frames, and failed or cancelled commands were labelled `✓ COMPLETE`. `!cmd` output is now stock Pi.
- Tool card bodies were rewritten: syntax and word-diff highlighting was lost, lines starting with `ok`/`Successfully`/`error` got ✓/× glyphs (which were copied with the text), lines starting with `read`/`edit`/`snake_case` words lost their indentation, long lines lost a trailing `...`, expanded output was capped at 200 lines, and collapsed bodies could be replaced by summaries. Bodies are now passed through byte-for-byte inside the muelsyse frame.
- Diff lines lost their indentation around line-number width changes (e.g. lines 95–105).
- Tool card status (running / done / failed) was guessed from the text; it now comes from the tool's real state.
- Clicking a tool card to expand it in fullscreen mode hit the wrong row.
- Clicking a thinking block to show/hide it stopped working in fullscreen mode, per-message thinking toggles were ignored, and visible thinking was cut to 16 lines. Thinking is now stock Pi; hidden thinking shows a muelsyse `✦ Thought` label.
- User messages lost ordered-list numbering (`1)`), backslash escapes and other extensions' markdown transforms. They are now Pi's own rendering inside the rail.
- Prototype patches could leave stale copies behind after uninstall, could stack on reload, and clashed with the upstream `pi-zentui` package's registry.

#### Fixed — working HUD (shimmer)

- The live token counter stayed at `↓ 1 token` on Anthropic models while streaming (the provider's early placeholder count was treated as final).
- After an aborted or failed message the count dropped from thousands back to 1.
- The completion notice measured only the last turn ("Sparkled for 0s" after a run with tool calls); it now covers the whole run.
- The completion notice used an invalid notification type, and also appeared after Esc or errors. It now shows only after successful runs, once Pi has fully settled (after retries/compaction).
- The spinner verb changed after every tool call; it now stays the same for the whole run.
- The "stalled" coral fade and the tool-use pulse were never actually shown; both now work.
- The highlight popped in at the left edge instead of sweeping in smoothly; the first thinking frame could glow at a random phase.
- ©, ® and ™ were counted as two tokens each in the live estimate.
- In RPC mode every prompt sent clients a notification full of raw terminal escapes; print/json modes ran animation timers for nothing. Effects now run only in the interactive TUI.

#### Fixed — matrix, header, theme

- Matrix listened to `session_switch`, an event Pi removed in 0.65.
- Matrix and shimmer both drove Pi's working indicator; switching matrix off mid-run reset the shimmer to Pi's default spinner.
- `/muelsyse-matrix preview` claimed "5 seconds" but did nothing while disabled or outside the TUI, and stopped the rain for the rest of a running turn.
- A failed matrix settings write left the in-memory state changed without stopping the rain or telling you.
- The header's top padding grew with terminal height (19 blank lines at 50 rows) and changed on every vertical resize; it is now a fixed single line.
- Theme `dim` text failed WCAG AA contrast (3.5:1 → 4.7:1); muted borders are more visible.

#### Performance

- No redraws while idle (footer pulse is now opt-in and only runs while the agent works).
- Context-usage and usage-total calculations are cached like Pi's own footer instead of rescanning the session on every frame.
- Working HUD: one ~11 Hz clock instead of three (≈40–55 renders/s → ≤11).
- Git: one `status --porcelain=2 --branch --show-stash` plus one `rev-parse` per refresh instead of ~10 processes; nothing runs when git segments are hidden.
- Runtime/package probes run only when their segments are visible, once per change, never in non-interactive modes.
- Tool cards are cached with no size limit and do no per-line regex work; the gradient cache no longer thrashes on animation frames.
- The clock segment wakes once a minute instead of every second.

#### Security and robustness

- A malicious repository could inject terminal escape sequences (e.g. clipboard writes) through `package.json` version, folder names, branch/tag names or runtime output shown in the footer. All external text is now sanitised.
- Git runs with `GIT_OPTIONAL_LOCKS=0` and `-c core.fsmonitor=false`, and project probes (git, runtime, package) are skipped in untrusted projects.
- Config and state writes (Zentui, matrix, changelog) are atomic; broken config files are reported instead of silently replaced.
- Matrix settings now live in Pi's agent directory (respects `PI_CODING_AGENT_DIR`) like the other pack files.
- All UI work is guarded for disposed UIs and non-TUI modes; shutdown cleanup is idempotent; nothing prints with `console.*` while the TUI runs.

#### Changed

- **Muelsyse Matrix is off by default** and is now a rain widget only (it no longer changes the working message or indicator). Turn it on with `/muelsyse-matrix on`; saved settings are kept.
- New `/muelsyse-matrix` subcommands: `help`, `height N`; clearer validation and "not saved" messages.
- The footer pulse animation is opt-in: `/zentui pulse on` (setting `animations.footerPulse`).
- New switch `features.messageStyle` (`/zentui messages on|off`) controls message and tool styling independently of the editor. Existing configs keep their previous look: if you had the editor turned off, message styling stays off until you enable it.
- Tool cards keep the muelsyse frame and status rail, but edit/self-rendered tools and image results use Pi's stock rendering.
- The "Thought trail" tree is gone; hidden thinking shows a `✦ Thought` label.
- Header height is fixed; the header is only installed in the interactive TUI.
- Runtime segment detects bun, deno, node, python, go, rust, ruby and java (~50 rarely used runtimes removed). Package version reads `package.json`, `Cargo.toml`, `pyproject.toml` and `composer.json`.
- Default background project refresh is every 60 s (and only when something visible needs it).
- Colors follow Pi's detected color mode: 24-bit on truecolor terminals, nearest 256-color otherwise, none with `NO_COLOR`.
- Theme adds scrollbar and search-match colors for Pi's fullscreen mode.

#### Removed

- The experimental fixed-editor compositor (`fixedEditor` settings and `/zentui fixed-editor`). It was already disabled on Pi 0.84+; use Pi's `"tuiMode": "fullscreen"`. Old `fixedEditor` settings are removed from your config automatically (with a one-time notice if it was enabled).
- The `!cmd` output restyling and the tool-body rewriting described above.
- Unused code paths and exports (dual-quota leftovers, dead helpers).

#### Added

- A one-time "what's new" notice above the editor after installing or updating (hidden after your next message).
- `/muelsyse-changelog [version]` — scrollable changelog viewer inside Pi.
- `CHANGELOG.md` shipped with the package.

#### Developer

- Real unit tests (`npm test`, 100+ tests) and a strict type check (`npm run typecheck`) against Pi 0.99.1; the suite also passes against Pi 0.87.1 (`PI_HOST_ROOT=…`). Set up with `npm run dev:setup` (installs into `.dev/`, nothing is added to the package).
- `scripts/check.mjs` now validates the manifest, shipped files, peer dependencies, theme keys and changelog instead of regex-matching source code.
- The published package no longer ships `scripts/`.

### 1.1.6

- Remove the Codex/Grok subscription quota component, including footer chips, API polling, caching, and the `/dual-usage` command.

### Earlier versions

See [CHANGELOG.md](CHANGELOG.md) for 1.0.0 – 1.1.5.

## Development

```bash
npm run dev:setup     # installs Pi + TypeScript into .dev/ (not shipped, no package deps)
npm run verify        # package check + strict typecheck + unit tests
PI_HOST_ROOT=/path/to/node_modules/@earendil-works/pi-coding-agent npm test   # test against another Pi

npm run preview           # this pack's UI only, without other extensions or skills
npm run preview:open-tui  # this pack's UI plus the npm-installed Open TUI
```

Both previews reuse the local Pi agent directory and defaults, enabling the built-in
`read`, `bash`, `edit` and `write` tools; settings and sessions from a preview are written
to the same directory. The Open TUI entry point comes from `preview.extensions` in
`package.json`, and every other extension and skill stays unloaded.

## License

MIT. Claude shimmer is a muelsyse-themed fork of [pi-claude-shimmer](https://github.com/ouzhenkun/pi-claude-shimmer) (MIT). Zentui is a modified copy of [pi-zentui](https://github.com/lmilojevicc/pi-zentui) (MIT, see NOTICE). Telemetry is adapted from pi-open-tui (MIT, see `licenses/pi-open-tui-MIT.txt`).
