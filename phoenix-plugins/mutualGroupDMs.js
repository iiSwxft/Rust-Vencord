// @description Shows mutual group DMs you share with a user via /mutualgds
// @version 1.0.0
// @author iiSwxft

// adaptation: profile patching is impossible, so this is a slash command. the
// group dm list comes from the gateway session cache instead of ChannelStore

const groupDms = new Map(); // channelId -> {name, recipients: Set<userId>}

phoenix.on(phoenix.gateway.ready, (payload) => {
  for (const c of payload.private_channels ?? []) {
    if (c.type === 3) {
      groupDms.set(c.id, {
        name: c.name ?? `group ${c.id}`,
        recipients: new Set((c.recipients ?? []).map((u) => u.id)),
      });
    }
  }
});
phoenix.on(phoenix.gateway.channelCreate, (payload) => {
  if (payload.type === 3) {
    groupDms.set(payload.id, {
      name: payload.name ?? `group ${payload.id}`,
      recipients: new Set((payload.recipients ?? []).map((u) => u.id)),
    });
  }
});
phoenix.on(phoenix.gateway.channelDelete, (payload) => {
  groupDms.delete(payload.id);
});
if (phoenix.gateway.channelRecipientAdd) {
  phoenix.on(phoenix.gateway.channelRecipientAdd, (p) => {
    groupDms.get(p.channel_id)?.recipients.add(p.user?.id);
  });
}
if (phoenix.gateway.channelRecipientRemove) {
  phoenix.on(phoenix.gateway.channelRecipientRemove, (p) => {
    groupDms.get(p.channel_id)?.recipients.delete(p.user?.id);
  });
}

phoenix.commands.register({
  name: "mutualgds",
  description: "List group DMs you share with a user: /mutualgds <userId>",
  args: [{ name: "userId", description: "User ID", type: "text", required: true }],
  execute(args, ctx) {
    const userId = String(args.userId);
    const shared = [...groupDms.entries()].filter(([, g]) => g.recipients.has(userId));
    if (!shared.length) {
      ctx.reply("no mutual group dms found (cache only covers groups seen since connect)");
      return;
    }
    phoenix.ui.openPage({
      title: `Mutual group DMs with ${userId} (${shared.length})`,
      sections: [
        {
          type: "code",
          text: shared.map(([id, g]) => `${g.name}  (${id})`).join("\n"),
          monospace: true,
        },
      ],
    });
  },
});
