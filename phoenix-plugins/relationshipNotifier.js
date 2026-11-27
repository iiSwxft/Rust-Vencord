// @description Notifies you when friends are added/removed, you are kicked from servers or group DMs
// @version 1.0.0
// @author iiSwxft

// adaptation: flux subscriptions become gateway events, toasts become native
// notifications. guild/group payloads only carry ids, so names show when the
// payload has them and fall back to ids otherwise

const settings = phoenix.settings.define({
  friends: { type: "switch", title: "Friend add/remove alerts", default: true },
  guilds: { type: "switch", title: "Server removal alerts", default: true },
  groups: { type: "switch", title: "Group DM removal alerts", default: true },
});

// remember friends so removals can show who it was
const friends = new Map();
phoenix.on(phoenix.gateway.ready, (payload) => {
  for (const r of payload.relationships ?? []) {
    if (r.type === 1) friends.set(r.id, r.user?.username ?? r.id);
  }
});

function notify(title, body) {
  phoenix.ui.notify({ title, body, durationMs: 8000 });
  phoenix.log.info(`${title}: ${body}`);
}

if (phoenix.gateway.relationshipAdd) {
  phoenix.on(phoenix.gateway.relationshipAdd, (r) => {
    if (!settings.friends) return;
    const name = r.user?.username ?? r.id;
    if (r.type === 1) {
      friends.set(r.id, name);
      notify("Friend added", name);
    } else if (r.type === 2) {
      notify("User blocked", name);
    } else if (r.type === 3) {
      notify("Incoming friend request", name);
    } else if (r.type === 4) {
      notify("Outgoing friend request", name);
    }
  });
}

if (phoenix.gateway.relationshipRemove) {
  phoenix.on(phoenix.gateway.relationshipRemove, (r) => {
    if (!settings.friends) return;
    const name = r.user?.username ?? friends.get(r.id) ?? r.id;
    if (r.type === 1) {
      friends.delete(r.id);
      notify("Friend removed", name);
    } else if (r.type === 2) {
      notify("User unblocked", name);
    } else if (r.type === 3 || r.type === 4) {
      notify("Friend request closed", name);
    }
  });
}

if (phoenix.gateway.guildDelete) {
  phoenix.on(phoenix.gateway.guildDelete, (g) => {
    if (!settings.guilds) return;
    if (g.unavailable) return; // outage, not a removal
    notify("Removed from server", g.name ?? `server ${g.id}`);
  });
}

if (phoenix.gateway.channelDelete) {
  phoenix.on(phoenix.gateway.channelDelete, (c) => {
    if (!settings.groups) return;
    if (c.type === 3) notify("Removed from group DM", c.name ?? `group ${c.id}`);
  });
}
