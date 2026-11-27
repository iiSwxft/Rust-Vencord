// @description Cycles custom statuses, manually or paced by incoming gateway traffic
// @version 1.0.0
// @author iiSwxft

// adaptation: the runtime has no timers, so the wall-clock interval is gone.
// auto mode advances once per `every` incoming message events instead, and
// /nextstatus steps manually. presence mode switching went through internal
// action creators in vencord, which don't exist here, so it's custom status only

const settings = phoenix.settings.define({
  statuses: {
    type: "text",
    title: "Statuses",
    description: "Newline-separated list of status texts to rotate",
    multiline: true,
    default: "Gaming\nCoding\nChilling",
  },
  auto: {
    type: "switch",
    title: "Auto-rotate",
    description: "Advance paced by incoming message traffic",
    default: false,
  },
  every: {
    type: "number",
    title: "Events per step",
    description: "Advance once per this many incoming message events",
    default: 50,
  },
});

let index = 0;
let counter = 0;

function list() {
  return settings.statuses.split("\n").map((s) => s.trim()).filter(Boolean);
}

async function apply(text) {
  const res = await phoenix.discord.patch("/users/@me/settings", { custom_status: { text } });
  if (!res.ok) phoenix.log.warn(`status update failed: HTTP ${res.status}`);
}

async function step() {
  const items = list();
  if (!items.length) return;
  index = index % items.length;
  await apply(items[index]);
  index++;
}

phoenix.on(phoenix.gateway.messageCreate, () => {
  if (!settings.auto) return;
  if (++counter % Math.max(1, Math.round(settings.every)) !== 0) return;
  void step();
});

phoenix.commands.register({
  name: "nextstatus",
  description: "Rotate to the next custom status",
  async execute(_args, ctx) {
    const items = list();
    if (!items.length) {
      ctx.reply("no statuses configured");
      return;
    }
    await step();
    ctx.reply(`status set to "${items[(index - 1 + items.length) % items.length]}"`);
  },
});
