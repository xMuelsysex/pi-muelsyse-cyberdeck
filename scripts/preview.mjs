import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
const hostRoot = resolve(npmRoot, "@earendil-works/pi-coding-agent");
const { getAgentDir } = await import(pathToFileURL(resolve(hostRoot, "dist/config.js")).href);
const agentDir = getAgentDir();
const syncedThemePath = resolve(agentDir, "themes/muelsyse-macaron.json");
const themePath = existsSync(syncedThemePath) ? syncedThemePath : resolve(root, manifest.pi.themes[0]);
const theme = JSON.parse(readFileSync(themePath, "utf8"));
// 额外扩展最后加载，优先接管 TUI 的页眉、页脚和编辑器。
const extraExtensions = process.argv.includes("--open-tui")
	? manifest.preview.extensions.map((path) =>
		path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(root, path),
	)
	: [];
const projectExtensions = manifest.pi.extensions.map((path) => resolve(root, path));
const extensions = [...projectExtensions, ...extraExtensions];

console.log(`Pi preview config (local): ${agentDir}`);
console.log(`Theme: ${theme.name}; extensions: ${manifest.pi.extensions.length}; extra: ${extraExtensions.length}`);
const result = spawnSync("pi", [
	"--offline", "--no-extensions", "--no-skills",
	// 本机 defaultTools 使用插件工具；隔离插件时显式启用 Pi 基本工具。
	"--tools", manifest.preview.tools.join(","),
	"--verbose", "--theme", themePath, "--use-theme", theme.name,
	"--tui-mode", "fullscreen",
	...extensions.flatMap((path) => ["-e", path]),
], {
	cwd: root,
	stdio: "inherit",
	env: process.env,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pi preview terminated by ${result.signal}`);
process.exitCode = result.status;
