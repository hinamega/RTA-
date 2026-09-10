'use strict';

const net = require('net');
const { parseLiveSplitTime, formatMs } = require('./time');

const PHASE_TO_STATUS = {
  NotRunning: 'stopped',
  Running: 'running',
  Paused: 'paused',
  Ended: 'finished'
};

/**
 * LiveSplit Server (TCP) に接続し、クエリコマンドをポーリングして
 * タイマー状態を取得するクライアント。
 *
 * LiveSplit 側で「右クリック → Control → Start TCP Server」を実行しておくこと。
 *
 * @param {object} deps
 * @param {() => {host: string, port: number}} deps.getConfig
 * @param {(state: object) => void} deps.onState
 * @param {() => void} deps.onConnect
 * @param {(reason: string) => void} deps.onDisconnect
 * @param {object} [deps.log]
 * @returns {object}
 */
module.exports = function createLiveSplitClient(deps) {
  const {
    getConfig,
    onState,
    onConnect,
    onDisconnect,
    pollIntervalMs = 500,
    commandTimeoutMs = 3000,
    log = console
  } = deps;

  let socket = null;
  let connected = false;
  let connecting = false;
  let destroyed = false;
  let buffer = '';
  let pollTimer = null;
  let commandTimeout = null;
  let current = null; // 送信中コマンドの resolve/reject 待ち
  const queue = [];
  let lastPhase = null;

  function logInfo(msg) {
    if (log && typeof log.info === 'function') log.info(`[LiveSplit] ${msg}`);
  }
  function logWarn(msg) {
    if (log && typeof log.warn === 'function') log.warn(`[LiveSplit] ${msg}`);
    else if (log && typeof log.error === 'function') log.error(`[LiveSplit] ${msg}`);
  }

  function isConnected() {
    return connected;
  }

  function isConnecting() {
    return connecting;
  }

  function flushCurrent(err, line) {
    if (!current) return;
    const pending = current;
    current = null;
    if (commandTimeout) {
      clearTimeout(commandTimeout);
      commandTimeout = null;
    }
    if (err) pending.reject(err);
    else pending.resolve(line);
  }

  function sendCommand(command) {
    return new Promise((resolve, reject) => {
      if (!connected || !socket || socket.destroyed) {
        reject(new Error('LiveSplit に接続されていません'));
        return;
      }
      queue.push({ command, resolve, reject });
      pump();
    });
  }

  function pump() {
    if (current || queue.length === 0) return;
    if (!connected || !socket || socket.destroyed) return;

    const item = queue.shift();
    current = item;
    try {
      socket.write(item.command + '\n');
    } catch (e) {
      flushCurrent(e);
      handleDisconnect('write-error');
      return;
    }
    commandTimeout = setTimeout(() => {
      flushCurrent(new Error(`コマンドタイムアウト: ${item.command}`));
      handleDisconnect('timeout');
    }, commandTimeoutMs);
  }

  function onData(chunk) {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      flushCurrent(null, line);
      pump();
    }
  }

  async function pollOnce() {
    if (!connected) return;
    const phase = (await sendCommand('getcurrenttimerphase')).trim();
    const timeStr = (await sendCommand('getcurrenttime')).trim();
    const splitIndexStr = (await sendCommand('getsplitindex')).trim();
    const splitCountStr = (await sendCommand('getsplitcount')).trim();

    const splitIndex = parseInt(splitIndexStr, 10);
    let splitName = '';
    if (!Number.isNaN(splitIndex) && splitIndex >= 0) {
      try {
        splitName = (await sendCommand('getcurrentsplitname')).trim();
      } catch (e) {
        splitName = '';
      }
    }

    const timeMs = parseLiveSplitTime(timeStr);
    const state = {
      phase,
      status: PHASE_TO_STATUS[phase] || 'stopped',
      timeMs: timeMs || 0,
      formatted: formatMs(timeMs || 0),
      splitIndex: Number.isNaN(splitIndex) ? -1 : splitIndex,
      splitCount: parseInt(splitCountStr, 10) || 0,
      splitName,
      lastUpdate: new Date().toISOString()
    };

    onState(state);

    if (phase !== lastPhase) {
      lastPhase = phase;
      if (deps.onPhaseChange) {
        try {
          deps.onPhaseChange(state);
        } catch (e) {
          logWarn(`onPhaseChange でエラー: ${e.message}`);
        }
      }
    }
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        await pollOnce();
      } catch (e) {
        // エラーは handleDisconnect 側で処理される
      } finally {
        if (connected && !destroyed) schedulePoll();
      }
    }, pollIntervalMs);
  }

  function handleDisconnect(reason) {
    const wasConnected = connected;
    connected = false;
    connecting = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    flushCurrent(new Error(`接続が切断されました (${reason})`));
    if (socket) {
      socket.removeAllListeners();
      socket.destroy();
      socket = null;
    }
    lastPhase = null;
    if (wasConnected && !destroyed) {
      logWarn(`切断されました (${reason})`);
      if (typeof onDisconnect === 'function') onDisconnect(reason);
    }
  }

  function connect() {
    if (destroyed || connected || connecting) return;
    const cfg = getConfig() || {};
    const host = cfg.host || '127.0.0.1';
    const port = Number(cfg.port) || 16834;

    connecting = true;
    logInfo(`接続を試みます → ${host}:${port}`);

    socket = net.createConnection({ host, port });
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 5000);

    socket.on('connect', () => {
      connecting = false;
      connected = true;
      buffer = '';
      logInfo(`接続しました (${host}:${port})`);
      if (typeof onConnect === 'function') onConnect();
      schedulePoll();
    });

    socket.on('data', onData);

    socket.on('error', (err) => {
      logWarn(`ソケットエラー: ${err.message}`);
      handleDisconnect('error');
    });

    socket.on('close', () => {
      handleDisconnect('closed');
    });
  }

  function disconnect() {
    if (!socket && !connected) return;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    flushCurrent(new Error('手動で切断しました'));
    connected = false;
    connecting = false;
    if (socket) {
      socket.removeAllListeners();
      socket.end();
      socket.destroy();
      socket = null;
    }
    lastPhase = null;
  }

  function destroy() {
    destroyed = true;
    disconnect();
  }

  return { connect, disconnect, destroy, isConnected, isConnecting, sendCommand };
};
