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
const expand = (path) => (path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(root, path));
// 额外扩展最后加载，优先接管 TUI 的页眉、页脚和编辑器；Open TUI 只在带 flag 时加入。
const extraExtensions = [
	...manifest.preview.extensions,
	...(process.argv.includes("--open-tui") ? manifest.preview.openTuiExtensions : []),
].map(expand);
const projectExtensions = manifest.pi.extensions.map((path) => resolve(root, path));
const extensions = [...projectExtensions, ...extraExtensions];
// Maestro 的 Skill 单独列出（--no-skills 仍会保留显式路径），其他插件的 Skill 不加载。
const skills = (manifest.preview.skills ?? []).map(expand);

console.log(`Pi preview config (local): ${agentDir}`);
console.log(
	`Theme: ${theme.name}; extensions: ${manifest.pi.extensions.length}; extra: ${extraExtensions.length}; skills: ${skills.length}`,
);
const result = spawnSync("pi", [
	"--offline", "--no-extensions", "--no-skills",
	// 不限制工具：Pi 自带工具与已加载扩展（maestro/teammate）的工具全部可用。
	"--verbose", "--theme", themePath, "--use-theme", theme.name,
	"--tui-mode", "fullscreen",
	...skills.flatMap((path) => ["--skill", path]),
	...extensions.flatMap((path) => ["-e", path]),
], {
	cwd: root,
	stdio: "inherit",
	env: process.env,
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pi preview terminated by ${result.signal}`);
process.exitCode = result.status;
