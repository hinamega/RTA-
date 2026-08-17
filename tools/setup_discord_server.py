"""
Discord Server Auto-Setup Script for RTA Events (Text-Only / Twitch Mirror Edition)
RTAイベント用 Discordサーバー全自動構築スクリプト（テキスト完結・Twitchミラー特化版）

Twitchミラー配信を前提とし、ボイスチャンネルトラブルをゼロにするため
テキストチャンネルのみで完結するシンプルなサーバーを一括構築します。

※ 実行時に既存のチャンネル・カテゴリを自動クリーンアップ（初期化）してから構築します。
"""

import os
import sys
import asyncio
import discord
from discord import Permissions, PermissionOverwrite, Colour

# ==============================================================================
# 設定・定義
# ==============================================================================

# ロール定義 (名前, 色, ホイスト表示, メンション可)
ROLES_CONFIG = [
    {"name": "運営 / 主催", "colour": Colour.from_rgb(231, 76, 60), "hoist": True, "mentionable": True, "admin": True},
    {"name": "走者", "colour": Colour.from_rgb(52, 152, 219), "hoist": True, "mentionable": True, "admin": False},
    {"name": "解説", "colour": Colour.from_rgb(46, 204, 113), "hoist": True, "mentionable": True, "admin": False},
    {"name": "応募者", "colour": Colour.from_rgb(241, 196, 15), "hoist": False, "mentionable": False, "admin": False},
]

async def cleanup_server(guild: discord.Guild):
    """既存のチャンネル・カテゴリを全削除してクリーンな状態にする"""
    print("\n[0/3] 既存のチャンネル・カテゴリをクリーンアップ中...")
    
    # チャンネル削除（テキスト・ボイス）
    for channel in guild.channels:
        if not isinstance(channel, discord.CategoryChannel):
            try:
                await channel.delete(reason="RTAテンプレート初期化のためのクリーンアップ")
                print(f"  - チャンネル削除: #{channel.name}")
            except Exception as e:
                print(f"  [WARN] チャンネル削除失敗 (#{channel.name}): {e}")

    # カテゴリ削除
    for category in guild.categories:
        try:
            await category.delete(reason="RTAテンプレート初期化のためのクリーンアップ")
            print(f"  - カテゴリ削除: [{category.name}]")
        except Exception as e:
            print(f"  [WARN] カテゴリ削除失敗 ([{category.name}]): {e}")

async def setup_server(guild: discord.Guild):
    print(f"\n==================================================")
    print(f"サーバー構築を開始します: {guild.name} (ID: {guild.id})")
    print(f"（Twitchミラー前提・テキスト完結仕様）")
    print(f"==================================================")

    # 0. 既存チャンネルの初期化・クリーンアップ
    await cleanup_server(guild)

    # 1. ロールの作成・更新
    print("\n[1/3] ロールを作成・設定中...")
    created_roles = {}
    everyone_role = guild.default_role

    for r_conf in ROLES_CONFIG:
        existing = discord.utils.get(guild.roles, name=r_conf["name"])
        perms = Permissions.all() if r_conf.get("admin") else Permissions.none()
        
        if existing:
            try:
                await existing.edit(
                    colour=r_conf["colour"],
                    hoist=r_conf["hoist"],
                    mentionable=r_conf["mentionable"],
                    permissions=perms,
                    reason="RTAイベント初期構築（ロール設定更新）"
                )
                print(f"  - ロール '{r_conf['name']}' の設定を更新しました。")
                created_roles[r_conf["name"]] = existing
            except Exception as e:
                print(f"  [WARN] ロール更新失敗 ('{r_conf['name']}'): {e}")
                created_roles[r_conf["name"]] = existing
        else:
            new_role = await guild.create_role(
                name=r_conf["name"],
                colour=r_conf["colour"],
                hoist=r_conf["hoist"],
                mentionable=r_conf["mentionable"],
                permissions=perms,
                reason="RTAイベント初期構築"
            )
            print(f"  + ロール '{r_conf['name']}' を新規作成しました。")
            created_roles[r_conf["name"]] = new_role

    role_admin = created_roles.get("運営 / 主催")
    role_runner = created_roles.get("走者")
    role_commentator = created_roles.get("解説")
    role_applicant = created_roles.get("応募者")

    # 2. カテゴリとチャンネルの作成
    print("\n[2/3] チャンネル＆カテゴリを新規作成・権限設定中...")

    # --- カテゴリ 1: インフォメーション ---
    cat_info_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=True, send_messages=False, add_reactions=True),
        role_admin: PermissionOverwrite(view_channel=True, send_messages=True, manage_messages=True),
    }
    cat_info = await guild.create_category("インフォメーション", overwrites=cat_info_overwrites)
    print(f"  + カテゴリ 'インフォメーション' を作成")

    await guild.create_text_channel(
        "はじめに",
        category=cat_info,
        topic="イベント概要、基本ルール、必読案内です。"
    )
    await guild.create_text_channel(
        "公式アナウンス",
        category=cat_info,
        topic="募集開始、当落発表、タイムテーブル公開などの重要告知です。"
    )
    q_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=True, send_messages=False),
        role_applicant: PermissionOverwrite(view_channel=True, send_messages=True),
        role_admin: PermissionOverwrite(view_channel=True, send_messages=True),
    }
    await guild.create_text_channel(
        "質問・問い合わせ",
        category=cat_info,
        overwrites=q_overwrites,
        topic="応募前・参加前の疑問や問い合わせはこちらへどうぞ。"
    )

    # --- カテゴリ 2: 走者連絡・進行（非公開） ---
    cat_runner_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=False),
        role_runner: PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True),
        role_commentator: PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True),
        role_admin: PermissionOverwrite(view_channel=True, send_messages=True, manage_messages=True),
    }
    cat_runner = await guild.create_category("走者連絡・進行", overwrites=cat_runner_overwrites)
    print(f"  + カテゴリ '走者連絡・進行' を作成（非公開設定）")

    await guild.create_text_channel("走者向け重要連絡", category=cat_runner, topic="提出物締め切り、スケジュール確定案内など")
    await guild.create_text_channel("本番・進行連絡", category=cat_runner, topic="当日の点呼・出番直前連絡（「@走者 次の出番です」等のやり取り用）")
    await guild.create_text_channel("素材提出", category=cat_runner, topic="走者アイコン、レイアウト希望などの画像・素材提出部屋")
    await guild.create_text_channel("走者控室・雑談", category=cat_runner, topic="走者・解説同士の交流・情報交換用")

    # 3. 完了通知
    print(f"\n==================================================")
    print(f"Discordサーバーの自動構築が正常に完了しました。")
    print(f"==================================================")
    print(f"作成された構成:")
    print(f"  - ロール: 運営 / 主催, 走者, 解説, 応募者")
    print(f"  - カテゴリ: インフォメーション (3ch) / 走者連絡・進行 (4ch)")
    print(f"  - ボイスチャンネル: なし（Twitchミラー＆テキスト進行に特化）")
    print(f"\n次のアクション（テンプレート配布用URLの発行）:")
    print(f"  1. Discordで「{guild.name}」のサーバー設定を開く")
    print(f"  2. 「サーバーテンプレート」を選択")
    print(f"  3. テンプレート名を入力して「テンプレートを生成」をクリック")
    print(f"  4. 発行されたURL（https://discord.new/...）を共有可能になります。\n")


# ==============================================================================
# Bot クライアント起動処理
# ==============================================================================

class SetupClient(discord.Client):
    def __init__(self, target_guild_id: int):
        intents = discord.Intents.default()
        intents.guilds = True
        super().__init__(intents=intents)
        self.target_guild_id = target_guild_id

    async def on_ready(self):
        print(f"Botがログインしました: {self.user} (ID: {self.user.id})")
        guild = self.get_guild(self.target_guild_id)
        if not guild:
            print(f"[ERROR] 指定されたサーバーID ({self.target_guild_id}) が見つかりません。")
            print(f"Botが対象サーバーに招待されているか確認してください。")
            await self.close()
            return

        try:
            await setup_server(guild)
        except Exception as e:
            print(f"[ERROR] サーバー構築中にエラーが発生しました: {e}")
        finally:
            await self.close()

def main():
    token = os.environ.get("DISCORD_BOT_TOKEN")
    guild_id_str = os.environ.get("DISCORD_GUILD_ID")

    if not token or not guild_id_str:
        print("-------------------------------------------------")
        print("  RTAイベント用 Discordサーバー自動構築スクリプト")
        print("  （Twitchミラー・テキスト完結エディション）")
        print("-------------------------------------------------")
        if not token:
            token = input("Discord Bot Token を入力してください: ").strip()
        if not guild_id_str:
            guild_id_str = input("対象の サーバーID (Guild ID) を入力してください: ").strip()

    try:
        guild_id = int(guild_id_str)
    except ValueError:
        print("[ERROR] サーバーIDは数字で入力してください。")
        sys.exit(1)

    client = SetupClient(target_guild_id=guild_id)
    client.run(token)

if __name__ == "__main__":
    main()
