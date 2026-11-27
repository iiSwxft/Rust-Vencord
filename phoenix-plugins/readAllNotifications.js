// @description Mark everything as read with /readall
// @version 1.0.0
// @author iiSwxft

// adaptation: the button ui is impossible, so this is a slash command. without
// the read-state store we ack the latest known message of every channel seen
// through the gateway cache, which is exactly what the ack endpoint needs

const channels = new Map(); // channelId -> lastMessageId

phoenix.on(phoenix.gateway.ready, (payload) => {
  for (const c of payload.private_channels ?? []) {
    if (c.last_message_id) channels.set(c.id, c.last_message_id);
  }
});
phoenix.on(phoenix.gateway.guildCreate, (payload) => {
  for (const c of payload.channels ?? []) {
    if (c.last_message_id) channels.set(c.id, c.last_message_id);
  }
});
phoenix.on(phoenix.gateway.messageCreate, (payload) => {
  if (payload.channel_id && payload.id) channels.set(payload.channel_id, payload.id);
});

phoenix.commands.register({
  name: "readall",
  description: "Mark every channel with a known latest message as read",
  async execute(_args, ctx) {
    let acked = 0;
    let failed = 0;
    for (const [channelId, messageId] of channels) {
      const res = await phoenix.discord.post(`/channels/${channelId}/messages/${messageId}/ack`, {});
      if (res.ok || res.status === 400) acked++; // 400 = already read
      else failed++;
    }
    ctx.reply(failed ? `acked ${acked} channels, ${failed} failed` : `acked ${acked} channels`);
  },
});
