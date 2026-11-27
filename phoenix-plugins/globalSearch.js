// @description Search any channel, server, or all of your DMs from one place
// @version 1.0.0
// @author iiSwxft

// adaptation: no modal UI in the plugin api, so search runs through /gsearch.
// dm-wide search needs the dm channel list, which the plugin api does not
// expose, so /gsearchdms reads it from the gateway session cache instead

const DM_IDS_KEY = "dmChannelIds";

// remember dm channels as they show up in events
function noteChannel(channelId) {
  const ids = phoenix.storage.get(DM_IDS_KEY) ?? [];
  if (!ids.includes(channelId)) {
    ids.push(channelId);
    phoenix.storage.set(DM_IDS_KEY, ids);
  }
}

phoenix.on(phoenix.gateway.ready, (payload) => {
  const ids = (payload.private_channels ?? []).map((c) => c.id);
  phoenix.storage.set(DM_IDS_KEY, ids);
});
phoenix.on(phoenix.gateway.channelCreate, (payload) => {
  if (payload.type === 1) noteChannel(payload.id);
});

async function searchGuild(guildId, query) {
  const res = await phoenix.discord.get(
    `/guilds/${guildId}/messages/search?content=${encodeURIComponent(query)}&include_nsfw=true`
  );
  return res.ok ? res.json() : null;
}

async function searchChannel(channelId, query) {
  const res = await phoenix.discord.get(
    `/channels/${channelId}/messages/search?content=${encodeURIComponent(query)}`
  );
  return res.ok ? res.json() : null;
}

function formatHits(body, limit) {
  const groups = body?.messages ?? [];
  const lines = [];
  for (const group of groups) {
    for (const m of group) {
      if (m.hit) {
        lines.push(`[${m.channel_id}] ${m.author?.username ?? "?"}: ${(m.content ?? "").slice(0, 120)}`);
        if (lines.length >= limit) return lines;
      }
    }
  }
  return lines;
}

phoenix.commands.register({
  name: "gsearch",
  description: "Search a server or channel: /gsearch <guildId|channelId> <query>",
  args: [
    { name: "target", description: "Guild or channel ID", type: "text", required: true },
    { name: "query", description: "Search text", type: "text", required: true },
  ],
  async execute(args, ctx) {
    const target = String(args.target);
    const query = String(args.query);
    const body = target.length === 18 || target.length === 19
      ? (await searchGuild(target, query)) ?? (await searchChannel(target, query))
      : await searchChannel(target, query);
    if (!body) {
      ctx.reply("search failed (wrong id or no access)");
      return;
    }
    const lines = formatHits(body, 15);
    if (!lines.length) {
      ctx.reply(`no results for "${query}"`);
      return;
    }
    phoenix.ui.openPage({
      title: `Search: ${query}`,
      sections: [{ type: "code", text: lines.join("\n"), monospace: true }],
    });
  },
});

phoenix.commands.register({
  name: "gsearchdms",
  description: "Search across all of your open DMs: /gsearchdms <query>",
  args: [{ name: "query", description: "Search text", type: "text", required: true }],
  async execute(args, ctx) {
    const query = String(args.query);
    const ids = phoenix.storage.get(DM_IDS_KEY) ?? [];
    if (!ids.length) {
      ctx.reply("no dm channels cached yet (connect once first)");
      return;
    }
    const lines = [];
    for (const id of ids.slice(0, 50)) {
      const body = await searchChannel(id, query);
      if (body) lines.push(...formatHits(body, 3));
      if (lines.length >= 15) break;
    }
    if (!lines.length) {
      ctx.reply(`no dm results for "${query}"`);
      return;
    }
    phoenix.ui.openPage({
      title: `DM search: ${query}`,
      sections: [{ type: "code", text: lines.slice(0, 15).join("\n"), monospace: true }],
    });
  },
});
