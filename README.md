# 3エージェント対話GUI — v2 再生成

## 要件
- Node.js 20+ / npm 10+（Ubuntu 24 標準でOK）

## セットアップ
```bash
npm install
npm run dev
# -> http://localhost:3000
```
## メモ
- 各キャラタブ：プロバイダ→モデル選択、単体テストは `/api/chat` を叩いてローカルLLMに接続（OpenAI互換）
- 対話タブ：順序ドラッグ&ドロップ、ログは自動スクロール
- 設定保存/読み込み/エクスポート：localStorage & JSON
