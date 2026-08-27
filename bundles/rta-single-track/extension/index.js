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

  // Replicants
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

  // タイマーインターバル
  let timerInterval = null;
  let startTime = 0;
  let elapsedBeforePause = 0;

  function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSec % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  nodecg.listenFor('startTimer', () => {
    if (timerRep.value.status === 'running') return;
    startTime = Date.now() - elapsedBeforePause;
    timerRep.value.status = 'running';

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      const now = Date.now();
      const diff = now - startTime;
      timerRep.value.timeMs = diff;
      timerRep.value.formatted = formatTime(diff);
    }, 100);
  });

  nodecg.listenFor('pauseTimer', () => {
    if (timerRep.value.status !== 'running') return;
    if (timerInterval) clearInterval(timerInterval);
    elapsedBeforePause = Date.now() - startTime;
    timerRep.value.status = 'paused';
  });

  nodecg.listenFor('finishTimer', () => {
    if (timerInterval) clearInterval(timerInterval);
    timerRep.value.status = 'finished';
  });

  nodecg.listenFor('resetTimer', () => {
    if (timerInterval) clearInterval(timerInterval);
    elapsedBeforePause = 0;
    timerRep.value = {
      timeMs: 0,
      formatted: '00:00:00',
      status: 'stopped'
    };
  });

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
      updateCurrentRun(nextIdx);
    }
  });

  nodecg.listenFor('prevRun', () => {
    const prevIdx = currentRunIndexRep.value - 1;
    if (prevIdx >= 0) {
      updateCurrentRun(prevIdx);
    }
  });

  nodecg.listenFor('jumpToRun', (index) => {
    updateCurrentRun(index);
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
        if (ack && !ack.handled) ack(null, { success: true, count: parsed.length });
      } else {
        if (ack && !ack.handled) ack(new Error('有効なスケジュール配列ではありません。'));
      }
    } catch (e) {
      if (ack && !ack.handled) ack(new Error('JSONの解析に失敗しました: ' + e.message));
    }
  });

  nodecg.log.info('RTA Single Track Bundle (DADS Edition) 拡張機能の準備が完了しました。');
};
