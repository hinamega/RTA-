# LiveSplit 自動連携ガイド

走者のタイマー（LiveSplit）と NodeCG を TCP 接続し、**走者のタイムをそのまま配信オーバーレイへ同期** するためのガイドです。手動で START / FINISH を押す必要がなくなり、ワンオペの事故を大幅に減らせます。

---

## 1. 仕組み

```text
[走者PC: LiveSplit]
   └── TCP Server (標準ポート 16834)
            ↑ コマンド問い合わせ（約0.5秒ごと）
[NodeCG 拡張機能 (livesplit.js)]
   └── getcurrenttimerphase / getcurrenttime / getsplitindex ... を取得
            ↓
   timer レプリカントを自動更新 ──> OBSオーバーレイに即反映
```

- Node.js 標準の `net` モジュールのみ使用。**追加ライブラリ不要**です。
- LiveSplit の状態（NotRunning / Running / Paused / Ended）をタイマー表示・色に自動反映します。
- 走者が LiveSplit を操作するだけで、配信側は何もしなくてOK。

---

## 2. LiveSplit 側の準備（走者PC）

1. LiveSplit を起動します。
2. タイマー画面を **右クリック** します。
3. **Control** → **Start TCP Server** をクリックします。

> [!IMPORTANT]
> TCP Server は LiveSplit を起動するたびに手動で開始する必要があります。
> 走者向けチェックリストに「LiveSplit の TCP Server を開始」を必ず入れておきましょう。

- ポート番号は LiveSplit の設定（Settings → Server Port）で変更できます。デフォルトは `16834` です。

---

## 3. NodeCG 側の操作

ダッシュボードの **「⏱️ LiveSplit 自動連携」** カードで設定します。

| 項目 | 説明 |
| --- | --- |
| ホスト | 走者PCのIPアドレス。同じPCなら `127.0.0.1`。LAN越しなら走者PCのIP（例: `192.168.1.20`） |
| ポート | LiveSplit の Server Port（通常 `16834`） |
| 接続 | その場で接続を試みます |
| タイマー表示を LiveSplit に同期 | ONにすると配信タイマーが LiveSplit と完全連動（推奨） |
| 起動時に自動接続 | ONなら NodeCG 起動時に自動で接続を試みます |

- 接続に成功するとステータスが **「接続中」** に変わります。
- 同期中はダッシュボードの手動タイマーボタンが無効化されます（誤操作防止）。

---

## 4. 実走記録と VOD チャプター

LiveSplit 連携中は、以下のタイミングが **自動でスケジュールに記録** されます。

- **出走開始**: タイマーが Running になった瞬間（`actual_start`）
- **走行終了**: タイマーが Ended になった瞬間、または「次の走者」を押した瞬間（`actual_end`）

この記録は [VODチャプター自動生成](vod_chapter_and_alert_guide.md) にそのまま使われます。

---

## 5. トラブルシューティング

### Q. 接続できない（ステータスが「未接続」のまま）
- LiveSplit 側で **Start TCP Server** を押し忘れていませんか？
- ポート番号が一致していますか？
- LAN越しの場合、走者PCの **ファイアウォール** で 16834 番ポートが許可されていますか？
- Windows の場合は、LiveSplit の初回起動時に表示されるファイアウォール許可ダイアログで「プライベートネットワーク」を許可してください。

### Q. 接続はできるがタイムが動かない
- LiveSplit 側でタイマーが正しく動いているか確認してください。
- スプリットファイルが読み込まれていると安定します（未読み込みでもタイム取得は可能）。

### Q. タイムの桁がおかしい
- LiveSplit のタイミング方式（Real Time / Game Time）は `getcurrenttime`（現在の方式）を取得しています。方式を変えたい場合は LiveSplit 側で切り替えてください。
