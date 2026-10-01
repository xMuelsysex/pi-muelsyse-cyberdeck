import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const agentDir = resolve(root, ".pi-preview");
const themePath = resolve(root, manifest.pi.themes[0]);
const theme = JSON.parse(readFileSync(themePath, "utf8"));
mkdirSync(agentDir, { recursive: true });

console.log(`Pi preview config: ${agentDir}`);
console.log(`Theme: ${theme.name}; extensions: ${manifest.pi.extensions.length}`);
const result = spawnSync("pi", [
	"--offline", "--no-session", "--no-extensions", "--no-skills",
	"--no-prompt-templates", "--no-context-files", "--no-themes", "--no-tools",
	"--verbose", "--theme", themePath, "--use-theme", theme.name,
	"--tui-mode", "fullscreen",
	...manifest.pi.extensions.flatMap((path) => ["-e", resolve(root, path)]),
], {
	cwd: root,
	stdio: "inherit",
	env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
});
if (result.error) throw result.error;
if (result.signal) throw new Error(`Pi preview terminated by ${result.signal}`);
process.exitCode = result.status;
