const fs = require('fs');
const path = require('path');

module.exports = function (nodecg) {
  nodecg.log.info('RTA Single Track Bundle 拡張機能を初期化中...');

  // デフォルトスケジュールの読み込み
  let initialSchedule = [];
  const defaultSchedulePath = path.join(__dirname, '../default-schedule.json');
  try {
    if (fs.existsSync(defaultSchedulePath)) {
      initialSchedule = JSON.parse(fs.readFileSync(defaultSchedulePath, 'utf8'));
    }
  } catch (err) {
    nodecg.log.error('default-schedule.json の読み込みに失敗しました:', err);
  }

  // レプリカントの定義
  const scheduleRep = nodecg.Replicant('schedule', { defaultValue: initialSchedule });
  const currentRunIndexRep = nodecg.Replicant('currentRunIndex', { defaultValue: 0 });
  const currentRunRep = nodecg.Replicant('currentRun', {
    defaultValue: initialSchedule[0] || null
  });
  const layoutRep = nodecg.Replicant('layout', { defaultValue: '16:9' }); // '16:9' | '4:3' | 'race' | 'setup' | 'talk'
  const eventInfoRep = nodecg.Replicant('eventInfo', {
    defaultValue: {
      name: 'RTA Event',
      hashtag: '#RTA_Event',
      subText: 'Speedrun Event Live'
    }
  });

  const timerRep = nodecg.Replicant('timer', {
    defaultValue: {
      raw: 0,
      formatted: '00:00:00',
      status: 'stopped' // 'stopped' | 'running' | 'paused' | 'finished'
    }
  });

  // タイマーのインターバル
  let timerInterval = null;
  let timerStartEpoch = 0;
  let timerAccumulatedMs = 0;

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return (
      String(hours).padStart(2, '0') + ':' +
      String(minutes).padStart(2, '0') + ':' +
      String(seconds).padStart(2, '0')
    );
  }

  function startTimer() {
    if (timerRep.value.status === 'running') return;
    timerStartEpoch = Date.now() - timerAccumulatedMs;
    timerRep.value.status = 'running';

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      timerAccumulatedMs = Date.now() - timerStartEpoch;
      timerRep.value.raw = timerAccumulatedMs;
      timerRep.value.formatted = formatTime(timerAccumulatedMs);
    }, 100);
  }

  function pauseTimer() {
    if (timerRep.value.status !== 'running') return;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerRep.value.status = 'paused';
  }

  function finishTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerRep.value.status = 'finished';
  }

  function resetTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    timerAccumulatedMs = 0;
    timerRep.value.raw = 0;
    timerRep.value.formatted = '00:00:00';
    timerRep.value.status = 'stopped';
  }

  function updateCurrentRun(index) {
    const list = scheduleRep.value || [];
    if (index >= 0 && index < list.length) {
      currentRunIndexRep.value = index;
      currentRunRep.value = JSON.parse(JSON.stringify(list[index]));
      resetTimer();
      nodecg.log.info(`出走者を更新しました: [${index + 1}/${list.length}] ${list[index].game?.title} by ${list[index].runner?.name}`);
    }
  }

  // スケジュール変更時の自動同期
  scheduleRep.on('change', (newVal) => {
    if (newVal && newVal.length > 0) {
      if (currentRunIndexRep.value >= newVal.length) {
        currentRunIndexRep.value = 0;
      }
      currentRunRep.value = JSON.parse(JSON.stringify(newVal[currentRunIndexRep.value]));
    } else {
      currentRunRep.value = null;
    }
  });

  // メッセージリスナー
  nodecg.listenFor('startTimer', () => startTimer());
  nodecg.listenFor('pauseTimer', () => pauseTimer());
  nodecg.listenFor('finishTimer', () => finishTimer());
  nodecg.listenFor('resetTimer', () => resetTimer());

  nodecg.listenFor('nextRun', () => {
    const nextIdx = (currentRunIndexRep.value || 0) + 1;
    if (scheduleRep.value && nextIdx < scheduleRep.value.length) {
      updateCurrentRun(nextIdx);
    }
  });

  nodecg.listenFor('prevRun', () => {
    const prevIdx = (currentRunIndexRep.value || 0) - 1;
    if (prevIdx >= 0) {
      updateCurrentRun(prevIdx);
    }
  });

  nodecg.listenFor('jumpToRun', (index) => {
    updateCurrentRun(index);
  });

  nodecg.listenFor('importSchedule', (jsonString, ack) => {
    try {
      const parsed = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
      if (Array.isArray(parsed)) {
        scheduleRep.value = parsed;
        updateCurrentRun(0);
        if (ack && !ack.handled) ack(null, { count: parsed.length });
      } else {
        if (ack && !ack.handled) ack(new Error('JSONが配列形式ではありません。'));
      }
    } catch (e) {
      if (ack && !ack.handled) ack(e);
    }
  });

  nodecg.listenFor('setLayout', (layoutName) => {
    layoutRep.value = layoutName;
    nodecg.log.info(`画面レイアウトを変更しました: ${layoutName}`);
  });

  nodecg.listenFor('updateCurrentRunData', (data) => {
    currentRunRep.value = data;
    nodecg.log.info('出走者データを手動更新しました。');
  });

  nodecg.listenFor('updateEventInfo', (info) => {
    eventInfoRep.value = info;
    nodecg.log.info('イベント情報を更新しました。');
  });

  nodecg.log.info('RTA Single Track Bundle 拡張機能の準備が完了しました。');
};
