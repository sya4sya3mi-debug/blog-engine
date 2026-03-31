// ==========================================
// BlogEngine V2 - Fact-Check & Improvement Engine
// 生成記事をレビュアー視点でファクトチェック＆改良
// ==========================================

import Anthropic from "@anthropic-ai/sdk";
import { autoFixCompliance } from "./compliance";

// ----- インターフェース定義 -----

export interface FactCheckInput {
  title: string;
  htmlContent: string;
  metaDescription: string;
  keyword: string;
  tags: string[];
  themeLabel: string;
}

export interface FactCheckChange {
  type: "factual" | "compliance" | "readability" | "logic" | "seo";
  severity: "high" | "medium" | "low";
  original: string;
  improved: string;
  reason: string;
}

export interface FactCheckReport {
  overallScore: number;
  changes: FactCheckChange[];
  complianceIssues: string[];
  summary: string;
}

export interface FactCheckResult {
  success: boolean;
  original: FactCheckInput;
  improved: FactCheckInput;
  report: FactCheckReport;
  error?: string;
}

// ----- レビュー専用システムプロンプト -----

const REVIEW_SYSTEM_PROMPT = `あなたは日本の美容・健康コンテンツ専門のファクトチェッカー兼エディターです。
与えられたブログ記事をレビューし、以下の観点で改善してください。

## レビュー観点

### 1. 事実確認
- 成分の効果・効能に関する記述が科学的に正確か
- 医学的・美容学的な主張に誤りがないか
- 数値（価格、期間、割合など）が妥当か
- 引用・参照が正確か

### 2. 薬機法・景表法・ステマ規制の準拠チェック
- 化粧品の効能を逸脱する表現がないか（「シミが消える」「シワが治る」等）
- 医薬品的な効能効果の断定がないか（「確実に改善」「必ず治る」等）
- 最大級表現がないか（「最強」「日本一」「業界No.1」等）
- 根拠なき効果保証がないか（「誰でも簡単に」等）
- 体験談の後に「※ 効果には個人差があります」があるか
- PR表記が冒頭にあるか

### 3. 読みやすさ・文章品質
- 文章の流れが自然か
- 冗長な表現がないか
- 読者にとって分かりやすい説明になっているか
- 接続詞の使い方が適切か

### 4. 論理の一貫性
- 記事全体で主張が矛盾していないか
- 見出しと本文の内容が一致しているか
- 結論が前提から適切に導かれているか

### 5. SEOメタ情報
- メタディスクリプションがキーワードを含み、適切な長さか
- タイトルが検索意図に合っているか

## 絶対に守るルール
- **アフィリエイトリンク（rel="nofollow sponsored" を含む<a>タグ）は一切変更しないこと**
- **affiliate-linkクラスを持つ要素は一切変更しないこと**
- **HTML構造（タグの入れ子、クラス名、スタイル属性）は可能な限り保持すること**
- **吹き出しHTML（<!-- wp:html --> で囲まれた部分）は構造を変更しないこと**
- **商品の推薦順位や商品選定は変更しないこと**
- **PR表記（pr-notice）は削除しないこと**
- **構造化データ（JSON-LD script タグ）は変更しないこと**
- 改善は最小限かつ的確に行い、元の文体・トーンを大きく変えないこと

## 出力形式
以下のJSON形式で出力してください。他のテキストは含めないでください。

{
  "title": "改善後のタイトル",
  "htmlContent": "改善後のHTML本文",
  "metaDescription": "改善後のメタディスクリプション",
  "tags": ["改善後のタグ配列"],
  "report": {
    "overallScore": 85,
    "changes": [
      {
        "type": "factual|compliance|readability|logic|seo",
        "severity": "high|medium|low",
        "original": "変更前のテキスト（短い抜粋）",
        "improved": "変更後のテキスト（短い抜粋）",
        "reason": "変更理由（日本語）"
      }
    ],
    "complianceIssues": ["発見されたコンプライアンス問題の一覧"],
    "summary": "レビューの要約（日本語、2-3文）"
  }
}`;

// ----- メイン関数 -----

export async function factCheckArticle(
  anthropicApiKey: string,
  article: FactCheckInput,
): Promise<FactCheckResult> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const tags = Array.isArray(article.tags) ? article.tags : [];
  const userPrompt = `以下のブログ記事をレビューしてください。

## 記事情報
- キーワード: ${article.keyword || ""}
- テーマ: ${article.themeLabel || ""}
- タグ: ${tags.join(", ")}

## タイトル
${article.title || ""}

## メタディスクリプション
${article.metaDescription || ""}

## 本文HTML
${article.htmlContent || ""}`;

  try {
    // ストリーミングで受信（Vercel Hobby の関数タイムアウト対策）
    const stream = client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8096,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
      }
    }

    if (!text) {
      return {
        success: false,
        original: article,
        improved: article,
        report: { overallScore: 0, changes: [], complianceIssues: [], summary: "" },
        error: "Claude APIから空のレスポンスが返されました",
      };
    }

    // JSON部分を抽出（```json ... ``` で囲まれている場合に対応）
    let jsonText = text;
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    } else {
      // 先頭/末尾の非JSONテキストを除去
      const firstBrace = text.indexOf("{");
      const lastBrace = text.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = text.slice(firstBrace, lastBrace + 1);
      }
    }

    const parsed = JSON.parse(jsonText);

    // 改善後のHTMLに対してコンプライアンス自動修正を再実行（安全ネット）
    const improvedHtml = parsed.htmlContent || parsed.html_content || article.htmlContent;
    if (!improvedHtml || typeof improvedHtml !== "string") {
      return {
        success: false,
        original: article,
        improved: article,
        report: { overallScore: 0, changes: [], complianceIssues: [], summary: "" },
        error: "レビュー結果のHTMLが取得できませんでした",
      };
    }
    const { html: safeHtml } = autoFixCompliance(improvedHtml);

    // アフィリエイトリンクの保護チェック
    const originalAffLinks = extractAffiliateLinks(article.htmlContent);
    const improvedAffLinks = extractAffiliateLinks(safeHtml);
    let finalHtml = safeHtml;

    // アフィリエイトリンクが失われていたら元のHTMLを使用
    if (originalAffLinks.length > 0 && improvedAffLinks.length < originalAffLinks.length) {
      console.warn("[FactCheck] アフィリエイトリンクが失われたため、元のHTMLを使用します");
      finalHtml = article.htmlContent;
    }

    const improved: FactCheckInput = {
      title: parsed.title || article.title,
      htmlContent: finalHtml,
      metaDescription: parsed.metaDescription || parsed.meta_description || article.metaDescription,
      keyword: article.keyword,
      tags: Array.isArray(parsed.tags) ? parsed.tags : article.tags,
      themeLabel: article.themeLabel,
    };

    const report: FactCheckReport = {
      overallScore: parsed.report?.overallScore ?? 80,
      changes: (parsed.report?.changes || []).map((c: any) => ({
        type: c.type || "readability",
        severity: c.severity || "low",
        original: c.original || "",
        improved: c.improved || "",
        reason: c.reason || "",
      })),
      complianceIssues: parsed.report?.complianceIssues || [],
      summary: parsed.report?.summary || "",
    };

    return {
      success: true,
      original: article,
      improved,
      report,
    };
  } catch (error: any) {
    console.error("[FactCheck] Error:", error.message);
    return {
      success: false,
      original: article,
      improved: article,
      report: { overallScore: 0, changes: [], complianceIssues: [], summary: "" },
      error: error.message,
    };
  }
}

// ----- ヘルパー -----

/** rel="nofollow sponsored" を含むリンクのhrefを抽出 */
function extractAffiliateLinks(html: string | undefined | null): string[] {
  if (!html) return [];
  const regex = /<a\s+[^>]*rel="[^"]*nofollow[^"]*sponsored[^"]*"[^>]*href="([^"]*)"[^>]*>/g;
  const regex2 = /<a\s+[^>]*href="([^"]*)"[^>]*rel="[^"]*nofollow[^"]*sponsored[^"]*"[^>]*>/g;
  const links: string[] = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    links.push(match[1]);
  }
  while ((match = regex2.exec(html)) !== null) {
    if (!links.includes(match[1])) {
      links.push(match[1]);
    }
  }
  return links;
}
