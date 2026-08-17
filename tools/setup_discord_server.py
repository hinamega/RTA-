"""
Discord Server Auto-Setup Script for RTA Events
RTAイベント用 Discordサーバー全自動構築スクリプト

空のDiscordサーバーにBotを招待し、本スクリプトを実行することで
ロール、チャンネル、カテゴリ、権限設定を一括で自動構築します。
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

async def setup_server(guild: discord.Guild):
    print(f"\n==================================================")
    print(f"🚀 サーバー構築を開始します: {guild.name} (ID: {guild.id})")
    print(f"==================================================\n")

    # 1. ロールの作成
    print("🔹 [1/3] ロールを作成・設定中...")
    created_roles = {}
    everyone_role = guild.default_role

    for r_conf in ROLES_CONFIG:
        # 既存ロールのチェック
        existing = discord.utils.get(guild.roles, name=r_conf["name"])
        if existing:
            print(f"  - ロール '{r_conf['name']}' は既に存在するためスキップします。")
            created_roles[r_conf["name"]] = existing
        else:
            perms = Permissions.all() if r_conf.get("admin") else Permissions.none()
            new_role = await guild.create_role(
                name=r_conf["name"],
                colour=r_conf["colour"],
                hoist=r_conf["hoist"],
                mentionable=r_conf["mentionable"],
                permissions=perms,
                reason="RTAイベント初期構築"
            )
            print(f"  + ロール '{r_conf['name']}' を作成しました。")
            created_roles[r_conf["name"]] = new_role

    role_admin = created_roles.get("運営 / 主催")
    role_runner = created_roles.get("走者")
    role_commentator = created_roles.get("解説")
    role_applicant = created_roles.get("応募者")

    # 2. カテゴリとチャンネルの作成
    print("\n🔹 [2/3] チャンネル＆カテゴリを作成・権限設定中...")

    # --- カテゴリ 1: インフォメーション ---
    cat_info_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=True, send_messages=False, add_reactions=True),
        role_admin: PermissionOverwrite(view_channel=True, send_messages=True, manage_messages=True),
    }
    cat_info = await guild.create_category("📢 インフォメーション", overwrites=cat_info_overwrites)
    print(f"  + カテゴリ '📢 インフォメーション' を作成")

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
    # 質問チャンネルのみ応募者の書き込みを許可
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

    # --- カテゴリ 2: 走者・解説専用（非公開） ---
    cat_runner_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=False),
        role_runner: PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True),
        role_commentator: PermissionOverwrite(view_channel=True, send_messages=True, attach_files=True),
        role_admin: PermissionOverwrite(view_channel=True, send_messages=True, manage_messages=True),
    }
    cat_runner = await guild.create_category("🏃 走者・解説連絡", overwrites=cat_runner_overwrites)
    print(f"  + カテゴリ '🏃 走者・解説連絡' を作成（非公開設定）")

    await guild.create_text_channel("走者向け重要連絡", category=cat_runner, topic="提出物締め切り、スケジュール案内など")
    await guild.create_text_channel("素材提出", category=cat_runner, topic="走者アイコン、レイアウト希望などの画像・素材提出部屋")
    await guild.create_text_channel("リハーサル日程調整", category=cat_runner, topic="事前接続テスト・リハの日程すり合わせ")
    await guild.create_text_channel("走者控室・雑談", category=cat_runner, topic="走者・解説同士の交流・情報交換用")

    # --- カテゴリ 3: 進行・解説通話（VC） ---
    cat_vc_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=True, connect=False),
        role_runner: PermissionOverwrite(view_channel=True, connect=True, speak=True),
        role_commentator: PermissionOverwrite(view_channel=True, connect=True, speak=True),
        role_admin: PermissionOverwrite(view_channel=True, connect=True, speak=True, move_members=True),
    }
    cat_vc = await guild.create_category("🎙️ 進行・解説通話", overwrites=cat_vc_overwrites)
    print(f"  + カテゴリ '🎙️ 進行・解説通話' を作成（VC入室制限設定）")

    # 解説・実況通話（解説がいるゲームでOBSに音声を乗せる部屋）
    await guild.create_voice_channel(
        "🎙️ 解説・実況通話",
        category=cat_vc,
        user_limit=5
    )
    # 点呼・待機控室（出番前の走者との配信確認・点呼用）
    await guild.create_voice_channel("⏳ 点呼・待機控室", category=cat_vc)
    # 接続テスト用
    await guild.create_voice_channel("🔧 接続テスト・リハ用VC", category=cat_vc)
    
    # 運営専用VC
    admin_vc_overwrites = {
        everyone_role: PermissionOverwrite(view_channel=False, connect=False),
        role_admin: PermissionOverwrite(view_channel=True, connect=True, speak=True),
    }
    await guild.create_voice_channel("🔒 運営専用VC", category=cat_vc, overwrites=admin_vc_overwrites)

    # 3. 完了通知
    print("\n🔹 [3/3] 構築完了！")
    print(f"==================================================")
    print(f"🎉 Discordサーバーの自動構築が正常に完了しました！")
    print(f"==================================================")
    print(f"\n💡 次のアクション（テンプレート配布用URLの発行）:")
    print(f"  1. Discordで「{guild.name}」のサーバー設定を開く")
    print(f"  2. 「サーバーテンプレート」を選択")
    print(f"  3. テンプレート名を入力して「テンプレートを生成」をクリック")
    print(f"  4. 発行されたURL（https://discord.new/...）をREADME等で配布可能になります！\n")


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
        print(f"🤖 Botがログインしました: {self.user} (ID: {self.user.id})")
        guild = self.get_guild(self.target_guild_id)
        if not guild:
            print(f"❌ エラー: 指定されたサーバーID ({self.target_guild_id}) が見つかりません。")
            print(f"   Botが対象サーバーに招待されているか確認してください。")
            await self.close()
            return

        try:
            await setup_server(guild)
        except Exception as e:
            print(f"❌ サーバー構築中にエラーが発生しました: {e}")
        finally:
            await self.close()

def main():
    token = os.environ.get("DISCORD_BOT_TOKEN")
    guild_id_str = os.environ.get("DISCORD_GUILD_ID")

    if not token or not guild_id_str:
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("  RTAイベント用 Discordサーバー自動構築スクリプト")
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        if not token:
            token = input("👉 Discord Bot Token を入力してください: ").strip()
        if not guild_id_str:
            guild_id_str = input("👉 対象の サーバーID (Guild ID) を入力してください: ").strip()

    try:
        guild_id = int(guild_id_str)
    except ValueError:
        print("❌ サーバーIDは数字で入力してください。")
        sys.exit(1)

    client = SetupClient(target_guild_id=guild_id)
    client.run(token)

if __name__ == "__main__":
    main()
