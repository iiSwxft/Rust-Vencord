// @description Cycles custom statuses on a wall-clock interval
// @version 2.0.0
// @author iiSwxft

// full parity now that the runtime has timers. presence mode switching went
// through internal action creators in vencord, which don't exist here, so
// it's custom status only

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
    description: "Advance on a wall-clock interval",
    default: false,
  },
  intervalSeconds: {
    type: "number",
    title: "Seconds between steps",
    default: 60,
  },
});

let index = 0;
let timer = null;
let manualOn = false;

function rotating() {
  return settings.auto || manualOn;
}

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

function restartTimer() {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (rotating() && list().length) {
    timer = setInterval(() => void step(), Math.max(5, settings.intervalSeconds) * 1000);
  }
}

// re-arm whenever settings change
phoenix.on(phoenix.gateway.ready, restartTimer);

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

phoenix.commands.register({
  name: "rotatoron",
  description: "Start the wall-clock rotation",
  execute(_args, ctx) {
    manualOn = true;
    restartTimer();
    ctx.reply("rotation started");
  },
});

phoenix.commands.register({
  name: "rotatoroff",
  description: "Stop the rotation",
  execute(_args, ctx) {
    manualOn = false;
    restartTimer();
    ctx.reply("rotation stopped");
  },
});

phoenix.onUnload(() => {
  if (timer !== null) clearInterval(timer);
});

if (rotating()) restartTimer();
