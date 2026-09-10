'use strict';

const { formatMs, parseEstToMs } = require('./lib/time');
const { buildVodChapters } = require('./lib/vod');
const { postWebhook } = require('./lib/discord');
const createLiveSplitClient = require('./lib/livesplit');

const clone = (obj) => JSON.parse(JSON.stringify(obj));

module.exports = function (nodecg) {
  nodecg.log.info('RTA Single Track Bundle (DADS Edition) 拡張機能を初期化中...');

  const defaultSchedule = [
    {
      id: 'run-1',
      game: {
        title: 'Super Mario 64',
        category: '16 Star',
        est: '00:20:00',
        platform: 'N64実機',
        aspect_ratio: '16:9'
      },
      runner: {
        name: 'ひなめが',
        twitch: 'hinamega_twitch',
        twitter: 'hinamega_x'
      },
      commentator: {
        name: 'てち (解説)',
        twitter: 'techi_x'
      }
    },
    {
      id: 'run-2',
      game: {
        title: 'ゼルダの伝説 時のオカリナ',
        category: 'Any% (No SRM)',
        est: '00:45:00',
        platform: 'Switch Online',
        aspect_ratio: '4:3'
      },
      runner: {
        name: 'ゲスト走者',
        twitch: 'guest_twitch',
        twitter: 'guest_x'
      },
      commentator: {
        name: 'なし',
        twitter: ''
      }
    }
  ];

  // ---------------- Replicants ----------------
  const scheduleRep = nodecg.Replicant('schedule', { defaultValue: defaultSchedule });
  const currentRunIndexRep = nodecg.Replicant('currentRunIndex', { defaultValue: 0 });
  const currentRunRep = nodecg.Replicant('currentRun', { defaultValue: defaultSchedule[0] });
  const layoutRep = nodecg.Replicant('layout', { defaultValue: '16:9' });
  const eventInfoRep = nodecg.Replicant('eventInfo', {
    defaultValue: {
      name: 'RTA Event Speedrun',
      hashtag: '#RTA_Event'
    }
  });
  const announcementRep = nodecg.Replicant('announcement', {
    defaultValue: {
      text: 'ただいま配信中！公式ハッシュタグで応援ポストをお願いします！',
      type: 'info',
      visible: true
    }
  });
  const timerRep = nodecg.Replicant('timer', {
    defaultValue: {
      timeMs: 0,
      formatted: '00:00:00',
      status: 'stopped'
    }
  });

  const livesplitRep = nodecg.Replicant('livesplit', {
    defaultValue: {
      autoConnect: true,
      host: '127.0.0.1',
      port: 16834,
      useAsTimerSource: true,
      connected: false,
      phase: 'NotRunning',
      timeMs: 0,
      formatted: '00:00:00',
      splitIndex: -1,
      splitCount: 0,
      splitName: '',
      lastUpdate: null,
      lastError: null
    }
  });

  const alertsRep = nodecg.Replicant('alerts', {
    defaultValue: {
      discordEnabled: false,
      discordWebhookUrl: '',
      discordMention: '',
      livesplitDisconnect: true,
      runOverrun: true,
      overrunThresholdPercent: 20,
      scheduleReminder: true,
      scheduleReminderMinutes: 5
    }
  });

  const vodChaptersRep = nodecg.Replicant('vodChapters', {
    defaultValue: {
      text: '',
      warnings: [],
      generatedAt: null
    }
  });

  // ---------------- Helpers ----------------
  function updateLiveSplitState(patch) {
    livesplitRep.value = Object.assign({}, livesplitRep.value, patch);
  }

  function useLiveSplitAsSource() {
    const ls = livesplitRep.value || {};
    return !!(ls.useAsTimerSource && ls.connected);
  }

  function setScheduleEntry(index, patch) {
    if (!scheduleRep.value || !scheduleRep.value[index]) return;
    const updated = clone(scheduleRep.value);
    updated[index] = Object.assign({}, updated[index], patch);
    scheduleRep.value = updated;
    if (currentRunIndexRep.value === index) {
      currentRunRep.value = clone(updated[index]);
    }
  }

  let overrunAlertedFor = null;

  function resetOverrunFlag() {
    overrunAlertedFor = null;
  }

  function markRunStart(when) {
    const idx = currentRunIndexRep.value;
    const run = scheduleRep.value && scheduleRep.value[idx];
    if (!run || run.actual_start) return;
    const iso = when ? new Date(when).toISOString() : new Date().toISOString();
    setScheduleEntry(idx, { actual_start: iso });
    resetOverrunFlag();
    nodecg.log.info(`[Run] 実走開始を記録: #${idx + 1} @ ${iso}`);
  }

  function markRunEnd(when) {
    const idx = currentRunIndexRep.value;
    const run = scheduleRep.value && scheduleRep.value[idx];
    if (!run || !run.actual_start || run.actual_end) return;
    const iso = when ? new Date(when).toISOString() : new Date().toISOString();
    setScheduleEntry(idx, { actual_end: iso });
    nodecg.log.info(`[Run] 実走終了を記録: #${idx + 1} @ ${iso}`);
  }

  // ---------------- Discord アラート ----------------
  const sentAlertKeys = new Set();

  async function sendAlert(kind, content, opts = {}) {
    nodecg.log.info(`[Alert:${kind}] ${content}`);
    const cfg = alertsRep.value || {};
    if (!cfg.discordWebhookUrl) return;
    if (!cfg.discordEnabled && !opts.force) return;
    if (opts.dedupeKey) {
      if (sentAlertKeys.has(opts.dedupeKey)) return;
      sentAlertKeys.add(opts.dedupeKey);
    }
    const mention = cfg.discordMention ? `${cfg.discordMention} ` : '';
    const payload = {
      username: opts.username || 'RTA Event Bot',
      content: `${mention}${content}`.trim()
    };
    try {
      await postWebhook(cfg.discordWebhookUrl, payload);
    } catch (e) {
      nodecg.log.error(`[Alert] Discord送信エラー: ${e.message}`);
    }
  }

  // ---------------- タイマー（手動） ----------------
  let timerInterval = null;
  let startTime = 0;
  let elapsedBeforePause = 0;

  function stopTimerInterval() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  nodecg.listenFor('startTimer', () => {
    if (useLiveSplitAsSource()) {
      nodecg.log.warn('[Timer] LiveSplit同期中のため手動スタートを無視しました');
      return;
    }
    if (timerRep.value && timerRep.value.status === 'running') return;
    startTime = Date.now() - elapsedBeforePause;
    timerRep.value = Object.assign({}, timerRep.value, { status: 'running' });

    stopTimerInterval();
    timerInterval = setInterval(() => {
      const diff = Date.now() - startTime;
      timerRep.value = { timeMs: diff, formatted: formatMs(diff), status: 'running' };
    }, 100);

    markRunStart();
  });

  nodecg.listenFor('pauseTimer', () => {
    if (useLiveSplitAsSource()) return;
    if (!timerRep.value || timerRep.value.status !== 'running') return;
    stopTimerInterval();
    elapsedBeforePause = Date.now() - startTime;
    timerRep.value = Object.assign({}, timerRep.value, { status: 'paused' });
  });

  nodecg.listenFor('finishTimer', () => {
    if (useLiveSplitAsSource()) return;
    stopTimerInterval();
    if (timerRep.value) timerRep.value = Object.assign({}, timerRep.value, { status: 'finished' });
    markRunEnd();
  });

  nodecg.listenFor('resetTimer', () => {
    if (useLiveSplitAsSource()) return;
    stopTimerInterval();
    elapsedBeforePause = 0;
    timerRep.value = {
      timeMs: 0,
      formatted: '00:00:00',
      status: 'stopped'
    };
    resetOverrunFlag();
  });

  // ---------------- スケジュール操作 ----------------
  function updateCurrentRun(index) {
    const list = scheduleRep.value;
    if (list && list[index]) {
      currentRunIndexRep.value = index;
      currentRunRep.value = clone(list[index]);
      if (list[index].game && list[index].game.aspect_ratio) {
        layoutRep.value = list[index].game.aspect_ratio;
      }
    }
  }

  nodecg.listenFor('nextRun', () => {
    const nextIdx = currentRunIndexRep.value + 1;
    if (scheduleRep.value && nextIdx < scheduleRep.value.length) {
      markRunEnd();
      updateCurrentRun(nextIdx);
      resetOverrunFlag();
    }
  });

  nodecg.listenFor('prevRun', () => {
    const prevIdx = currentRunIndexRep.value - 1;
    if (prevIdx >= 0) {
      markRunEnd();
      updateCurrentRun(prevIdx);
      resetOverrunFlag();
    }
  });

  nodecg.listenFor('jumpToRun', (index) => {
    markRunEnd();
    updateCurrentRun(index);
    resetOverrunFlag();
  });

  nodecg.listenFor('setLayout', (layout) => {
    layoutRep.value = layout;
  });

  nodecg.listenFor('updateCurrentRunData', (data) => {
    currentRunRep.value = clone(data);
    const idx = currentRunIndexRep.value;
    if (scheduleRep.value && scheduleRep.value[idx]) {
      const updatedList = clone(scheduleRep.value);
      updatedList[idx] = clone(data);
      scheduleRep.value = updatedList;
    }
  });

  nodecg.listenFor('updateEventInfo', (info) => {
    eventInfoRep.value = clone(info);
  });

  nodecg.listenFor('updateAnnouncement', (ann) => {
    announcementRep.value = clone(ann);
  });

  nodecg.listenFor('importSchedule', (jsonString, ack) => {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed) && parsed.length > 0) {
        scheduleRep.value = clone(parsed);
        updateCurrentRun(0);
        resetOverrunFlag();
        sentAlertKeys.clear();
        if (ack && !ack.handled) ack(null, { success: true, count: parsed.length });
      } else {
        if (ack && !ack.handled) ack(new Error('有効なスケジュール配列ではありません。'));
      }
    } catch (e) {
      if (ack && !ack.handled) ack(new Error('JSONの解析に失敗しました: ' + e.message));
    }
  });

  nodecg.listenFor('clearActualTimes', (ack) => {
    if (!scheduleRep.value) {
      if (ack && !ack.handled) ack(null, { success: false });
      return;
    }
    const updated = clone(scheduleRep.value).map((run) => {
      delete run.actual_start;
      delete run.actual_end;
      return run;
    });
    scheduleRep.value = updated;
    if (updated[currentRunIndexRep.value]) {
      currentRunRep.value = clone(updated[currentRunIndexRep.value]);
    }
    if (ack && !ack.handled) ack(null, { success: true });
  });

  // ---------------- VODチャプター ----------------
  nodecg.listenFor('generateVodChapters', (data, ack) => {
    const result = buildVodChapters(scheduleRep.value || [], {
      vodStartIso: data && data.vodStartIso ? String(data.vodStartIso) : null,
      introTitle: (data && data.introTitle) || 'オープニング'
    });
    vodChaptersRep.value = {
      text: result.text,
      warnings: result.warnings,
      generatedAt: new Date().toISOString()
    };
    if (ack && !ack.handled) ack(null, { count: result.count, warnings: result.warnings });
  });

  // ---------------- LiveSplit 連携 ----------------
  const liveSplit = createLiveSplitClient({
    getConfig: () => {
      const ls = livesplitRep.value || {};
      return { host: ls.host, port: ls.port };
    },
    log: nodecg.log,
    onConnect: () => {
      updateLiveSplitState({ connected: true, lastError: null });
      nodecg.log.info('[LiveSplit] 接続を確立しました');
    },
    onDisconnect: (reason) => {
      updateLiveSplitState({ connected: false });
      const cfg = alertsRep.value || {};
      if (cfg.livesplitDisconnect) {
        sendAlert(
          'livesplit-disconnect',
          `🚨 **LiveSplit との接続が切断されました**（理由: ${reason}）\n走者側のタイマー状態を確認してください！`
        );
      }
    },
    onState: (state) => {
      updateLiveSplitState(Object.assign({ connected: true, lastError: null }, state));
      if (useLiveSplitAsSource()) {
        timerRep.value = {
          timeMs: state.timeMs,
          formatted: state.formatted,
          status: state.status
        };
      }
    },
    onPhaseChange: (state) => {
      if (state.phase === 'Running') markRunStart();
      if (state.phase === 'Ended') markRunEnd();
      if (state.phase === 'NotRunning') resetOverrunFlag();
    }
  });

  function maybeAutoConnect() {
    const ls = livesplitRep.value || {};
    if (ls.autoConnect && !liveSplit.isConnected() && !liveSplit.isConnecting()) {
      liveSplit.connect();
    }
  }

  setTimeout(maybeAutoConnect, 1000);
  setInterval(maybeAutoConnect, 5000);

  nodecg.listenFor('livesplitConnect', () => {
    liveSplit.connect();
  });

  nodecg.listenFor('livesplitDisconnect', () => {
    liveSplit.disconnect();
    updateLiveSplitState({ connected: false });
  });

  nodecg.listenFor('updateLiveSplitConfig', (data) => {
    const cur = livesplitRep.value || {};
    const hostChanged = data.host != null && String(data.host) !== cur.host;
    const portChanged = data.port != null && Number(data.port) !== cur.port;
    updateLiveSplitState({
      host: data.host != null ? String(data.host) : cur.host,
      port: data.port != null ? Number(data.port) : cur.port,
      useAsTimerSource: data.useAsTimerSource != null ? !!data.useAsTimerSource : cur.useAsTimerSource,
      autoConnect: data.autoConnect != null ? !!data.autoConnect : cur.autoConnect
    });
    if ((hostChanged || portChanged) && liveSplit.isConnected()) {
      liveSplit.disconnect();
    }
  });

  // ---------------- アラート設定・手動送信 ----------------
  nodecg.listenFor('updateAlertsConfig', (data) => {
    const cur = alertsRep.value || {};
    alertsRep.value = Object.assign({}, cur, {
      discordWebhookUrl: data.discordWebhookUrl != null ? String(data.discordWebhookUrl) : cur.discordWebhookUrl,
      discordEnabled: data.discordEnabled != null ? !!data.discordEnabled : cur.discordEnabled,
      discordMention: data.discordMention != null ? String(data.discordMention) : cur.discordMention,
      livesplitDisconnect: data.livesplitDisconnect != null ? !!data.livesplitDisconnect : cur.livesplitDisconnect,
      runOverrun: data.runOverrun != null ? !!data.runOverrun : cur.runOverrun,
      overrunThresholdPercent:
        data.overrunThresholdPercent != null ? Number(data.overrunThresholdPercent) : cur.overrunThresholdPercent,
      scheduleReminder: data.scheduleReminder != null ? !!data.scheduleReminder : cur.scheduleReminder,
      scheduleReminderMinutes:
        data.scheduleReminderMinutes != null ? Number(data.scheduleReminderMinutes) : cur.scheduleReminderMinutes
    });
  });

  nodecg.listenFor('sendTestAlert', () => {
    sendAlert('test', '🔔 これはテスト通知です。事故検知アラートは正常に動作しています！', { force: true });
  });

  nodecg.listenFor('sendSos', (data) => {
    const text = (data && data.text) || '';
    sendAlert('sos', `🆘 **SOS・応援要請！** ${text}`.trim(), { force: true, username: 'RTA Event SOS' });
  });

  // ---------------- 事故検知ループ ----------------
  function checkAlerts() {
    const cfg = alertsRep.value || {};

    // 予定タイム超過
    if (cfg.runOverrun) {
      const timer = timerRep.value || {};
      const run = currentRunRep.value;
      if (timer.status === 'running' && run && run.game && run.game.est) {
        const estMs = parseEstToMs(run.game.est);
        const threshold = Number(cfg.overrunThresholdPercent) || 0;
        if (estMs > 0 && timer.timeMs > estMs * (1 + threshold / 100)) {
          const key = `overrun:${run.id || currentRunIndexRep.value}`;
          if (overrunAlertedFor !== key) {
            overrunAlertedFor = key;
            sendAlert(
              'overrun',
              `⏰ **予定タイムを超過中！**\n「${run.game.title}」(${run.runner && run.runner.name ? run.runner.name : '-'}) が予定 ${run.game.est} を ${threshold}% 以上オーバーしています。`
            );
          }
        }
      }
    }

    // 出走リマインド
    if (cfg.scheduleReminder) {
      const windowMs = (Number(cfg.scheduleReminderMinutes) || 5) * 60000;
      const now = Date.now();
      const list = scheduleRep.value || [];
      for (const run of list) {
        const t = run.scheduled_at ? Date.parse(run.scheduled_at) : NaN;
        if (Number.isNaN(t)) continue;
        const diff = t - now;
        if (diff > 0 && diff <= windowMs) {
          const key = `reminder:${run.id || run.scheduled_at}`;
          if (!sentAlertKeys.has(key)) {
            const mins = Math.ceil(diff / 60000);
            sendAlert(
              'reminder',
              `⏳ **まもなく出走！**\n「${(run.game && run.game.title) || '-'}」(${(run.runner && run.runner.name) || '-'}) まで約 ${mins} 分です。`,
              { dedupeKey: key }
            );
          }
          break;
        }
      }
    }
  }

  setInterval(checkAlerts, 5000);

  nodecg.log.info('RTA Single Track Bundle (DADS Edition) 拡張機能の準備が完了しました。');
};
