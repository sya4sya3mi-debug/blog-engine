// ==========================================
// BlogEngine V2 - AI Article Generation Engine
// 薬機法・景表法・ステマ規制対応プロンプト設計
// ==========================================

import Anthropic from "@anthropic-ai/sdk";
import { SubTheme, TargetAge } from "./config";

export interface GeneratedArticle {
  title: string;
  metaDescription: string;
  htmlContent: string;
  keyword: string;
  themeLabel: string;
  slug: string;
  focusKeyword: string;
  tags: string[];
  faqSchema: { question: string; answer: string }[];
}

export type { TargetAge } from "./config";

const CURRENT_YEAR = new Date().getFullYear();

// ----- 法令遵守ブロック（全記事共通） -----
const COMPLIANCE_BLOCK = `
## 法令遵守ルール（必ず守ること）
以下に違反する表現は絶対に使わないでください：

### 薬機法
- 化粧品の効能を逸脱する表現（「シミが消える」「シワが治る」等）は禁止
- 医薬品的な効能効果の断定は禁止（「確実に改善」「必ず治る」等）
- 「最強」「日本一」等の最大級表現は禁止
- 医師推薦を装う表現は禁止

### 景表法（優良誤認・有利誤認）
- 根拠なき効果保証（「誰でも簡単に」「短期間で必ず」等）は禁止
- Before/Afterで効果を保証する表現は禁止
- 比較記事では条件・根拠を明示し、一方的に優劣をつけない

### ステマ規制
- 記事はアフィリエイト広告を含むことを前提に書く
- 誠実で公平な情報提供を心がける

### 代替表現ガイド
- 「治る」→「ケアをサポート」「整える」
- 「効果がある」→「〇〇が期待できる」「〇〇にアプローチ」
- 「おすすめNo.1」→「〇〇な方に向いている」
- 「医師も推薦」→「皮膚科でも使われている成分」
- 料金・回数は「目安」「一般的には」と但し書きを付ける
`;

// ----- ターゲット年代に応じたペルソナ＆文体指示 -----
function buildPersonaBlock(targetAge: TargetAge): string {
  switch (targetAge) {
    case "20s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。20代後半の読者に向けて書く。
- 「私が20代の頃は〇〇を使っていて」「当時はプチプラ中心だったけど、今振り返ると〜」など、20代だった頃の体験談をベースにした語り口にする。
- 「あの時これを知っていれば…」という後悔や発見を交えて、等身大のアドバイスにする。
- 20代の予算感（プチプラ〜ミドルレンジ）を意識した商品選びにする。
- 仕事・恋愛・結婚準備など20代ならではのライフイベントに絡めた悩みに共感する。
- 少し先輩の立場から語る、親近感のあるですます調にする。
- ターゲット：20代後半女性（社会人〜アラサー）`;

    case "30s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。同世代の読者に向けて書く。
- 「今まさに私が使っているのが〜」「最近切り替えてみたら〜」など、現在進行形のリアルな使用感をベースにした語り口にする。
- 同世代の友達に話すような自然体のトーンで、「これ本当に良いよ！」という共感型のレビューにする。
- 品質重視・成分重視の商品選びを意識し、ミドル〜ハイレンジの商品も含める。
- エイジングケア・仕事と家庭の両立・時短など、30代のリアルな悩みに寄り添う。
- 等身大で信頼感のあるですます調にする。
- ターゲット：30代女性`;

    case "40s":
      return `## 筆者ペルソナ＆文体
- 筆者は30代女性の美容ブロガー。40代前半の読者に向けて書く。
- 「30代後半から変化を感じ始めて」「最近40代の先輩にすすめられて」など、年齢の変化に向き合う姿勢で書く。
- エイジングサインへの"本気のケア"を求める読者に応える、信頼感ある文体にする。
- 投資価値のある商品・施術を、根拠（成分・技術・臨床データの有無）とともに紹介する。
- たるみ・シミ・肝斑・ほうれい線など、40代に顕在化しやすい悩みに具体的に触れる。
- 丁寧で落ち着いた、でも親しみのあるですます調にする。
- ターゲット：40代前半女性`;
  }
}

// ----- 記事タイプ別の構成指示 -----
function buildArticleTypeBlock(articleType: string): string {
  switch (articleType) {
    case "comparison":
      return `## 記事タイプ：比較・選び方ガイド
- 導入文で「何を基準に選べば失敗しないか」を提示
- 比較軸を3〜4つ明示（料金目安・回数目安・ダウンタイム・特徴など）
- <table>で比較一覧を作成（※料金は「目安」「一般的な相場」と明記）
- 各選択肢を<h3>で個別解説（メリット・注意点を公平に）
- まとめで「こんな方にはこれが向いている」という提案型CTAにする`;

    case "qa":
      return `## 記事タイプ：Q&A（悩み→結論→理由→注意点）
- 導入文で読者の具体的な悩み・疑問を提示
- 結論を先に述べる（PREP法）
- 理由・根拠を2〜3点示す
- 注意点・リスク・よくある誤解を必ず含める
- 「こんな場合は専門家に相談」という但し書きを適宜入れる`;

    case "howto":
      return `## 記事タイプ：ハウツー・選び方
- 導入文で「正しい選び方を知らないとこうなる」という問題提起
- ステップ形式または選び方のポイントを<h2>で構成
- 各ステップに具体例と注意点を含める
- 成分・技術の基礎知識を分かりやすく解説
- おすすめ商品は「条件別の提案」として紹介（ランキングの根拠が薄い形は避ける）`;

    case "guide":
    default:
      return `## 記事タイプ：完全ガイド（ピラー記事）
- 導入文でこのテーマの全体像を提示
- 原因・種類・治療法/ケア法を体系的に解説
- 費用の目安・期間・リスクを公平に記載
- よくある質問（FAQ）セクションを含める
- 関連テーマへの内部リンクを意識した構成にする
- 文字数は多めに（3000〜5000字目安）`;
  }
}

// ----- 自動生成用プロンプト -----
function buildAutoPrompt(keyword: string, theme: SubTheme, genreName: string, targetAge: TargetAge): string {
  return `あなたはSEOに精通した美容ブログのプロライターです。
以下の条件で、WordPress投稿用の完全なHTML記事を作成してください。

【ブログ名】${genreName}
【カテゴリ】${theme.label}
【メインキーワード】${keyword}
【年度】${CURRENT_YEAR}年

${buildPersonaBlock(targetAge)}

${buildArticleTypeBlock(theme.articleType)}

${COMPLIANCE_BLOCK}

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "title": "【${CURRENT_YEAR}年】〇〇を徹底比較",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "slug": "keyword-based-seo-slug-${CURRENT_YEAR}",
  "focusKeyword": "メインのSEOキーワード1つ",
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"],
  "faq": [
    {"question": "よくある質問1", "answer": "回答1"},
    {"question": "よくある質問2", "answer": "回答2"},
    {"question": "よくある質問3", "answer": "回答3"}
  ],
  "htmlContent": "HTML本文"
}
\`\`\`

## SEO最適化の要件
- slug: キーワードをローマ字/英語でハイフン区切りにする（例: iryou-datsumo-hikaku-${CURRENT_YEAR}）
- focusKeyword: 記事のメインキーワード1つ（タイトルとh2に含まれる語）
- tags: 記事に関連するSEOタグを3〜5個（サブキーワードやカテゴリ）
- faq: 記事末尾のFAQから3〜5問を抽出（Google FAQリッチスニペット用）

## htmlContent の要件
- HTML構造：<h2>大見出し / <h3>小見出し / <p>段落 / <table>比較表 / <ul><li>リスト
- 文字数：2000〜4000字程度
- 記事冒頭に「<p class="pr-notice">※ この記事にはアフィリエイト広告が含まれています</p>」を必ず含める
- CTA配置：結論直後 / 比較表直後 / FAQ末尾の3箇所に「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定】</p>」
- 記事末尾にFAQセクション（<h2>よくある質問</h2>）を必ず含め、<h3>で質問、<p>で回答を記述
- 筆者の体験談を自然に2〜3箇所織り交ぜる（上記ペルソナに沿って）
- 料金・回数は「目安」「一般的には」と但し書き必須
- 自然な日本語で、AIっぽさを排除した読みやすい文体`;
}

// ----- 商品指定生成用プロンプト -----
function buildProductPrompt(products: string[], genreName: string, targetAge: TargetAge, customKeyword?: string): string {
  const productList = products.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const keywordLine = customKeyword
    ? `【狙いたいキーワード】${customKeyword}`
    : `【キーワード】商品名から最適なSEOキーワードを自動決定してください`;

  return `あなたはSEOに精通した美容ブログのプロライターです。
以下の商品をフィーチャーした比較・レビュー記事を作成してください。

【ブログ名】${genreName}
${keywordLine}
【年度】${CURRENT_YEAR}年

【紹介する商品/サービス】
${productList}

${buildPersonaBlock(targetAge)}

${COMPLIANCE_BLOCK}

## 出力形式
以下のJSON形式で出力してください（他のテキストは一切不要）：

\`\`\`json
{
  "title": "【${CURRENT_YEAR}年】〇〇を徹底比較",
  "metaDescription": "120文字以内のSEOメタディスクリプション",
  "slug": "product-comparison-seo-slug-${CURRENT_YEAR}",
  "focusKeyword": "メインのSEOキーワード1つ",
  "tags": ["関連タグ1", "関連タグ2", "関連タグ3"],
  "faq": [
    {"question": "よくある質問1", "answer": "回答1"},
    {"question": "よくある質問2", "answer": "回答2"},
    {"question": "よくある質問3", "answer": "回答3"}
  ],
  "htmlContent": "HTML本文"
}
\`\`\`

## SEO最適化の要件
- slug: 商品名やキーワードをローマ字/英語でハイフン区切りにする
- focusKeyword: 記事のメインキーワード1つ（タイトルとh2に含まれる語）
- tags: 記事に関連するSEOタグを3〜5個（商品名、カテゴリ、特徴など）
- faq: 記事末尾のFAQから3〜5問を抽出（Google FAQリッチスニペット用）

## htmlContent の要件
- HTML構造：<h2>大見出し / <h3>小見出し / <p>段落 / <table>比較表 / <ul><li>リスト
- 文字数：2000〜4000字程度
- 記事冒頭に「<p class="pr-notice">※ この記事にはアフィリエイト広告が含まれています</p>」を必ず含める
- 比較表は価格帯（目安）・特徴・向いている人を含む
- 各商品を<h3>で個別レビュー（メリット・注意点を公平に）
- 各商品に「<p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：${"{商品名}"}】</p>」を含める
- 記事末尾にFAQセクション（<h2>よくある質問</h2>）を必ず含め、<h3>で質問、<p>で回答を記述
- まとめで「こんな方にはこの商品/サービス」という提案型にする
- 筆者の体験談を自然に2〜3箇所織り交ぜる
- 料金は「目安」「一般的には」と但し書き必須
- 自然な日本語で、AIっぽさを排除した読みやすい文体`;
}

interface ParsedArticle {
  title: string;
  metaDescription: string;
  htmlContent: string;
  slug?: string;
  focusKeyword?: string;
  tags?: string[];
  faq?: { question: string; answer: string }[];
}

function extractJSON(text: string): ParsedArticle {
  try {
    // ```json ... ``` ブロックから抽出
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    // { から始まるJSONを探す
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]);
    }
    return JSON.parse(text.trim());
  } catch (e) {
    throw new Error(`Claude APIのレスポンスをJSONとして解析できませんでした。レスポンス先頭: ${text.slice(0, 200)}`);
  }
}

async function callClaude(apiKey: string, prompt: string) {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!text) {
    throw new Error("Claude APIから空のレスポンスが返されました");
  }

  return text;
}

/** FAQ構造化データ（JSON-LD）を生成してHTMLに埋め込む */
function buildFaqSchema(faq: { question: string; answer: string }[]): string {
  if (!faq || faq.length === 0) return "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faq.map((item) => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer,
      },
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/** Article構造化データ（JSON-LD）を生成 */
function buildArticleSchema(title: string, description: string, keyword: string): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": title,
    "description": description,
    "keywords": keyword,
    "author": { "@type": "Person", "name": "美容トレンドノート編集部" },
    "publisher": { "@type": "Organization", "name": "美容トレンドノート" },
    "datePublished": new Date().toISOString().split("T")[0],
    "dateModified": new Date().toISOString().split("T")[0],
  };
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

/** パース結果からGeneratedArticleを組み立てる（構造化データ埋め込み） */
function buildGeneratedArticle(parsed: ParsedArticle, keyword: string, themeLabel: string): GeneratedArticle {
  const faq = parsed.faq || [];
  const focusKeyword = parsed.focusKeyword || keyword;

  // 構造化データをHTMLに埋め込む
  const schemaHtml = buildArticleSchema(parsed.title, parsed.metaDescription, focusKeyword) + buildFaqSchema(faq);
  const htmlContent = parsed.htmlContent + schemaHtml;

  return {
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    htmlContent,
    keyword,
    themeLabel,
    slug: parsed.slug || keyword.replace(/\s+/g, "-").toLowerCase(),
    focusKeyword,
    tags: parsed.tags || [],
    faqSchema: faq,
  };
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
  return buildGeneratedArticle(parsed, keyword, theme.label);
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
  return buildGeneratedArticle(parsed, customKeyword || products.join(" / "), "商品レビュー");
}
