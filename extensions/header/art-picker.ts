import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, SelectList, truncateToWidth, type SelectItem } from "@earendil-works/pi-tui";

// 文件名只清理显示文本，选中后仍使用原始路径。
const displayPath = (path: string) => path.replace(/[\x00-\x1f\x7f-\x9f]/g, "?");

export function pickArtwork(ctx: ExtensionContext): Promise<string | undefined> {
  return ctx.ui.custom<string | undefined>((tui, theme, _keys, done) => {
    let directory = ctx.cwd;
    let items: SelectItem[] = [];
    let list: SelectList;
    let error = "";
    let visibleRows = 0;

    const openDirectory = (path: string) => {
      try {
        const entries = readdirSync(path, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() || entry.isFile() || entry.isSymbolicLink())
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
        items = entries.map((entry) => ({
          value: join(path, entry.name),
          label: `${entry.isDirectory() ? "[dir] " : "      "}${displayPath(entry.name)}${entry.isDirectory() ? "/" : entry.isSymbolicLink() ? "@" : ""}`,
        }));
        if (dirname(path) !== path) items.unshift({ value: dirname(path), label: "[dir] ../" });
        directory = path;
        error = "";
        visibleRows = 0;
      } catch (cause) {
        error = `Cannot open directory: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
      tui.requestRender();
    };

    const select = (item: SelectItem) => {
      try {
        const stat = statSync(item.value);
        if (stat.isDirectory()) openDirectory(item.value);
        else if (stat.isFile()) done(item.value);
        else error = "Select a regular text file or directory.";
      } catch (cause) {
        error = `Cannot select path: ${cause instanceof Error ? cause.message : String(cause)}`;
      }
      tui.requestRender();
    };

    openDirectory(directory);
    return {
      render(width: number): string[] {
        const rows = Math.max(1, Math.min(items.length || 1, tui.terminal.rows - 7));
        if (rows !== visibleRows) {
          const selected = list?.getSelectedItem()?.value;
          list = new SelectList(items, rows, {
            selectedPrefix: (text) => theme.fg("accent", text),
            selectedText: (text) => theme.fg("accent", text),
            description: (text) => theme.fg("muted", text),
            scrollInfo: (text) => theme.fg("dim", text),
            noMatch: () => theme.fg("muted", "  Empty directory"),
          });
          list.onSelect = select;
          list.onCancel = () => done(undefined);
          if (selected) list.setSelectedIndex(items.findIndex((item) => item.value === selected));
          visibleRows = rows;
        }
        return [
          theme.fg("accent", theme.bold("Load Muelsyse artwork")),
          theme.fg("muted", displayPath(directory)),
          "",
          ...list.render(Math.max(4, width)),
          ...(error ? [theme.fg("error", displayPath(error))] : []),
          "",
          theme.fg("dim", "↑↓ select · Enter open/load · ←/Backspace parent · Esc cancel"),
        ].map((line) => truncateToWidth(line, width, "…"));
      },
      handleInput(data: string): void {
        if (matchesKey(data, "left") || matchesKey(data, "backspace")) openDirectory(dirname(directory));
        else list?.handleInput(data);
        tui.requestRender();
      },
      invalidate(): void {
        list?.invalidate();
      },
    };
  });
}
