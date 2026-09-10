'use strict';

const https = require('https');
const { URL } = require('url');

/**
 * Discord Webhook に JSON ペイロードを送信する
 * @param {string} webhookUrl
 * @param {object} payload
 * @returns {Promise<{statusCode: number, body: string}>}
 */
function postWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(webhookUrl);
    } catch (e) {
      reject(new Error('Discord Webhook URL の形式が不正です'));
      return;
    }
    if (url.protocol !== 'https:') {
      reject(new Error('Discord Webhook URL は https で始まる必要があります'));
      return;
    }

    const body = JSON.stringify(payload);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: data });
          } else {
            reject(new Error(`Discord 送信失敗 (HTTP ${res.statusCode}): ${data}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.setTimeout(10000, () => {
      req.destroy(new Error('Discord 送信がタイムアウトしました'));
    });
    req.write(body);
    req.end();
  });
}

module.exports = { postWebhook };
