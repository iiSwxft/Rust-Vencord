// @description Auto-replies to DMs and mentions while AFK mode is on
// @version 1.0.0
// @author iiSwxft

// adaptation: vencord read your presence status (idle/dnd) to decide. phoenix
// plugins get no self-presence surface, so the AFK switch itself is the state

const settings = phoenix.settings.define({
  enabled: {
    type: "switch",
    title: "AFK mode",
    description: "Auto-respond while this is on",
    default: false,
  },
  message: {
    type: "text",
    title: "Auto-reply message",
    default: "I am currently AFK. I will get back to you soon!",
  },
  replyToDMs: {
    type: "switch",
    title: "Reply to DMs",
    default: true,
  },
  replyToMentions: {
    type: "switch",
    title: "Reply to server @mentions",
    default: false,
  },
  cooldown: {
    type: "number",
    title: "Per-user cooldown (seconds)",
    default: 60,
  },
  ignoredUsers: {
    type: "text",
    title: "Ignored user IDs",
    description: "Comma-separated user IDs to never reply to",
    default: "",
  },
});

const lastReply = new Map();
let myId = null;

phoenix.on(phoenix.gateway.ready, (payload) => {
  myId = payload.user?.id ?? null;
});

phoenix.on(phoenix.gateway.messageCreate, (message) => {
  if (!settings.enabled || !myId) return;
  if (!message?.author || message.author.bot) return;
  if (message.author.id === myId) return;

  const isDM = message.channel_type === 1;
  const isMention =
    message.mentions?.some((u) => u.id === myId) ||
    (message.content ?? "").includes(`<@${myId}>`);

  if (!isDM && !isMention) return;
  if (isDM && !settings.replyToDMs) return;
  if (isMention && !isDM && !settings.replyToMentions) return;

  const ignored = settings.ignoredUsers.split(",").map((s) => s.trim()).filter(Boolean);
  if (ignored.includes(message.author.id)) return;

  const now = Date.now();
  if (now - (lastReply.get(message.author.id) ?? 0) < settings.cooldown * 1000) return;
  lastReply.set(message.author.id, now);

  phoenix.log.info(`replying to ${message.author.username} in ${message.channel_id}`);

  const body = { content: settings.message };
  if (isMention && !isDM) {
    body.message_reference = { message_id: message.id, channel_id: message.channel_id };
    body.allowed_mentions = { replied_user: true };
  }
  phoenix.discord.post(`/channels/${message.channel_id}/messages`, body).catch((err) =>
    phoenix.log.warn(`reply failed: ${err}`),
  );
});
