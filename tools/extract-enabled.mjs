// Extracts the enabled-plugin list from Vencord's leveldb localStorage in a Discord profile
import fs from "node:fs";

function scan(dir, label) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".log") || f.endsWith(".ldb"));
  for (const f of files) {
    const buf = fs.readFileSync(dir + "/" + f);
    const key16 = Buffer.from("VencordSettings".split("").join("\0") + "\0", "latin1");
    let idx = -1;
    for (let i = 0; i + key16.length <= buf.length; i++) {
      if (buf.compare(key16, 0, key16.length, i, i + key16.length) === 0) {
        idx = i;
        break;
      }
    }
    if (idx < 0) continue;
    const text = buf.slice(idx, Math.min(buf.length, idx + 3_000_000)).toString("utf16le");
    const start = text.indexOf('{"plugins"');
    if (start < 0) continue;
    let depth = 0,
      end = -1,
      inStr = false,
      esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    try {
      const json = JSON.parse(text.slice(start, end));
      const names = Object.keys(json.plugins || {}).filter((k) => json.plugins[k].enabled);
      console.log(`${label}/${f} enabled=${names.length}`);
      names.forEach((n) => console.log("  " + n));
      fs.writeFileSync(process.env.TEMP + `/vencord-enabled-${label}.json`, JSON.stringify(names));
      return true;
    } catch (e) {
      console.log(`${label} parse fail ${e.message}`);
    }
  }
}

scan(process.env.APPDATA + "/discord/Local Storage/leveldb", "stable");
console.log("---");
scan(process.env.APPDATA + "/discordcanary/Local Storage/leveldb", "canary");
