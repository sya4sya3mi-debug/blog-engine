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

export type TargetAge = "10s" | "20s" | "30s";

const CURRENT_YEAR = new Date().getFullYear();

// ----- ターゲット年代に応じたペルソナ＆文体指示 -----
function buildPersonaBlock(targetAge: TargetAge): string {
  switch (targetAge) {
    case "10s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性。10代の読者に向けて書く。
- 「私も10代の頃は〇〇で悩んでいました」「学生時代に使ってよかったのが〜」など、自分が10代だった頃の体験談をベースにした語り口にする。
- 過去形の体験談を織り交ぜながら、「今の10代の子にはこれを使ってほしい」というお姉さん的なアドバイストーンにする。
- 10代でも手が届く価格帯の商品を優先的に紹介する。
- 難しい専門用語は避け、親しみやすいカジュアルなですます調にする。
- ターゲット：10代女性（中高生〜大学生）`;

    case "20s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性。20代の読者に向けて書く。
- 「私が20代の頃は〇〇を使っていて」「当時はプチプラ中心だったけど、今振り返ると〜」など、20代だった頃の体験談をベースにした語り口にする。
- 「あの時これを知っていれば…」という後悔や発見を交えて、等身大のアドバイスにする。
- 20代の予算感（プチプラ〜ミドルレンジ）を意識した商品選びにする。
- 仕事・恋愛・結婚など20代ならではのライフイベントに絡めた悩みに共感する。
- 少し先輩の立場から語る、親近感のあるですます調にする。
- ターゲット：20代女性（社会人〜アラサー）`;

    case "30s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性。同世代の読者に向けて書く。
- 「今まさに私が使っているのが〜」「最近切り替えてみたら〜」など、現在進行形のリアルな使用感をベースにした語り口にする。
- 同世代の友達に話すような自然体のトーンで、「これ本当に良いよ！」という共感型のレビューにする。
- 品質重視・成分重視の商品選びを意識し、ミドル〜ハイレンジの商品も含める。
- エイジングケア・仕事と家庭の両立・時短など、30代のリアルな悩みに寄り添う。
- 等身大で信頼感のあるですます調にする。
- ターゲット：30代女性`;
  }
}

// ----- 自動生成用プロンプト（Cron / テーマローテーション） -----
function buildAutoPrompt(keyword: string, theme: SubTheme, genreName: string, targetAge: TargetAge): string {
  return `あなたはSEOに精通したアフィリエイトブログのプロライターです。
以下の条件で、WordPress投稿用の完全なHTML記事を作成してください。

【ブログ名】${genreName}
【カテゴリ】${theme.label}
【メインキーワード】${keyword}
【年度】${CURRENT_YEAR}年

${buildPersonaBlock(targetAge)}

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
- 筆者の体験談を自然に2〜3箇所織り交ぜる（上記ペルソナに沿って）
- 自然な日本語で、AIっぽさを排除した読みやすい文体にする`;
}

// ----- 商品指定生成用プロンプト（手動 / 複数商品対応） -----
function buildProductPrompt(products: string[], genreName: string, targetAge: TargetAge, customKeyword?: string): string {
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

${buildPersonaBlock(targetAge)}

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
- 筆者の体験談を自然に2〜3箇所織り交ぜる（上記ペルソナに沿って）
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
  genreName: string,
  targetAge: TargetAge = "30s"
): Promise<GeneratedArticle> {
  const prompt = buildAutoPrompt(keyword, theme, genreName, targetAge);
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
  targetAge: TargetAge = "30s",
  customKeyword?: string
): Promise<GeneratedArticle> {
  const prompt = buildProductPrompt(products, genreName, targetAge, customKeyword);
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
