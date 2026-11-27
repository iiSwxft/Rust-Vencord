// @description Complete accepted quests via REST: fake video watch progress and activity heartbeats
// @version 1.0.0
// @author iiSwxft

// adaptation: the original finds discord's enroll action in webpack and paces
// progress with timers. here enrollment is direct REST, and pacing comes from
// network round-trips since the sandbox has no clocks. claims are left manual
// because discord gates them behind a captcha

async function fetchQuests() {
  const res = await phoenix.discord.get("/quests/@me");
  if (!res.ok) return null;
  const body = res.json();
  return body?.quests ?? body ?? null;
}

function secondsNeeded(quest) {
  const tasks = quest.config?.tasks ?? quest.user_status?.progress ?? {};
  let max = 0;
  for (const t of Object.values(quest.config?.tasks ?? {})) {
    const target = t.target ?? 0;
    if (target > max) max = target;
  }
  return max;
}

function taskEntries(quest) {
  return Object.entries(quest.config?.tasks ?? {});
}

async function completeVideo(id, seconds) {
  let ts = 0;
  const step = Math.max(10, Math.ceil(seconds / 12));
  while (ts < seconds) {
    ts = Math.min(seconds, ts + step + Math.random());
    const res = await phoenix.discord.post(`/quests/${id}/video-progress`, {
      timestamp: Math.min(seconds, ts),
    });
    if (!res.ok) return `video-progress HTTP ${res.status}`;
  }
  return null;
}

async function completeActivity(id, applicationId) {
  const res = await phoenix.discord.post(`/quests/${id}/heartbeat`, {
    application_id: applicationId,
    terminal: false,
  });
  if (!res.ok) return `heartbeat HTTP ${res.status} (server-verified quest, play it manually)`;
  await phoenix.discord.post(`/quests/${id}/heartbeat`, {
    application_id: applicationId,
    terminal: true,
  });
  return null;
}

phoenix.commands.register({
  name: "quests",
  description: "List your enrolled quests and their progress",
  async execute(_args, ctx) {
    const quests = await fetchQuests();
    if (!Array.isArray(quests) || !quests.length) {
      ctx.reply("no quests found (or /quests/@me is not available)");
      return;
    }
    const lines = quests.map((q) => {
      const done = q.user_status?.completed_at ? "done" : "open";
      const name = q.config?.messages?.quest_name ?? q.config?.name ?? q.id;
      return `${q.id}  [${done}]  ${name}`;
    });
    phoenix.ui.openPage({
      title: `Quests (${quests.length})`,
      sections: [{ type: "code", text: lines.join("\n"), monospace: true }],
    });
  },
});

phoenix.commands.register({
  name: "questcomplete",
  description: "Auto-complete an enrolled quest: /questcomplete <questId>",
  args: [{ name: "questId", description: "Quest ID from /quests", type: "text", required: true }],
  async execute(args, ctx) {
    const id = String(args.questId);
    const quests = await fetchQuests();
    const quest = Array.isArray(quests) ? quests.find((q) => q.id === id) : null;
    if (!quest) {
      ctx.reply("quest not found in /quests/@me");
      return;
    }
    if (quest.user_status?.completed_at) {
      ctx.reply("already completed, claim the reward in quest home");
      return;
    }
    if (!quest.user_status?.enrolled_at) {
      const enr = await phoenix.discord.post(`/quests/${id}/enroll`, { location: 11 });
      if (!enr.ok) {
        ctx.reply(`enroll failed: HTTP ${enr.status}`);
        return;
      }
    }

    const tasks = taskEntries(quest);
    const videoTask = tasks.find(([k]) => k.includes("WATCH_VIDEO") || k.includes("video"));
    const playTask = tasks.find(([k]) => k.includes("PLAY") || k.includes("play"));

    let err = null;
    if (videoTask) {
      err = await completeVideo(id, secondsNeeded(quest));
    } else if (playTask) {
      const appId =
        quest.config?.application_id ??
        playTask[1]?.application_id ??
        playTask[1]?.application_ids?.[0];
      if (!appId) {
        ctx.reply("no application id in quest config, cannot fake heartbeat");
        return;
      }
      err = await completeActivity(id, appId);
    } else {
      ctx.reply(`server-verified task (${tasks.map(([k]) => k).join(", ") || "unknown"}), cannot be faked`);
      return;
    }

    ctx.reply(err ? `completion failed: ${err}` : "progress sent, check /quests for completion");
  },
});
