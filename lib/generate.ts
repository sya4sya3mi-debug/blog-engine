// ==========================================
// BlogEngine V2 - AI Article Generation Engine
// ==========================================

import Anthropic from "@anthropic-ai/sdk";
import { SubTheme } from "./config";

export interface GeneratedArticle {
  title: string;
  metaDescription: string;
  htmlContent: string;
  keyword: string;
  themeLabel: string;
}

const CURRENT_YEAR = new Date().getFullYear();

// ----- 自動生成用プロンプト（Cron / テーマローテーション） -----
function buildAutoPrompt(keyword: string, theme: SubTheme, genreName: string): string {
  return `あなたはSEOに精通したアフィリエイトブログのプロライターです。
以下の条件で、WordPress投稿用の完全なHTML記事を作成してください。

【ブログ名】${genreName}
【カテゴリ】${theme.label}
【メインキーワード】${keyword}
【年度】${CURRENT_YEAR}年

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "title": "【${CURRENT_YEAR}年最新】〇〇おすすめランキング",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "htmlContent": "HTML本文"
}
\`\`\`

## htmlContent の要件
- 必ず以下のHTML構造にしてください：
  - <h2> で大見出し（3〜5個）
  - <h3> で小見出し
  - <p> で段落（各段落は2〜3文）
  - <table> で比較表（おすすめ商品一覧）
  - <ul><li> でポイントのリスト
- 文字数は2000〜3000字程度
- 導入文で読者の悩みに共感し、この記事で解決できることを伝える
- 「選び方のポイント」セクションを含める
- おすすめランキングTOP5を <h3> で各商品紹介
  - 各商品に「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定】</p>」を含める
- まとめセクションでCTAを含める
- 文体は「ですます調」、30〜40代女性をターゲット
- 自然な日本語で、AIっぽさを排除した読みやすい文体にする`;
}

// ----- 商品指定生成用プロンプト（手動 / 複数商品対応） -----
function buildProductPrompt(products: string[], genreName: string, customKeyword?: string): string {
  const productList = products.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const keywordLine = customKeyword
    ? `【狙いたいキーワード】${customKeyword}`
    : `【キーワード】商品名から最適なSEOキーワードを自動決定してください`;

  return `あなたはSEOに精通したアフィリエイトブログのプロライターです。
以下の商品をフィーチャーした記事を作成してください。

【ブログ名】${genreName}
${keywordLine}
【年度】${CURRENT_YEAR}年

【紹介する商品】
${productList}

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "title": "【${CURRENT_YEAR}年最新】〇〇おすすめ比較",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "htmlContent": "HTML本文"
}
\`\`\`

## htmlContent の要件
- 必ず以下のHTML構造にしてください：
  - <h2> で大見出し（3〜5個）
  - <h3> で小見出し（各商品名を含む）
  - <p> で段落（各段落は2〜3文）
  - <table> で比較表（指定商品の比較一覧。価格帯・特徴・おすすめ度を含む）
  - <ul><li> でポイントのリスト
- 文字数は2000〜3000字程度
- 導入文で読者の悩みに共感し、この記事で解決できることを伝える
- 「選び方のポイント」セクション
- 指定された各商品を <h3> で個別レビュー
  - 商品のメリット・デメリットを公平に記載
  - 各商品に「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：${"{商品名}"}】</p>」を含める
- まとめセクションで「こんな人にはこの商品」という提案を含める
- 文体は「ですます調」、30〜40代女性をターゲット
- 自然な日本語で、AIっぽさを排除した読みやすい文体にする
- 商品の知識はあなたの学習データに基づいて正確に記載してください`;
}

function extractJSON(text: string): { title: string; metaDescription: string; htmlContent: string } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim());
  }
  return JSON.parse(text.trim());
}

async function callClaude(apiKey: string, prompt: string) {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

/** 自動生成（Cronテーマローテーション用） */
export async function generateArticle(
  apiKey: string,
  keyword: string,
  theme: SubTheme,
  genreName: string
): Promise<GeneratedArticle> {
  const prompt = buildAutoPrompt(keyword, theme, genreName);
  const responseText = await callClaude(apiKey, prompt);
  const parsed = extractJSON(responseText);

  return {
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    htmlContent: parsed.htmlContent,
    keyword,
    themeLabel: theme.label,
  };
}

/** 商品指定生成（手動 / 複数商品対応） */
export async function generateProductArticle(
  apiKey: string,
  products: string[],
  genreName: string,
  customKeyword?: string
): Promise<GeneratedArticle> {
  const prompt = buildProductPrompt(products, genreName, customKeyword);
  const responseText = await callClaude(apiKey, prompt);
  const parsed = extractJSON(responseText);

  return {
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    htmlContent: parsed.htmlContent,
    keyword: customKeyword || products.join(" / "),
    themeLabel: "商品レビュー",
  };
}
