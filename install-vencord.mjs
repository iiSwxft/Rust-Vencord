/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2026 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Vencord installer — detects Discord branches (stable, canary, ptb, dev),
// lets you pick one, and patches it by swapping resources\app.asar for a
// shim asar that loads dist/patcher.js (which boots the real _app.asar).
//
// the resources\app folder trick is ignored by current Discord builds, so
// the real app.asar gets renamed to _app.asar and ours takes its place.
//
// interactive:  node install-vencord.mjs
// scripted:     node install-vencord.mjs --branch canary --action install|uninstall
// requires `pnpm build` first.

import { createPackage } from "@electron/asar";
import { existsSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const VENCORD_DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(VENCORD_DIR, "dist");
const REQUIRED = ["patcher.js", "renderer.js", "preload.js"];

const BRANCHES = ["Discord", "DiscordCanary", "DiscordPTB", "DiscordDevelopment"];

const PACKAGE_JSON = { name: "discord", main: "index.js" };

// patcher.js reads require.main.path ending in app.asar → boots _app.asar itself
const INDEX_JS = `// Vencord shim — loads Vencord's patcher, which boots the real _app.asar
require(${JSON.stringify(join(DIST, "patcher.js").replaceAll("\\", "/"))});
`;

function parseVersion(name) {
    const m = name.match(/^app-(\d+)\.(\d+)\.(\d+)$/);
    return m ? m.slice(1).map(Number) : null;
}

function detectInstalls() {
    const localAppData = process.env.LOCALAPPDATA;
    const installs = [];
    for (const branch of BRANCHES) {
        const base = join(localAppData, branch);
        if (!existsSync(base)) continue;

        const versions = readdirSync(base)
            .map(d => ({ dir: join(base, d), version: parseVersion(d) }))
            .filter(v => v.version && (existsSync(join(v.dir, "resources", "app.asar")) || existsSync(join(v.dir, "resources", "_app.asar"))))
            .sort((a, b) => {
                for (let i = 0; i < 3; i++) {
                    if (a.version[i] !== b.version[i]) return b.version[i] - a.version[i];
                }
                return 0;
            });

        if (!versions.length) continue;
        const latest = versions[0];
        installs.push({
            branch,
            dir: latest.dir,
            version: latest.version.join("."),
            resources: join(latest.dir, "resources"),
            patched: existsSync(join(latest.dir, "resources", "_app.asar"))
        });
    }
    return installs;
}

async function pick(rl, prompt, options) {
    while (true) {
        const ans = (await rl.question(`${prompt} `)).trim();
        const n = Number(ans);
        if (n >= 1 && n <= options.length) return options[n - 1];
        if (ans.toLowerCase() === "q") return null;
        console.log("  pick a number, or q to bail");
    }
}

function install(target) {
    const realAsar = join(target.resources, "app.asar");
    const origAsar = join(target.resources, "_app.asar");
    const legacyShimDir = join(target.resources, "app");

    // clean the dead resources\app folder shim if a previous run left one
    if (existsSync(legacyShimDir)) rmSync(legacyShimDir, { recursive: true, force: true });

    // stash the real asar
    if (!existsSync(origAsar)) {
        if (!existsSync(realAsar)) throw new Error(`no app.asar in ${target.resources}`);
        renameSync(realAsar, origAsar);
    }

    // build the shim asar
    const staging = mkdtempSync(join(tmpdir(), "vencord-asar-"));
    writeFileSync(join(staging, "package.json"), JSON.stringify(PACKAGE_JSON, null, 4));
    writeFileSync(join(staging, "index.js"), INDEX_JS);
    return createPackage(staging, realAsar).then(() => rmSync(staging, { recursive: true, force: true }));
}

function uninstall(target) {
    const realAsar = join(target.resources, "app.asar");
    const origAsar = join(target.resources, "_app.asar");

    if (!existsSync(origAsar)) throw new Error("not patched (no _app.asar found)");
    if (existsSync(realAsar)) rmSync(realAsar, { force: true });
    renameSync(origAsar, realAsar);
}

const rl = createInterface({ input: stdin, output: stdout });

const missing = REQUIRED.filter(f => !existsSync(join(DIST, f)));
if (missing.length) {
    console.error(`dist/ is missing ${missing.join(", ")} — run \`pnpm build\` first.`);
    process.exit(1);
}

const installs = detectInstalls();
if (!installs.length) {
    console.error("no Discord installs found under %LOCALAPPDATA%");
    process.exit(1);
}

const argv = process.argv.slice(2);
const argFlag = name => argv.includes(name) ? argv[argv.indexOf(name) + 1] : null;
const argBranch = argFlag("--branch");
const argAction = argFlag("--action");

console.log("detected installs:");
installs.forEach((i, n) => console.log(
    `  [${n + 1}] ${i.branch} ${i.version}${i.patched ? "  [already patched]" : ""}`
));

let target;
if (argBranch) {
    target = installs.find(i => i.branch.toLowerCase().includes(argBranch.toLowerCase()));
    if (!target) {
        console.error(`no install matching --branch ${argBranch}`);
        process.exit(1);
    }
} else {
    target = await pick(rl, "install into #? (q quits)", installs.map(i => ({
        label: `${i.branch} ${i.version}${i.patched ? "  [already patched]" : ""}`,
        ...i
    })));
}
if (!target) process.exit(0);

let action;
if (argAction) {
    action = { value: argAction };
} else {
    action = await pick(rl, "do what? ", [
        { label: target.patched ? "reinstall (rewrite shim)" : "install", value: "install" },
        ...(target.patched ? [{ label: "uninstall (restore original asar)", value: "uninstall" }] : [])
    ]);
}
if (!action) process.exit(0);

try {
    if (action.value === "uninstall") {
        uninstall(target);
        console.log(`unpatched ${target.branch} — original app.asar restored. restart Discord.`);
    } else {
        await install(target);
        console.log(`patched ${target.branch} ${target.version}`);
        console.log(`  ${target.resources}\\app.asar -> Vencord shim`);
        console.log(`  ${target.resources}\\_app.asar -> original Discord`);
        console.log("restart Discord (full quit + relaunch) to load Vencord.");
        console.log("note: if you move/rename the Vencord folder, rerun this installer.");
        console.log("note: when Discord self-updates, rerun this installer on the new version.");
    }
} catch (e) {
    console.error(`failed: ${e.message}`);
    if (e.code === "EPERM" || e.code === "EBUSY") {
        console.error("Discord is probably running — fully quit it first (tray icon -> quit).");
    }
    process.exit(1);
}

rl.close();
