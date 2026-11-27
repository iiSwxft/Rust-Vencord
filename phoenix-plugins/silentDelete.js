// @description Silently deletes messages using the nonce exploit, bypassing message loggers
// @version 1.0.0
// @author iiSwxft

// adaptation: no timers in the runtime, but every awaited REST call is a
// network round trip, so the replacement always lands before the deletes are
// sent, which is all the original delays were for

const settings = phoenix.settings.define({
  replacementText: {
    type: "text",
    title: "Replacement text",
    description: "Text to replace the message with before deletion",
    default: "** **",
  },
  suppressNotifications: {
    type: "switch",
    title: "Suppress notifications",
    description: "Prevents pinging mentioned users when replacing",
    default: true,
  },
  deleteOriginal: {
    type: "switch",
    title: "Also delete original server-side",
    description: "Disable = reappears on reload",
    default: true,
  },
});

let myId = null;
phoenix.on(phoenix.gateway.ready, (payload) => {
  myId = payload.user?.id ?? null;
});

async function silentDeleteMessage(channelId, messageId, deleteOriginal = true) {
  try {
    const posted = await phoenix.discord.post(`/channels/${channelId}/messages`, {
      content: settings.replacementText,
      flags: settings.suppressNotifications ? 4096 : 0,
      nonce: messageId,
      tts: false,
    });
    if (!posted.ok) throw new Error(`replace failed: HTTP ${posted.status}`);
    const replacementId = posted.json()?.id;
    if (replacementId) await phoenix.discord.delete(`/channels/${channelId}/messages/${replacementId}`);
    if (deleteOriginal && settings.deleteOriginal) {
      await phoenix.discord.delete(`/channels/${channelId}/messages/${messageId}`);
    }
    return true;
  } catch (err) {
    phoenix.log.warn(`silent delete error: ${err}`);
    return false;
  }
}

phoenix.ui.addMessageAction({
  label: "Silent Delete",
  icon: "res://ic_mana_delete",
  danger: true,
  visible: (ctx) => Boolean(myId && ctx.message?.author?.id === myId),
  onPress(ctx) {
    if (!ctx.channelId) return;
    void silentDeleteMessage(ctx.channelId, ctx.messageId);
  },
});

phoenix.commands.register({
  name: "silentpurge",
  description: "Silently delete your recent messages in this channel: /silentpurge <count>",
  async execute(args, ctx) {
    const count = parseInt(args.trim(), 10);
    if (!count || count < 1 || count > 100 || !ctx.channelId || !myId) {
      ctx.reply("usage: /silentpurge <1-100> — run it in the target channel");
      return;
    }
    ctx.reply(`purging up to ${count} of your messages…`);

    const userMessages = [];
    let before;
    while (userMessages.length < count) {
      const res = await phoenix.discord.get(
        `/channels/${ctx.channelId}/messages?limit=100${before ? `&before=${before}` : ""}`,
      );
      if (!res.ok) break;
      const messages = res.json();
      if (!Array.isArray(messages) || !messages.length) break;
      for (const msg of messages) {
        if (msg.author?.id === myId) {
          userMessages.push(msg);
          if (userMessages.length >= count) break;
        }
      }
      before = messages[messages.length - 1].id;
      if (messages.length < 100) break;
    }

    let done = 0;
    for (const msg of userMessages) {
      if (await silentDeleteMessage(ctx.channelId, msg.id)) done++;
    }
    ctx.reply(`silently deleted ${done} message(s)`);
  },
});
