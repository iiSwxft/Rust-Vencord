// @description Alerts when a login appears from a location that is not yours
// @version 1.0.0
// @author iiSwxft

// adaptation: the localStorage strip/trap half is web-specific and meaningless
// in phoenix, where the token never touches localStorage. what carries over is
// session watching. no timers exist, so instead of polling every 5 minutes it
// checks at startup and on demand via /sessionscheck

const settings = phoenix.settings.define({
  alertOnNewLocation: {
    type: "switch",
    title: "Alert on new-location logins",
    default: true,
  },
});

async function checkSessions(notify) {
  const res = await phoenix.discord.get("/auth/sessions");
  if (!res.ok) {
    phoenix.log.warn(`session check failed: HTTP ${res.status}`);
    return [];
  }
  const sessions = res.json()?.user_sessions;
  if (!Array.isArray(sessions)) return [];

  const known = phoenix.storage.get("sessions") ?? {};
  const firstRun = Object.keys(known).length === 0;
  let baseline = phoenix.storage.get("ownLocation");
  if (!baseline) {
    const counts = new Map();
    for (const s of sessions) {
      const loc = s.client_info?.location;
      if (loc) counts.set(loc, (counts.get(loc) ?? 0) + 1);
    }
    baseline = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (baseline) phoenix.storage.set("ownLocation", baseline);
  }

  const fresh = [];
  let changed = false;
  for (const s of sessions) {
    const h = s.id_hash;
    if (!h || known[h]) continue;
    known[h] = s.client_info?.location ?? "?";
    changed = true;
    if (firstRun) continue;
    const info = s.client_info ?? {};
    fresh.push(`${info.os ?? "?"} · ${info.platform ?? "?"} · ${info.location ?? "unknown location"}`);
    if (settings.alertOnNewLocation && notify && info.location && baseline && info.location !== baseline) {
      phoenix.ui.notify({
        title: "New login from a different location",
        body: `${info.location} (${info.os ?? "unknown device"})`,
        durationMs: 10000,
      });
    }
  }
  if (changed) phoenix.storage.set("sessions", known);
  return fresh;
}

phoenix.on(phoenix.gateway.ready, () => {
  void checkSessions(true);
});

phoenix.commands.register({
  name: "sessionscheck",
  description: "Check your Discord sessions for logins from new locations",
  async execute(_args, ctx) {
    const fresh = await checkSessions(false);
    ctx.reply(fresh.length ? `new sessions:\n${fresh.join("\n")}` : "no new sessions");
  },
});
