// @description Locally edit or delete any message on your screen only, other users are unaffected
// @version 1.0.0
// @author iiSwxft

// adaptation: vencord re-dispatched flux events; phoenix re-feeds the client's
// own gateway handlers with enqueue. text input has no message-menu surface,
// so edit runs through /localedit with the id copied from the message menu

const originalContents = new Map();
const stashed = new Map();

function reupdate(message, content) {
  phoenix.enqueue(phoenix.gateway.messageUpdate, {
    ...message,
    content,
    edited_timestamp: message.edited_timestamp,
  });
}

phoenix.ui.addMessageAction({
  label: "Local Delete",
  icon: "res://ic_mana_delete",
  danger: true,
  onPress(ctx) {
    phoenix.enqueue(phoenix.gateway.messageDelete, {
      id: ctx.messageId,
      channel_id: ctx.channelId,
    });
  },
});

phoenix.ui.addMessageAction({
  label: "Local Edit...",
  icon: "res://ic_mana_edit_pen",
  onPress(ctx) {
    if (ctx.message) stashed.set(ctx.messageId, ctx.message);
    phoenix.ui.copy(ctx.messageId);
    phoenix.ui.toast(`id copied — run /localedit ${ctx.messageId} <new text>`);
  },
});

phoenix.ui.addMessageAction({
  label: "Revert Local Edit",
  icon: "res://ic_mana_undo",
  danger: true,
  visible: (ctx) => originalContents.has(ctx.messageId),
  onPress(ctx) {
    const orig = originalContents.get(ctx.messageId);
    if (orig === undefined || !ctx.message) return;
    reupdate(ctx.message, orig);
    originalContents.delete(ctx.messageId);
  },
});

phoenix.commands.register({
  name: "localedit",
  description: "Locally edit a message: /localedit <messageId> <new content>",
  execute(args, ctx) {
    const split = args.indexOf(" ");
    if (split < 1) {
      ctx.reply("usage: /localedit <messageId> <new content>");
      return;
    }
    const id = args.slice(0, split).trim();
    const content = args.slice(split + 1);
    const message = stashed.get(id);
    if (!message) {
      ctx.reply("use the message's menu action Local Edit first so the original is captured");
      return;
    }
    if (!originalContents.has(id)) originalContents.set(id, message.content ?? "");
    reupdate(message, content);
    ctx.reply(`locally edited ${id} — only you see this`);
  },
});
