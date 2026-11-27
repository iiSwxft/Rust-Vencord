// @description Hides embeds whose URLs match the blocklist, so crash-links never render
// @version 1.0.0
// @author iiSwxft

// adaptation: the vencord version suppressed window.onerror/rejections, which
// are web-runtime concepts phoenix doesn't have. what carries over is the
// embed firewall: strip crash-inducing embeds before the client renders them

const settings = phoenix.settings.define({
  blockedUrls: {
    type: "text",
    title: "Blocked URL patterns",
    description: "One pattern per line, partial match against embed URLs",
    multiline: true,
    default: "",
  },
  logBlocks: {
    type: "switch",
    title: "Log blocked embeds",
    default: true,
  },
});

function patterns() {
  return settings.blockedUrls.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
}

function scrub(message) {
  if (!message?.embeds?.length) return;
  const blocked = patterns();
  if (!blocked.length) return;
  const keep = message.embeds.filter((e) => {
    const urls = [e.url, e.image?.url, e.video?.url, e.thumbnail?.url].filter(Boolean);
    const hit = urls.some((u) => blocked.some((p) => u.includes(p)));
    if (hit && settings.logBlocks) phoenix.log.info(`blocked embed: ${urls.join(", ")}`);
    return !hit;
  });
  if (keep.length !== message.embeds.length) message.embeds = keep;
}

phoenix.hook(phoenix.gateway.messageCreate, {
  before(message) {
    scrub(message);
  },
});

phoenix.hook(phoenix.gateway.messageUpdate, {
  before(message) {
    scrub(message);
  },
});
