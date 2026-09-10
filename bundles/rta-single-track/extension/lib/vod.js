'use strict';

const { formatChapterTime } = require('./time');

function toEpoch(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/**
 * スケジュールデータから Twitch / YouTube 用の VOD チャプター文字列を生成する
 *
 * 走順（order）を優先して並べ、各走者の開始オフセットは単調増加になるよう補正する。
 * 開始時刻は実走開始時刻 (actual_start) を優先し、なければ予定開始時刻 (scheduled_at) を使う。
 *
 * @param {Array} schedule
 * @param {object} [options]
 * @param {string} [options.vodStartIso] 配信開始時刻。未指定時は最初の走者を 0:00 とする
 * @param {string} [options.introTitle] 冒頭チャプターのタイトル
 * @param {boolean} [options.includeIntro] 冒頭チャプターを挿入するか
 * @returns {{text: string, count: number, warnings: string[]}}
 */
function buildVodChapters(schedule, options = {}) {
  const { vodStartIso = null, introTitle = 'オープニング', includeIntro = true } = options;
  const warnings = [];

  if (!Array.isArray(schedule) || schedule.length === 0) {
    return { text: '', count: 0, warnings: ['スケジュールが空です'] };
  }

  // 走順を優先。order が無い場合は配列順を維持する。
  const ordered = schedule
    .map((run, index) => ({ run, index }))
    .sort((a, b) => {
      const oa = Number(a.run.order);
      const ob = Number(b.run.order);
      if (!Number.isNaN(oa) && !Number.isNaN(ob) && oa !== ob) return oa - ob;
      if (!Number.isNaN(oa) && Number.isNaN(ob)) return -1;
      if (Number.isNaN(oa) && !Number.isNaN(ob)) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.run);

  const entries = [];
  for (const run of ordered) {
    const startMs = toEpoch(run.actual_start) || toEpoch(run.scheduled_at);
    const title = (run.game && run.game.title) || '（タイトル未設定）';
    const category = (run.game && run.game.category) || '';
    const runner = (run.runner && run.runner.name) || '';
    const label = `${title}${category ? ` (${category})` : ''}${runner ? ` - ${runner}` : ''}`;
    entries.push({ startMs, label });
  }

  if (entries.every((e) => e.startMs == null)) {
    return { text: '', count: 0, warnings: ['開始時刻を持つ走者がありません'] };
  }

  let baseMs = vodStartIso ? toEpoch(vodStartIso) : null;
  if (baseMs == null) {
    if (vodStartIso) warnings.push('VOD開始時刻の形式が不正なため、最初の走者を基準にしました');
    baseMs = entries.find((e) => e.startMs != null).startMs;
  }

  const lines = [];
  const firstOffset = entries.find((e) => e.startMs != null).startMs - baseMs;
  if (includeIntro && firstOffset > 1000) {
    lines.push(`0:00:00 ${introTitle}`);
  }

  let lastOffset = 0;
  for (const entry of entries) {
    if (entry.startMs == null) {
      warnings.push(`開始時刻が無い走者をスキップしました: ${entry.label}`);
      continue;
    }
    let offset = entry.startMs - baseMs;
    if (offset < 0) offset = 0;
    if (offset < lastOffset) offset = lastOffset;
    lastOffset = offset;
    lines.push(`${formatChapterTime(offset)} ${entry.label}`);
  }

  if (lines.length === 0 || !lines[0].startsWith('0:00:00')) {
    lines.unshift(`0:00:00 ${introTitle}`);
  }

  return { text: lines.join('\n'), count: entries.filter((e) => e.startMs != null).length, warnings };
}

module.exports = { buildVodChapters };
