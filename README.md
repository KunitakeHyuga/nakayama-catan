# nakayamalab-catan

`deploy-test` の構成をベースに、Catanatron サーバーを Cloudflare Tunnel 経由で公開するためのデプロイ用リポジトリです。開発時は backend を `localhost:5001` で直接利用し、デプロイ時のみ `nginx + cloudflared` を使います。

## ディレクトリ構成

```
.
├── backend/           # Catanatron Web サーバー用 Dockerfile & ソース
│   └── app/           # `scripts/fetch-catanatron.sh` で同期される Python パッケージ
├── cloudflared/       # Tunnel 設定と Dockerfile
├── frontend/          # React UI (Vite) をビルドして配信する Dockerfile
│   └── app/           # UI 本体（同上スクリプトで同期）
├── scripts/           # セットアップ用スクリプト
├── docker-compose.yml      # 開発用の標準 Compose 設定
├── docker-compose.prod.yml # デプロイ用 override
├── nginx.conf         # Cloudflared からのリクエストを server:5001 へ中継
├── .env.example       # 開発用環境変数テンプレート
├── .env.prod.example  # デプロイ用環境変数テンプレート
└── README.md          # このファイル
```

## 初期セットアップ

1. **依存インストール**: Docker 25 以降と Docker Compose v2 が稼働するホストを用意します。
2. **Catanatron 取得**: `scripts/fetch-catanatron.sh` を実行して backend/app と frontend/app に公式ソースを同期します。
   ```bash
   cd nakayamalab-catan
   ./scripts/fetch-catanatron.sh  # master ブランチを shallow clone
   ```
   既に自分で fork 済みの場合は `./scripts/fetch-catanatron.sh <repo_url> <branch>` のように引数で差し替えできます。スクリプトを実行すると Python パッケージ (`backend/app/`) と React UI (`frontend/app/`) がまとめて置き換わるため、ローカルで編集している場合は事前にコミットや退避を行ってください。
3. **環境変数**:
   - 開発: `.env.example` を `.env` にコピーして編集
   - 本番: `.env.prod.example` を `.env.prod` にコピーして編集
   ```bash
   cp .env.example .env
   cp .env.prod.example .env.prod
   $EDITOR .env
   $EDITOR .env.prod
   ```
4. **Cloudflared 設定**:
   - `cloudflared/config.yml` の `tunnel` / `credentials-file` / `origincert` / `hostname` を自身のトンネル ID と公開サブドメインに書き換えます。
   - `~/.cloudflared/<tunnel_id>.json` と `~/.cloudflared/cert.pem` を `cloudflared/` ディレクトリへコピーし、`config.yml` で参照しているパス（例: `/etc/cloudflared/<tunnel_id>.json` や `/etc/cloudflared/cert.pem`）と一致させます。`cert.pem` は `cloudflared tunnel login` 実行時に生成されるアカウント証明書です。
   - コンテナ内では cloudflared ユーザーが読み取れるよう、`chmod 644 cloudflared/*.{json,pem}` などでパーミッションを調整します。
5. **Cloudflare DNS**: Qiita 記事と同様に `cloudflared tunnel route dns` でサブドメインをトンネルへ割り当てます。

## デプロイ

開発環境（普段使い）:

```bash
docker compose build
docker compose up -d
```

デプロイ:

```bash
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml up -d
```

- `server`: Flask + FastAPI ベースの Catanatron API（開発では `http://localhost:5001` に公開）。
  - API 一覧は `http://localhost:5001/apidocs/`（Flasgger Swagger UI）から確認できます。
- `db`: PostgreSQL 15。`pg-data` ボリュームで永続化され、`DATABASE_URL` でサーバーへ共有されます（開発では `localhost:5432` 公開）。
- `nginx`: デプロイ時のみ有効。Cloudflared からの内部アクセス専用で、ホストには公開しません。
- `cloudflared`: デプロイ時のみ有効。Cloudflare Tunnel へ接続し、外部から `https://<hostname>/` でアクセスできます。
- `react-ui`: 開発で `http://localhost:4173` に公開。`CTRON_API_URL` で API ベース URL を指定可能です。

停止:
- 開発: `docker compose down`
- デプロイ: `docker compose --env-file .env.prod -f docker-compose.yml -f docker-compose.prod.yml down`
PostgreSQL のデータは `pg-data` ボリュームに保持されます。

## よく使うカスタマイズ

- **Catanatron のバージョン固定**: `scripts/fetch-catanatron.sh https://github.com/<your-org>/catanatron.git <branch>` で独自ブランチを shallow clone できます。ソース更新後は `docker compose build server react-ui` で再ビルドしてください。backend/app, frontend/app はホスト側から直接編集でき、`server` サービスにはボリュームとしてマウントされます。
- **OpenAI キー**: `.env` / `.env.prod` の `OPENAI_API_KEY` を設定すると、UI 右ペインの交渉アドバイスが機能します。
- **フロントエンド公開先**: 開発時は `.env` の `CTRON_API_URL` / `CTRON_PUBLIC_URL` を使って `react-ui` をビルドします（GitHub Pages 運用時は Actions 側で注入）。
  - GitHub Pages では `CTRON_API_URL` を GitHub の `Secrets`（または `Variables`）に設定して注入します。

## トラブルシューティング

- `server` ビルド時に `pyproject.toml` が見つからない → `backend/app/pyproject.toml` が揃っているか（fetch スクリプトで同期したか）確認してください。
- Cloudflared が `config.yml` を読み込めない → `cloudflared/` 配下の JSON & YAML をホストから正しいファイル名でコピーし、パーミッションを 600 に設定します。
- UI だけ確認したい → `docker compose up -d react-ui` を実行してください。

Qiita の手順（Cloudflare Tunnel 連携）との違いはアプリ本体が FastAPI ベースから Catanatron に置き換わっただけで、その他のトポロジーは `deploy-test` と同様です。
