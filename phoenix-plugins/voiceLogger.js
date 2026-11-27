// @description Logs voice channel join/leave/move events, see who comes and goes
// @version 1.0.0
// @author iiSwxft

// adaptation: the settings-panel log viewer is a web-ui concept, so the log is
// viewed through /voicelog which opens a native page. channel/guild names are
// not in voice payloads, so entries carry ids

const settings = phoenix.settings.define({
  logSelf: {
    type: "switch",
    title: "Log your own voice activity",
    default: true,
  },
  logMutes: {
    type: "switch",
    title: "Log mute/unmute/deafen events",
    default: false,
  },
  ignoredGuilds: {
    type: "text",
    title: "Ignored server IDs",
    description: "Comma-separated server IDs to ignore",
    default: "",
  },
});

const logs = [];
const lastSeen = new Map();
let myId = null;

phoenix.on(phoenix.gateway.ready, (payload) => {
  myId = payload.user?.id ?? null;
});

function stamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function addLog(entry) {
  logs.unshift(entry);
  if (logs.length > 200) logs.length = 200;
}

if (phoenix.gateway.voiceStateUpdate) {
  phoenix.on(phoenix.gateway.voiceStateUpdate, (vs) => {
    const userId = vs.user_id ?? vs.member?.user?.id;
    if (!userId) return;
    const channelId = vs.channel_id ?? null;
    const guildId = vs.guild_id ?? null;

    if (!settings.logSelf && myId && userId === myId) return;
    if (guildId && settings.ignoredGuilds.split(",").map((s) => s.trim()).filter(Boolean).includes(guildId)) return;

    const prev = lastSeen.get(userId);
    const snap = {
      channelId,
      mute: !!vs.mute,
      deaf: !!vs.deaf,
      selfMute: !!vs.self_mute,
      selfDeaf: !!vs.self_deaf,
    };
    lastSeen.set(userId, snap);

    const username = vs.member?.user?.username ?? userId;
    const where = guildId ? `server ${guildId}` : "DM";
    const old = prev ?? { channelId: null, mute: false, deaf: false, selfMute: false, selfDeaf: false };

    if (channelId === old.channelId) {
      if (!settings.logMutes) return;
      if (snap.mute === old.mute && snap.deaf === old.deaf && snap.selfMute === old.selfMute && snap.selfDeaf === old.selfDeaf) return;
      addLog(`[${stamp()}] ${username} changed mute/deafen state in ${where}`);
      return;
    }

    if (channelId === null && old.channelId) {
      addLog(`[${stamp()}] ${username} LEFT channel ${old.channelId} in ${where}`);
    } else if (channelId && !old.channelId) {
      addLog(`[${stamp()}] ${username} JOINED channel ${channelId} in ${where}`);
    } else {
      addLog(`[${stamp()}] ${username} MOVED from channel ${old.channelId} to ${channelId} in ${where}`);
    }
  });
}

phoenix.commands.register({
  name: "voicelog",
  description: "Open the voice activity log",
  execute(_args, ctx) {
    if (!logs.length) {
      ctx.reply("no voice events logged yet");
      return;
    }
    phoenix.ui.openPage({
      title: `Voice Activity (${logs.length})`,
      sections: [{ type: "code", text: logs.join("\n"), monospace: true }],
    });
  },
});

phoenix.commands.register({
  name: "voicelogclear",
  description: "Clear the voice activity log",
  execute(_args, ctx) {
    logs.length = 0;
    ctx.reply("voice log cleared");
  },
});

phoenix.onUnload(() => {
  lastSeen.clear();
});
