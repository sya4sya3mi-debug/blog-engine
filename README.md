# BlogEngine

アフィリエイトブログ自動化ダッシュボード

## セットアップ

### 1. 依存パッケージのインストール
```bash
npm install
```

### 2. 環境変数の設定
Vercelの「Environment Variables」に以下を追加：

| 変数名 | 値 |
|---|---|
| `RESEND_API_KEY` | Resendで発行したAPIキー（re_から始まる） |
| `NEXT_PUBLIC_APP_URL` | デプロイ後のURL（例: https://blog-engine.vercel.app） |

### 3. ローカル開発
```bash
npm run dev
```

### 4. Vercelデプロイ
GitHubにpush → Vercelで自動デプロイ

## 機能
- AI記事自動生成（Claude API）
- 人間レビューフロー（承認するまで投稿されません）
- Resendによるメール通知（生成完了・承認・差し戻し）
- アフィリエイトリンク自動挿入
