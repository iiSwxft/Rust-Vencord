// syncs phoenix-plugins/*.js into the running Phoenix client through the
// sunbird debug shell (PUT /plugins/<name>), no Discord restart needed.
// requires the client running with the shell up (SUNBIRD_DEVTOOLS=1 launch).
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pluginsDir = join(root, "phoenix-plugins");
const tokenFile = join(process.env.LOCALAPPDATA, "DiscordPhoenix", "sunbird", "debug-shell-token");

const token = readFileSync(tokenFile, "utf8").trim();
const base = `http://127.0.0.1:4242`;

for (const file of readdirSync(pluginsDir).filter(f => f.endsWith(".js"))) {
    const name = file.slice(0, -3);
    const source = readFileSync(join(pluginsDir, file), "utf8");
    const res = await fetch(`${base}/plugins/${encodeURIComponent(name)}?token=${token}`, {
        method: "PUT",
        body: source
    });
    const text = await res.text();
    console.log(`${name}: ${res.status} ${text.replace(/\s+/g, " ").slice(0, 120)}`);
}

const list = await (await fetch(`${base}/plugins?token=${token}`)).json();
console.log("\nclient state:");
for (const p of list.plugins ?? list) console.log(`  ${p.name}: enabled=${p.enabled} error=${p.error ?? "none"}`);
