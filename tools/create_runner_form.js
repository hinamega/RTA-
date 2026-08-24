/**
 * Google Apps Script (GAS)
 * オンラインRTAイベント 走者応募フォーム 自動生成スクリプト
 *
 * 【使い方】
 * 1. Google Drive (https://drive.google.com/) で新規の Google スプレッドシートを作成
 * 2. メニュー「拡張機能」>「Apps Script」を開く
 * 3. エディタにこのコードをすべて貼り付けて保存
 * 4. 関数「createRunnerForm」を選択して「実行」ボタンをクリック
 * 5. 実行ログに出力された URL からフォームと連携スプレッドシートを開く
 */

function createRunnerForm() {
  const formTitle = "【第X回】オンラインRTAイベント 走者応募フォーム";
  const formDescription = 
    "オンラインRTAイベントの走者応募フォームです。\n" +
    "募集要項・参加規約をご確認の上、ご応募をお願いいたします。\n\n" +
    "【開催日程】202X年X月X日(土) 〜 X月X日(日)\n" +
    "【配信形式】Twitchミラー配信（走者ご自身のTwitch配信をイベント本配信でミラーします）\n" +
    "【応募締切】202X年X月X日(日) 23:59まで\n" +
    "【応募件数】お一人様何タイトルでも応募可能です（※1回の送信につき1ゲームずつご応募ください）";

  // 1. フォームの新規作成
  const form = FormApp.create(formTitle);
  form.setDescription(formDescription);
  form.setCollectEmail(true); // メールアドレスの収集
  form.setAllowResponseEdits(true); // 回答後の編集を許可
  form.setIsSpreadsheet(true);

  // ==========================================
  // セクション 1: 走者情報
  // ==========================================
  
  // 走者名
  form.addTextItem()
    .setTitle("走者名（プレイヤー名）")
    .setHelpText("配信オーバーレイおよびスケジュール表に掲載される名前です。（例: ひなめが）")
    .setRequired(true);

  // フリガナ
  form.addTextItem()
    .setTitle("フリガナ（よみがな）")
    .setHelpText("全角カタカナまたはひらがなで入力してください。（例: ヒナメガ）")
    .setRequired(true);

  // Discord ユーザー名
  form.addTextItem()
    .setTitle("Discord ユーザー名")
    .setHelpText("当選連絡・進行管理用Discordサーバーへの招待に使用します。サーバー内の表示名ではなく英数字のユーザー名を入力してください。（例: hinamega または hinamega_dev）")
    .setRequired(true);

  // Twitch チャンネルURL / ID
  form.addTextItem()
    .setTitle("Twitch チャンネルURL または ユーザーID")
    .setHelpText("イベント本番でミラー配信を取得する配信先です。（例: https://www.twitch.tv/hinamega または hinamega）")
    .setRequired(true);

  // X (Twitter) ユーザー名
  form.addTextItem()
    .setTitle("X (Twitter) ユーザー名")
    .setHelpText("スケジュール公開時や出走時の告知メンションに使用します。任意項目です。（例: @hinamega_dev）")
    .setRequired(false);

  // ==========================================
  // セクション 2: ゲーム情報・申請内容
  // ==========================================
  form.addPageBreakItem()
    .setTitle("ゲーム情報・申請内容")
    .setHelpText("出走を希望するゲームタイトルおよびカテゴリの情報を入力してください。");

  // ゲームタイトル
  form.addTextItem()
    .setTitle("ゲームタイトル")
    .setHelpText("正式名称で入力してください。略称は不可です。（例: Super Mario 64）")
    .setRequired(true);

  // カテゴリ
  form.addTextItem()
    .setTitle("カテゴリ")
    .setHelpText("（例: 16 Star, Any% No Major Glitches）")
    .setRequired(true);

  // プラットフォーム / 機種
  form.addTextItem()
    .setTitle("プラットフォーム / プレイ環境")
    .setHelpText("プレイする機種や環境を入力してください。（例: PC (Steam), Nintendo Switch, N64実機）")
    .setRequired(true);

  // アスペクト比
  const aspectItem = form.addMultipleChoiceItem();
  aspectItem.setTitle("ゲーム画面のアスペクト比")
    .setHelpText("配信オーバーレイのレイアウト配置に使用します。")
    .setChoiceValues([
      "16:9（ワイド・HD現行機/PC）",
      "4:3（スタンダード・レトロ実機/SD）",
      "その他（DS/3DS縦並び、特殊解像度など）"
    ])
    .setRequired(true);

  // 予定タイム（EST） - 正規表現バリデーション付き
  const estValidation = FormApp.createTextValidation()
    .setHelpText("「hh:mm:ss」の形式で入力してください（例: 00:45:00, 01:30:00）")
    .requireTextMatchesRegex("^\\d{1,2}:\\d{2}:\\d{2}$")
    .build();

  form.addTextItem()
    .setTitle("予定タイム（EST: Estimated Time）")
    .setHelpText("トラブルや多少のミスを含め、完走できる最大の目安時間を入力してください。\n形式: hh:mm:ss（例: 00:45:00, 01:30:00）")
    .setValidation(estValidation)
    .setRequired(true);

  // 参考動画 / PB動画URL
  form.addTextItem()
    .setTitle("参考動画 / 自己ベスト(PB)動画 URL")
    .setHelpText("speedrun.comの記録ページ、YouTube、TwitchのハイライトなどのURLを入力してください。（例: https://youtu.be/xxxxxx）")
    .setRequired(true);

  // ==========================================
  // セクション 3: 配信環境・日程・同意事項
  // ==========================================
  form.addPageBreakItem()
    .setTitle("配信環境・日程・同意事項")
    .setHelpText("本番のミラー配信要件の確認および出走可能日程を入力してください。");

  // ミラー配信要件の確認
  const envCheckItem = form.addCheckboxItem();
  envCheckItem.setTitle("ミラー配信要件の確認")
    .setHelpText("以下の条件をすべて満たしていることを確認し、チェックを入れてください。")
    .setChoiceValues([
      "Twitchで720p 60fps以上（ビットレート3000kbps以上推奨）の安定した映像配信が可能である",
      "有線LANまたは安定した通信環境を用意できる",
      "ゲーム音および自身のマイク音声を適切に出力できる（音量バランスが取れている）"
    ])
    .setRequired(true);

  // 参加可能日時
  const scheduleItem = form.addCheckboxItem();
  scheduleItem.setTitle("参加可能日時・時間帯")
    .setHelpText("出走可能な時間帯をすべて選択してください。（※イベント開催日に合わせて選択肢を書き換えてください）")
    .setChoiceValues([
      "1日目(土) 10:00 〜 14:00",
      "1日目(土) 14:00 〜 18:00",
      "1日目(土) 18:00 〜 22:00",
      "2日目(日) 10:00 〜 14:00",
      "2日目(日) 14:00 〜 18:00",
      "2日目(日) 18:00 〜 22:00",
      "全日程いつでも参加可能"
    ])
    .setRequired(true);

  // アピールポイント
  form.addParagraphTextItem()
    .setTitle("アピールポイント・見どころ（任意）")
    .setHelpText("ゲームの見どころ、解説の工夫（セルフ実況・自身の配信枠へのゲスト同伴等）、意気込みなどをご自由にご記入ください。")
    .setRequired(false);

  // 参加規約の同意
  const termsText = 
    "【参加規約】\n" +
    "1. 配信ミラーの同意: 走者様ご自身のTwitch配信をイベント本配信にてミラー中継・アーカイブ公開することに同意します。\n" +
    "2. 連絡対応: 当選後の連絡および当日の進行管理のため、指定の専用Discordサーバーへ参加し、期日までに連絡対応を行います。\n" +
    "3. 規約遵守: プラットフォームの利用規約およびゲームの配信ガイドラインを遵守します。";

  const agreeItem = form.addCheckboxItem();
  agreeItem.setTitle("参加規約・注意事項への同意")
    .setHelpText(termsText)
    .setChoiceValues([
      "参加規約に同意し、決定したスケジュール・連絡事項を遵守することを誓います"
    ])
    .setRequired(true);

  // 2. 回答収集用スプレッドシートの作成と紐付け
  const spreadsheet = SpreadsheetApp.create(formTitle + " (回答一覧)");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, spreadsheet.getId());

  // 完了ログ出力
  Logger.log("=== フォーム生成が完了しました ===");
  Logger.log("編集用URL (Edit Form): " + form.getEditUrl());
  Logger.log("公開用URL (Published URL): " + form.getPublishedUrl());
  Logger.log("回答スプレッドシートURL: " + spreadsheet.getUrl());
}
