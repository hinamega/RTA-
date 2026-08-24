/**
 * Google Apps Script (GAS)
 * RTAイベント スケジュール自動計算 ＆ 連携スクリプト
 * 
 * 【機能】
 * 1. フォーム回答から「タイムテーブル」管理シートを自動生成
 * 2. イベント開始日時とバッファ（デフォルト3分）から全走者の開始予定時刻を自動連鎖計算！
 * 3. 採用走者向けの「Discord仮スケジュール確認アナウンス文」を自動生成
 * 4. NodeCG連携用 schedule.json をワンクリック出力
 */

// スプレッドシートを開いた時にカスタムメニューを追加
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🎮 RTAイベント管理')
    .addItem('1. タイムテーブル管理シートを生成', 'createTimetableSheet')
    .addItem('2. スケジュール時刻を自動連鎖計算', 'autoCalculateSchedule')
    .addSeparator()
    .addItem('3. Discord仮スケジュール確認文を生成', 'exportDiscordAnnouncement')
    .addItem('4. スケジュールJSONを出力 (NodeCG用)', 'exportScheduleJson')
    .addToUi();
}

/**
 * フォーム回答シートからタイムテーブル管理用のシートを作成する
 */
function createTimetableSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const formSheet = ss.getSheets()[0]; // フォームの回答シート
  
  const targetSheetName = "タイムテーブル";
  let targetSheet = ss.getSheetByName(targetSheetName);
  
  if (targetSheet) {
    const ui = SpreadsheetApp.getUi();
    const response = ui.alert(
      "シートの確認",
      "「タイムテーブル」シートは既に存在します。上書きして再生成しますか？\n（※既存の編集内容は消去されます）",
      ui.ButtonSet.YES_NO
    );
    if (response !== ui.Button.YES) {
      return;
    }
    ss.deleteSheet(targetSheet);
  }
  
  targetSheet = ss.insertSheet(targetSheetName);
  
  // 設定コントロール行（上部）
  targetSheet.getRange("A1:D1").setValues([["【イベント開始日時】", "2026/09/05 13:00", "【標準バッファ(分)】", 3]]);
  targetSheet.getRange("A1:D1").setBackground("#e9ecef").setFontWeight("bold");
  targetSheet.getRange("B1").setBackground("#fff3cd"); // 開始日時の入力セルを目立たせる
  targetSheet.getRange("D1").setBackground("#fff3cd"); // バッファ入力セルを目立たせる

  targetSheet.getRange("F1:G1").setValues([["【総所要時間】", "=TEXT(SUMPRODUCT((A4:A100=TRUE)*(N4:N100+TIME(0,D4:D100,0))), \"[h]時間mm分\")"]]);
  targetSheet.getRange("F1:G1").setFontWeight("bold");

  // ヘッダー行（4行目）
  const headers = [
    "採用", 
    "出走順", 
    "開始予定日時", 
    "バッファ(分)",
    "走者名", 
    "フリガナ", 
    "Discord", 
    "Twitch ID/URL", 
    "X(Twitter)", 
    "ゲームタイトル", 
    "カテゴリ", 
    "機種/環境", 
    "アスペクト比", 
    "EST (hh:mm:ss)", 
    "希望時間帯 (フォーム回答)",
    "参考/PB動画URL"
  ];
  
  targetSheet.getRange(3, 1, 1, headers.length).setValues([headers]);
  targetSheet.getRange(3, 1, 1, headers.length)
    .setBackground("#2c3e50")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");
  
  // フォーム回答データのコピー
  const formData = formSheet.getDataRange().getValues();
  if (formData.length > 1) {
    const rowsToAdd = [];
    
    for (let i = 1; i < formData.length; i++) {
      const row = formData[i];
      const runnerName = row[2] || "";
      const furigana = row[3] || "";
      const discord = row[4] || "";
      const twitch = row[5] || "";
      const twitter = row[6] || "";
      const gameTitle = row[7] || "";
      const category = row[8] || "";
      const platform = row[9] || "";
      const aspect = row[10] || "16:9";
      const est = row[11] || "00:30:00";
      const schedulePref = row[13] || "";
      const videoUrl = row[12] || "";
      
      rowsToAdd.push([
        false,          // 採用 (チェックボックス)
        i,              // 出走順 (連番)
        "",             // 開始予定日時 (自動計算)
        3,              // バッファ時間 (デフォルト3分)
        runnerName,
        furigana,
        discord,
        twitch,
        twitter,
        gameTitle,
        category,
        platform,
        aspect,
        est,
        schedulePref,
        videoUrl
      ]);
    }
    
    if (rowsToAdd.length > 0) {
      targetSheet.getRange(4, 1, rowsToAdd.length, headers.length).setValues(rowsToAdd);
      
      // A列にチェックボックスを挿入
      const checkRange = targetSheet.getRange(4, 1, rowsToAdd.length, 1);
      checkRange.insertCheckboxes();
    }
  }
  
  targetSheet.autoResizeColumns(1, headers.length);
  SpreadsheetApp.getUi().alert("「タイムテーブル」シートを作成しました！\n\n1. B1セルに「イベント開始日時」を入力\n2. 採用する走者にチェック＆出走順を指定\n3. メニューから「2. スケジュール時刻を自動連鎖計算」を実行してください！");
}

/**
 * 採用された走者の出走順に基づき、開始予定時刻を自動で連鎖計算する
 */
function autoCalculateSchedule() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("タイムテーブル");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("エラー: 「タイムテーブル」シートが見つかりません。");
    return;
  }

  const startDateTimeVal = sheet.getRange("B1").getValue();
  if (!startDateTimeVal || isNaN(new Date(startDateTimeVal).getTime())) {
    SpreadsheetApp.getUi().alert("B1セルの「イベント開始日時」が正しく入力されていません。（例: 2026/09/05 13:00）");
    return;
  }

  const defaultBuffer = Number(sheet.getRange("D1").getValue()) || 3;
  const data = sheet.getDataRange().getValues();
  if (data.length <= 3) {
    SpreadsheetApp.getUi().alert("データが存在しません。");
    return;
  }

  const activeRuns = [];
  for (let i = 3; i < data.length; i++) {
    const isAccepted = data[i][0];
    if (isAccepted === true) {
      activeRuns.push({
        rowIndex: i + 1,
        order: Number(data[i][1]) || 999,
        buffer: Number(data[i][3]) || defaultBuffer,
        est: data[i][13]
      });
    } else {
      sheet.getRange(i + 1, 3).setValue("");
    }
  }

  if (activeRuns.length === 0) {
    SpreadsheetApp.getUi().alert("採用（A列チェック）された走者がいません。");
    return;
  }

  // 出走順でソート
  activeRuns.sort((a, b) => a.order - b.order);

  let currentEpoch = new Date(startDateTimeVal).getTime();

  for (let run of activeRuns) {
    const startDateObj = new Date(currentEpoch);
    sheet.getRange(run.rowIndex, 3).setValue(Utilities.formatDate(startDateObj, "Asia/Tokyo", "yyyy/MM/dd HH:mm"));
    
    const estMs = parseEstToMs(run.est);
    const bufferMs = (run.buffer || defaultBuffer) * 60 * 1000;
    currentEpoch += (estMs + bufferMs);
  }

  SpreadsheetApp.getUi().alert("✔ 全走者の開始予定時刻を自動計算しました！\n総走者数: " + activeRuns.length + "名\n終了予定: " + Utilities.formatDate(new Date(currentEpoch), "Asia/Tokyo", "yyyy/MM/dd HH:mm"));
}

/**
 * Discord仮スケジュール確認用のアナウンス文を生成してモーダル表示
 */
function exportDiscordAnnouncement() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("タイムテーブル");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("エラー: 「タイムテーブル」シートが見つかりません。");
    return;
  }

  const data = sheet.getDataRange().getValues();
  if (data.length <= 3) {
    SpreadsheetApp.getUi().alert("データが存在しません。");
    return;
  }

  const activeRuns = [];
  for (let i = 3; i < data.length; i++) {
    const isAccepted = data[i][0];
    if (isAccepted === true) {
      activeRuns.push({
        order: Number(data[i][1]) || (activeRuns.length + 1),
        scheduledAt: data[i][2] ? formatSimpleDate(data[i][2]) : "未設定",
        runnerName: String(data[i][4] || "").trim(),
        discord: String(data[i][6] || "").trim(),
        gameTitle: String(data[i][9] || "").trim(),
        category: String(data[i][10] || "").trim(),
        est: formatEst(data[i][13])
      });
    }
  }

  if (activeRuns.length === 0) {
    SpreadsheetApp.getUi().alert("採用（A列チェック）された走者がいません。");
    return;
  }

  // 出走順ソート
  activeRuns.sort((a, b) => a.order - b.order);

  let doc = "📢 **【仮スケジュール公開＆走者確認のお願い】**\n\n";
  doc += "走者の皆様、ご応募ありがとうございました！\n";
  doc += "現在の仮タイムテーブルを作成いたしましたので、ご自身の **【出走予定日時】** をご確認ください。\n\n";
  doc += "━━━━━━━━━━━━━━━━━━━━━━\n";
  doc += "📅 **仮タイムテーブル一覧**\n";
  doc += "━━━━━━━━━━━━━━━━━━━━━━\n\n";

  activeRuns.forEach(r => {
    // Discordユーザー名（@付きで記載）
    const mention = r.discord ? `@${r.discord}` : `@${r.runnerName}`;
    doc += `**${r.order}. ${r.gameTitle} (${r.category})**\n`;
    doc += `⏱ 予定日時: \`${r.scheduledAt}\` (EST: ${r.est})\n`;
    doc += `👤 走者: ${mention}（${r.runnerName} 様）\n\n`;
  });

  doc += "━━━━━━━━━━━━━━━━━━━━━━\n";
  doc += "✅ **確認手順（お願い）**\n";
  doc += "━━━━━━━━━━━━━━━━━━━━━━\n";
  doc += "1. 上記の日程で問題ない走者様は、**このメッセージにリアクション（:white_check_mark:）** を押してください。\n";
  doc += "2. もし都合が悪く時間調整をご希望の場合は、**【X月X日(日) 23:59まで】** に **この投稿のスレッド** にて変更希望日時をお知らせください。\n";
  doc += "※ 期日までに問題がなければこのスケジュールで本決定とさせていただきます。よろしくお願いいたします！\n";

  showTextDialog("Discord仮スケジュール確認文", doc);
}

/**
 * タイムテーブルシートから schedule.json を生成してモーダル表示
 */
function exportScheduleJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("タイムテーブル");
  
  if (!sheet) {
    SpreadsheetApp.getUi().alert("エラー: 「タイムテーブル」シートが見つかりません。");
    return;
  }
  
  const data = sheet.getDataRange().getValues();
  if (data.length <= 3) {
    SpreadsheetApp.getUi().alert("エラー: データが存在しません。");
    return;
  }
  
  const selectedRuns = [];
  
  for (let i = 3; i < data.length; i++) {
    const row = data[i];
    const isAccepted = row[0];
    
    if (isAccepted === true) {
      const order = Number(row[1]) || (selectedRuns.length + 1);
      const scheduledAtRaw = row[2];
      const bufferMinutes = Number(row[3]) || 3;
      const runnerName = String(row[4] || "").trim();
      const furigana = String(row[5] || "").trim();
      const discord = String(row[6] || "").trim();
      let twitch = String(row[7] || "").trim();
      if (twitch.includes("twitch.tv/")) {
        twitch = twitch.split("twitch.tv/").pop().replace(/[\/\?].*$/, "");
      }
      let twitter = String(row[8] || "").trim().replace(/^@/, "");
      const gameTitle = String(row[9] || "").trim();
      const category = String(row[10] || "").trim();
      const platform = String(row[11] || "").trim();
      let aspect = String(row[12] || "16:9");
      if (aspect.includes("4:3")) {
        aspect = "4:3";
      } else if (aspect.includes("16:9")) {
        aspect = "16:9";
      } else {
        aspect = "custom";
      }
      const est = formatEst(row[13]);
      
      let scheduledAtIso = "";
      if (scheduledAtRaw) {
        try {
          const dateObj = new Date(scheduledAtRaw);
          if (!isNaN(dateObj.getTime())) {
            scheduledAtIso = Utilities.formatDate(dateObj, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss+09:00");
          }
        } catch (e) {
          scheduledAtIso = String(scheduledAtRaw);
        }
      }
      
      selectedRuns.push({
        id: "run-" + String(order).padStart(3, "0"),
        order: order,
        scheduled_at: scheduledAtIso,
        game: {
          title: gameTitle,
          category: category,
          platform: platform,
          aspect_ratio: aspect,
          est: est,
          setup_minutes: bufferMinutes
        },
        runner: {
          name: runnerName,
          furigana: furigana,
          twitch: twitch,
          twitter: twitter,
          discord: discord
        }
      });
    }
  }
  
  if (selectedRuns.length === 0) {
    SpreadsheetApp.getUi().alert("採用（A列にチェック）された走者が1件もありません。");
    return;
  }
  
  selectedRuns.sort((a, b) => a.order - b.order);
  const jsonString = JSON.stringify(selectedRuns, null, 2);
  showTextDialog("スケジュールJSON出力 (NodeCG用)", jsonString);
}

function parseEstToMs(estVal) {
  if (!estVal) return 30 * 60 * 1000;
  if (estVal instanceof Date) {
    const hours = estVal.getUTCHours();
    const minutes = estVal.getUTCMinutes();
    const seconds = estVal.getUTCSeconds();
    return (hours * 3600 + minutes * 60 + seconds) * 1000;
  }
  const str = String(estVal).trim();
  const parts = str.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  if (parts.length === 2) {
    return (parts[0] * 60 + parts[1]) * 1000;
  }
  return 30 * 60 * 1000;
}

function formatEst(val) {
  if (!val) return "00:30:00";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "UTC", "HH:mm:ss");
  }
  const str = String(val).trim();
  const parts = str.split(":");
  if (parts.length === 2) {
    return "00:" + parts[0].padStart(2, "0") + ":" + parts[1].padStart(2, "0");
  }
  if (parts.length === 3) {
    return parts[0].padStart(2, "0") + ":" + parts[1].padStart(2, "0") + ":" + parts[2].padStart(2, "0");
  }
  return str;
}

function formatSimpleDate(val) {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, "Asia/Tokyo", "MM/dd(E) HH:mm");
    }
  } catch (e) {}
  return String(val);
}

function showTextDialog(title, content) {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <style>
          body { font-family: 'Segoe UI', Meiryo, sans-serif; padding: 15px; margin: 0; background: #f8f9fa; }
          h3 { margin-top: 0; color: #2c3e50; font-size: 16px; }
          textarea { width: 100%; height: 320px; font-family: Consolas, Meiryo, monospace; font-size: 12px; padding: 10px; box-sizing: border-box; border: 1px solid #ced4da; border-radius: 4px; resize: vertical; }
          .btn-container { margin-top: 12px; display: flex; gap: 10px; align-items: center; }
          button { padding: 8px 16px; font-size: 14px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; }
          .btn-primary { background: #007bff; color: white; }
          .btn-primary:hover { background: #0056b3; }
          .btn-secondary { background: #6c757d; color: white; }
          #copyMsg { font-size: 13px; color: #28a745; display: none; font-weight: bold; }
        </style>
      </head>
      <body>
        <h3>📋 ${escapeHtml(title)}</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 8px;">以下のテキストをコピーしてご使用ください。</p>
        <textarea id="textArea" readonly>${escapeHtml(content)}</textarea>
        <div class="btn-container">
          <button class="btn-primary" onclick="copyContent()">📋 クリップボードにコピー</button>
          <button class="btn-secondary" onclick="google.script.host.close()">閉じる</button>
          <span id="copyMsg">✔ コピーしました！</span>
        </div>
        <script>
          function copyContent() {
            var el = document.getElementById("textArea");
            el.select();
            el.setSelectionRange(0, 99999);
            document.execCommand("copy");
            var msg = document.getElementById("copyMsg");
            msg.style.display = "inline";
            setTimeout(function() { msg.style.display = "none"; }, 3000);
          }
        </script>
      </body>
    </html>
  `;
  
  const htmlOutput = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(650)
    .setHeight(480);
    
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, title);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
