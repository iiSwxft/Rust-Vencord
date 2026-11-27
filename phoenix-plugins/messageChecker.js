// @description Watches incoming messages for a trigger text and mass-pings + mass-DMs you when it appears
// @version 1.0.0
// @author iiSwxft

const { gateway } = phoenix;

const settings = phoenix.settings.define({
  trigger: {
    type: "text",
    title: "Trigger text",
    description: "Text to watch for in incoming messages (empty = fire on ANY message in the watched channel)",
    default: "",
  },
  isRegex: {
    type: "switch",
    title: "Trigger is regex",
    description: "Treat the trigger text as a regular expression (case-insensitive)",
    default: false,
  },
  channelId: {
    type: "text",
    title: "Watched channel ID",
    description: "Only watch this channel ID for trigger messages, the announcements channel",
    default: "1223264470386868328",
  },
  appearChannelId: {
    type: "text",
    title: "Appear-watch channel ID",
    description: "Alert when this channel becomes visible (e.g. hidden tickets channel)",
    default: "1223263614866161805",
  },
  authorId: {
    type: "text",
    title: "Author ID filter",
    description: "Only trigger on messages from this user ID (empty = anyone)",
    default: "",
  },
  webhookUrl: {
    type: "secret",
    title: "Webhook URL",
    description: "Webhook URL that receives the ping spam",
    default: "https://discord.com/api/webhooks/1571008884884246639/EBsn_z7yuT90wu5ulZ1xGWpP6ziz0hXAThw9AZYMLHAY6-khGQEbwIUJfqZOpcFDIw-f",
  },
  targetUserId: {
    type: "text",
    title: "Target user ID",
    description: "User ID to ping via webhook and mass-DM (your main account)",
    default: "481638881750417418",
  },
  pingCount: {
    type: "number",
    title: "Webhook pings per alert",
    description: "0 = spam until /stopalert or the plugin is turned off",
    default: 0,
  },
  dmCount: {
    type: "number",
    title: "DMs per alert",
    description: "0 = spam until stopped",
    default: 0,
  },
  cooldownMs: {
    type: "number",
    title: "Alert cooldown (ms)",
    description: "Cooldown between alerts in milliseconds",
    default: 30000,
  },
  testWebhook: {
    type: "button",
    title: "Test webhook",
    async onPress() {
      try {
        await postWebhook("test ping — config works");
        phoenix.ui.toast("webhook sent — check the channel");
      } catch (err) {
        phoenix.ui.toast(`webhook failed: ${err}`);
      }
    },
  },
  testDm: {
    type: "button",
    title: "Test DM",
    async onPress() {
      try {
        await testDm();
        phoenix.ui.toast("dm sent — check your main");
      } catch (err) {
        phoenix.ui.toast(`dm failed: ${err}`);
      }
    },
  },
});

let lastTrigger = 0;
let alerting = false;
let appearArmed = true;
let myId = null;

phoenix.on(gateway.ready, (payload) => {
  myId = payload.user?.id ?? null;
});

function matches(content) {
  const trigger = settings.trigger;
  if (!trigger) return Boolean(settings.channelId);
  if (settings.isRegex) {
    try {
      return new RegExp(trigger, "i").test(content);
    } catch {
      return false;
    }
  }
  return content.toLowerCase().includes(trigger.toLowerCase());
}

function jumpUrl(m) {
  return `https://discord.com/channels/${m.guild_id ?? "@me"}/${m.channel_id}/${m.id}`;
}

function contextLine(m) {
  const body = m.content?.length > 400 ? `${m.content.slice(0, 400)}…` : m.content;
  return `**MessageChecker** — trigger hit\n> ${body}\nfrom \`${m.author?.username ?? "?"}\` in channel ${m.channel_id}\n${jumpUrl(m)}`;
}

// no timers exist in the QuickJS runtime, so pacing comes from each request's
// network round trip instead of delayMs; 429s burn one round trip and retry
async function postWebhook(content) {
  const res = await phoenix.fetch(settings.webhookUrl, {
    method: "POST",
    body: { content: `@everyone ${content}`, allowed_mentions: { parse: ["everyone"] } },
  });
  if (!res.ok && res.status !== 429) throw new Error(`HTTP ${res.status}`);
}

async function sendDm(dmChannelId, content) {
  const res = await phoenix.discord.post(`/channels/${dmChannelId}/messages`, {
    content: content.slice(0, 2000),
    tts: false,
  });
  if (!res.ok && res.status !== 429) throw new Error(`HTTP ${res.status}`);
}

async function openDm() {
  const res = await phoenix.discord.post("/users/@me/channels", { recipient_id: settings.targetUserId });
  if (!res.ok) throw new Error(`could not open DM — HTTP ${res.status}`);
  return res.json()?.id;
}

async function testDm() {
  const dmId = await openDm();
  if (!dmId) throw new Error("could not open DM — check targetUserId / blocked / no mutual server");
  await sendDm(dmId, `<@${settings.targetUserId}> test dm — config works`);
}

function fireAlert(ctx) {
  const now = Date.now();
  if (alerting || now - lastTrigger < settings.cooldownMs) return;
  lastTrigger = now;
  void runAlert(ctx);
}

function fireOnAppear(channel) {
  const id = settings.appearChannelId;
  if (!appearArmed || !id || channel?.id !== id) return;
  appearArmed = false;
  const name = channel.name ? `#${channel.name}` : `channel ${channel.id}`;
  const link = `https://discord.com/channels/${channel.guild_id ?? "@me"}/${channel.id}`;
  fireAlert(`**MessageChecker** — ${name} just became visible\n${link}`);
}

function rearmOnHide(channel) {
  if (channel?.id === settings.appearChannelId) appearArmed = true;
}

async function runAlert(ctx) {
  alerting = true;
  const dismiss = phoenix.ui.notify({
    title: "MessageChecker is spamming pings + DMs",
    body: "tap to STOP",
    durationMs: 0,
    onPress: () => {
      alerting = false;
    },
  });

  const dmJob = (async () => {
    try {
      const dmId = await openDm();
      if (!dmId) return;
      for (let i = 0; alerting && (settings.dmCount <= 0 || i < settings.dmCount); i++) {
        try {
          await sendDm(dmId, `<@${settings.targetUserId}> ${i === 0 ? ctx : "trigger hit — check messages"}`);
        } catch {
          // blocked/no perms, keep the loop alive
        }
      }
    } catch {
      // no perms / blocked, webhook still fires
    }
  })();

  const pingJob = (async () => {
    for (let i = 0; alerting && (settings.pingCount <= 0 || i < settings.pingCount); i++) {
      try {
        await postWebhook(i === 0 ? ctx : "");
      } catch {
        // network failure, keep the loop alive
      }
    }
  })();

  await Promise.all([dmJob, pingJob]);
  alerting = false;
  dismiss();
}

phoenix.on(gateway.messageCreate, (message) => {
  if (alerting || !message?.content) return;
  if (message.webhook_id) return;
  if (myId && message.author?.id === myId) return;
  if (settings.channelId && message.channel_id !== settings.channelId) return;
  if (settings.authorId && message.author?.id !== settings.authorId) return;
  if (!matches(message.content)) return;
  fireAlert(contextLine(message));
});

// discord fires CHANNEL_CREATE when a hidden channel becomes visible to you
// (perm overwrite change), not just when a channel is new, CHANNEL_UPDATE
// catches the already-in-store case
if (gateway.channelCreate) phoenix.on(gateway.channelCreate, fireOnAppear);
if (gateway.channelUpdate) phoenix.on(gateway.channelUpdate, fireOnAppear);
// channel hid again (ticket closed / perms revoked), re-arm
if (gateway.channelDelete) phoenix.on(gateway.channelDelete, rearmOnHide);

phoenix.commands.register({
  name: "checkalert",
  description: "Fire one test ping + DM to verify the MessageChecker config works",
  async execute(_args, ctx) {
    if (!settings.webhookUrl || !settings.targetUserId) {
      ctx.reply("Set webhookUrl and targetUserId first.");
      return;
    }
    ctx.reply("Firing test ping + DM…");
    try {
      await postWebhook("test ping — config works");
      await testDm();
      ctx.reply("Done. Check your main account.");
    } catch (err) {
      ctx.reply(`Failed: ${err}`);
    }
  },
});

phoenix.commands.register({
  name: "stopalert",
  description: "Stop the active MessageChecker spam loop",
  execute(_args, ctx) {
    if (!alerting) {
      ctx.reply("No alert running.");
      return;
    }
    alerting = false;
    ctx.reply("Stopping — loops exit within one send cycle.");
  },
});

phoenix.onUnload(() => {
  alerting = false;
});
