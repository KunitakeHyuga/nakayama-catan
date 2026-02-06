# nakayamalab-catan

`deploy-test` の構成をベースに、Catanatron サーバーと React UI を Cloudflare Tunnel 経由で公開するためのデプロイ用リポジトリです。`docker compose` ひとつで PostgreSQL、Flask(API)、nginx、cloudflared、React ビルドをまとめて起動できます。

## ディレクトリ構成

```
.
├── backend/           # Catanatron Web サーバー用 Dockerfile
├── catanatron-src/    # 上流 Catanatron リポジトリ (scripts/fetch-catanatron.sh で取得)
├── cloudflared/       # Tunnel 設定と Dockerfile
├── frontend/          # React UI (Vite) をビルドして配信する Dockerfile
├── scripts/           # セットアップ用スクリプト
├── docker-compose.yml # 各コンテナを束ねる Compose 設定
├── nginx.conf         # Cloudflared からのリクエストを server:5001 へ中継
├── .env.example       # Compose と frontend 共通の環境変数テンプレート
└── README.md          # このファイル
```

## 初期セットアップ

1. **依存インストール**: Docker 25 以降と Docker Compose v2 が稼働するホストを用意します。
2. **Catanatron 取得**: `scripts/fetch-catanatron.sh` を実行して `catanatron-src/` に公式ソースをクローンします。
   ```bash
   cd nakayamalab-catan
   ./scripts/fetch-catanatron.sh  # master ブランチを shallow clone
   ```
   既に自分で fork 済みの場合は `./scripts/fetch-catanatron.sh <repo_url> <branch>` のように引数で差し替えできます。`catanatron-src/` は `.gitignore` 済みなので自由に編集して問題ありません。
3. **環境変数**: `.env.example` をコピーして `.env` を作成し、DB・OpenAI・Cloudflare・フロントエンド URL などを調整します。
   ```bash
   cp .env.example .env
   $EDITOR .env
   ```
4. **Cloudflared 設定**:
   - `cloudflared/config.yml` の `tunnel` / `credentials-file` / `hostname` を自身のトンネル ID と公開サブドメインに書き換えます。
   - `~/.cloudflared/<tunnel_id>.json` を `cloudflared/` ディレクトリへコピーし、`config.yml` で参照しているファイル名と一致させます。
   - `chmod 600 cloudflared/*.json` などでパーミッションを整えます。
5. **Cloudflare DNS**: Qiita 記事と同様に `cloudflared tunnel route dns` でサブドメインをトンネルへ割り当てます。

## デプロイ

```bash
docker compose build --no-cache
docker compose up -d
```

- `server`: Flask + FastAPI ベースの Catanatron API (`http://localhost:5001/docs` や `/health` エンドポイント) に直接アクセスできます。
- `db`: PostgreSQL 15。`pg-data` ボリュームで永続化され、`DATABASE_URL` でサーバーへ共有されます。
- `nginx`: Cloudflared とのみ接続し、`http://localhost:8080/healthz` で疎通確認できます。
- `cloudflared`: Cloudflare Tunnel へ常時接続し、外部から `https://<hostname>/` でアクセスできます。
- `react-ui`: `docker compose up -d react-ui` を実行済みなら `http://localhost:4173` で UI を確認できます。`CTRON_API_URL` で API ベース URL を指定可能です。

停止は `docker compose down`。PostgreSQL のデータは `pg-data` ボリュームに保持されます。

## よく使うカスタマイズ

- **Catanatron のバージョン固定**: `scripts/fetch-catanatron.sh https://github.com/<your-org>/catanatron.git <branch>` で独自ブランチを shallow clone できます。ソース更新後は `docker compose build server react-ui` で再ビルドしてください。
- **OpenAI キー**: `.env` の `OPENAI_API_KEY` にキーを設定すると、UI 右ペインの交渉アドバイスが機能します。
- **フロントエンド公開先**: 本番 URL に合わせて `.env` の `CTRON_API_URL` / `CTRON_PUBLIC_URL` を Cloudflare ドメインへ変更すると、ビルド済み UI がその URL を埋め込みます。

## トラブルシューティング

- `server` ビルド時に `pyproject.toml` が見つからない → `catanatron-src/` に Catanatron のソースが存在するか確認してください。
- Cloudflared が `config.yml` を読み込めない → `cloudflared/` 配下の JSON & YAML をホストから正しいファイル名でコピーし、パーミッションを 600 に設定します。
- UI だけ確認したい → `docker compose up -d react-ui` を単体で実行し、`.env` の `CTRON_API_URL` を `http://host.docker.internal:5001` などに設定してください。

Qiita の手順（Cloudflare Tunnel 連携）との違いはアプリ本体が FastAPI ベースから Catanatron に置き換わっただけで、その他のトポロジーは `deploy-test` と同様です。
