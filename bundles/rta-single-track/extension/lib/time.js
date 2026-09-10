'use strict';

/**
 * ミリ秒を「HH:MM:SS」形式に整形する
 * @param {number} ms
 * @returns {string}
 */
function formatMs(ms) {
  const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
  const hrs = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

/**
 * ミリ秒を Twitch チャプター用の「H:MM:SS」形式に整形する
 * @param {number} ms
 * @returns {string}
 */
function formatChapterTime(ms) {
  const totalSec = Math.max(0, Math.round((ms || 0) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hrs}:${mins}:${secs}`;
}

/**
 * LiveSplit Server が返す C# の TimeSpan "c" 形式をミリ秒に変換する
 * 例: "0:00:12.34" / "00:12:34" / "1.02:03:04.5" / "-"
 * @param {string} input
 * @returns {number|null}
 */
function parseLiveSplitTime(input) {
  if (input == null) return null;
  const str = String(input).trim();
  if (!str || str === '-') return null;

  const m = str.match(/^(-)?(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (!m) return null;

  const sign = m[1] ? -1 : 1;
  const days = m[2] ? parseInt(m[2], 10) : 0;
  const hours = parseInt(m[3], 10);
  const minutes = parseInt(m[4], 10);
  const seconds = parseInt(m[5], 10);
  const fractionMs = m[6] ? Math.round(parseFloat('0.' + m[6]) * 1000) : 0;

  const totalMs = ((days * 24 + hours) * 3600 + minutes * 60 + seconds) * 1000 + fractionMs;
  return sign * totalMs;
}

/**
 * "HH:MM:SS" / "MM:SS" / "SS" 形式の EST をミリ秒に変換する
 * @param {string|number} est
 * @returns {number}
 */
function parseEstToMs(est) {
  if (est == null) return 0;
  if (typeof est === 'number') return est;
  const parts = String(est).trim().split(':').map(Number);
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
  return parts[0] * 1000;
}

module.exports = { formatMs, formatChapterTime, parseLiveSplitTime, parseEstToMs };
