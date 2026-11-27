// @description Custom Rich Presence injected into outgoing presence updates
// @version 1.0.0
// @author iiSwxft

// adaptation: the original dispatches a local presence update through flux, which
// re-sends gateway op 3. plugins cannot initiate gateway frames, but outgoing
// op 3 is hookable, so the custom activity rides along on every presence update
// the client sends. change your status once after enabling to apply it

const settings = phoenix.settings.define({
  enabled: { type: "switch", title: "Enable custom Rich Presence", default: false },
  name: { type: "text", title: "Activity name", default: "Phoenix" },
  details: { type: "text", title: "Details line", default: "" },
  state: { type: "text", title: "State line", default: "" },
  activityType: {
    type: "number",
    title: "Activity type",
    description: "0 playing, 1 streaming, 2 listening, 3 watching, 5 competing",
    default: 0,
  },
  largeImage: { type: "text", title: "Large image key (mp: or asset)", default: "" },
  largeText: { type: "text", title: "Large image tooltip", default: "" },
  smallImage: { type: "text", title: "Small image key", default: "" },
  smallText: { type: "text", title: "Small image tooltip", default: "" },
});

function buildActivity() {
  const a = {
    name: settings.name || "Phoenix",
    type: settings.activityType ?? 0,
  };
  if (settings.details) a.details = settings.details;
  if (settings.state) a.state = settings.state;
  const assets = {};
  if (settings.largeImage) assets.large_image = settings.largeImage;
  if (settings.largeText) assets.large_text = settings.largeText;
  if (settings.smallImage) assets.small_image = settings.smallImage;
  if (settings.smallText) assets.small_text = settings.smallText;
  if (Object.keys(assets).length) a.assets = assets;
  return a;
}

phoenix.gateway.onSend(3, (payload) => {
  if (!settings.enabled) return;
  if (!payload || typeof payload !== "object") return;
  payload.activities = [buildActivity()];
  return payload;
});
