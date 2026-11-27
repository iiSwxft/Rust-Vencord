# Vencord to Phoenix port matrix

Target runtime: Sunbird (`phoenix` plugin API, QuickJS). Deployed plugins live in
`phoenix-plugins/` and install into `%LOCALAPPDATA%\DiscordPhoenix\sunbird\plugins`
via `PUT /plugins/<name>` on the debug shell (or file copy, loaded at startup).

Constraint notes that shaped many verdicts:
- No DOM/CSS/React: Phoenix is native Rust (gpui), so anything that patches web UI is out.
- No timers in the sandbox: nothing can self-pace on a clock, only on events or round-trips.
- No gateway initiation: `onSend` mutates outgoing ops 3/4 only, plugins cannot send frames.
- No fs/crypto/TextEncoder: pure-JS implementations or impossible, per case.

## Your enabled Vencord plugins: coverage

Extracted from `%APPDATA%\Vencord\settings\settings.json` (35 enabled, of which 15 are
Vencord-internal plumbing like CommandsAPI/BadgeAPI/NoTrack that exist only to support
the web client and have no meaning in Phoenix).

| Enabled plugin | Status in Phoenix |
|---|---|
| MessageChecker, AntiCrash, GlobalSearch, LocalEdit, QuestCompleter, SilentDelete, TokenGuard | ported, running |
| RelationshipNotifier, ReadAllNotificationsButton, MutualGroupDMs | ported as gateway events + slash commands |
| OnePingPerDM | impossible, no notification hook surface |
| CopyImageFix, JunkCleanup, DevtoolsWarningHider | impossible, DOM/CSS patches |
| MultiInstance, UnlimitedAccounts, TokenLogin | impossible, Electron process/storage tricks |
| PresenceSpoofer | impossible, Identify op 2 unhookable |
| BadgeFarmer | impossible, fakes telemetry through flux/native |
| TokenImporter | blocked on fs access, needs a runtime fork |

## Ported (16)

| Plugin | Notes |
|---|---|
| messageChecker | Full parity. Webhook URL is a `secret` setting, spam paced by round-trips |
| afkBot | AFK state is explicit (`/afk`), no presence auto-detection possible |
| antiCrash | Embed firewall mutating `messageCreate`/`messageUpdate` before payloads |
| localEdit | `enqueue` fake local edit events, entry point via message action |
| silentDelete | REST-driven delete-rewrite, ordering guaranteed by round-trips |
| statusRotator | Manual/event-paced stepping (`/rotatortoggle`, `/rotatornext`), no clock |
| e2eEncrypt | Pure-JS AES-256-GCM + PBKDF2, byte-identical to Vencord format |
| voiceLogger | `voiceStateUpdate` diffing, log via `/voicelog` page |
| tokenGuard | Session-watch half only (localStorage trap is web-specific) |
| globalSearch | REST search core via `/gsearch`, `/gsearchdms` |
| customRpc | Custom activity injected into outgoing op 3 on send |
| questCompleter | REST video-progress + heartbeat core, verified against `/quests/@me` |
| relationshipNotifier | Friend/server/group removal alerts via gateway events + native notify |
| readAllNotifications | `/readall` acks the latest known message in every cached channel |
| mutualGroupDMs | `/mutualgds <userId>` lists shared group DMs from the gateway cache |
| zzSmokeTest | Runtime smoke test |

## Not portable (impossible with the current API)

| Plugin | Reason |
|---|---|
| presenceSpoofer | Identify op 2 is explicitly unhookable (carries credentials) |
| tokenLogin | Token switching is an Electron localStorage/reload trick, no surface |
| unlimitedAccounts | Needs binary-level patching of process detection |
| multiInstance | Electron multi-process trick, no analog in the native client |
| copyImageFix | DOM clipboard patch |
| customBackground | CSS injection |
| devtoolsWarningHider | Phoenix has no devtools scam warning |
| junkCleanup | Collection of webpack/DOM patches |
| cleanCord | Webpack/DOM cleanup patches |
| licenseManager | Keybind + webpack internals |
| followUser | Needs voice-connection internals and context-menu patching |
| badgeFarmer | Fakes game-session telemetry through flux/native, not REST |
| streamHijack | No stream interception surface |
| fakeSoundboard | Soundboard picker is native UI with no patch surface |
| vAnalyzer | React accessory UI + webpack stores |
| _nightcordShims | Vencord-internal i18n shim, meaningless here |

## Blocked on runtime extensions (possible only by forking Sunbird's Rust crates)

| Plugin | Missing primitive |
|---|---|
| tokenImporter | Filesystem access (scanning local installs for tokens) |
| statusRotator auto-rotation | Timers (currently manual/event-paced instead) |
| tokenGuard 5-min polling | Timers (currently startup + manual check instead) |
