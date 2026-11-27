// @description Pipeline smoke test, notifies when the runtime loads it
// @version 0.1.0
// @author iiSwxft
// @unlisted

phoenix.log.info("zzSmokeTest loaded");
phoenix.on(phoenix.gateway.ready, (payload) => {
  phoenix.ui.notify({ title: "Sunbird runtime OK", body: `logged in as ${payload.user.username}` });
});
