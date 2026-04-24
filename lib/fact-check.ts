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
  topRisks?: string[];
  nextFixes?: string[];
}

export interface FactCheckResult {
  success: boolean;
  original: FactCheckInput;
  improved: FactCheckInput;
  report: FactCheckReport;
  error?: string;
}

export interface FactCheckAuditSummary {
  score: number;
  topRisks: string[];
  nextFixes: string[];
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
  "htmlContent": "改善後のHTML本文",
  "title": "改善後のタイトル",
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

function normalizeJsonCandidate(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/^```(?:[a-z0-9_-]+)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractBalancedJson(value: string): string | null {
  const start = value.search(/[{\[]/);
  if (start === -1) return null;

  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i += 1) {
    const ch = value[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }

    if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      if (stack[stack.length - 1] !== expected) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return value.slice(start, i + 1);
      }
    }
  }

  return null;
}

/** max_tokensで途中切断されたJSONを修復する */
function repairTruncatedJSON(json: string): string {
  let s = json.trim();
  // { を起点にする
  const braceStart = s.indexOf('{');
  if (braceStart === -1) return s;
  s = s.slice(braceStart);

  // 開いたままの文字列を閉じる
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === '"') { inString = false; }
    } else if (ch === '"') {
      inString = true;
      escaped = false;
    }
  }
  if (inString) s += '"';

  // 末尾のカンマを削除
  s = s.replace(/,\s*$/, '');

  // 開いている括弧を閉じる
  const stack: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (ch === '\\') { escaped = true; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; escaped = false; continue; }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }
  while (stack.length > 0) s += stack.pop();
  return s;
}

function collectJsonCandidates(value: string): string[] {
  const trimmed = value.replace(/^\uFEFF/, "").trim();
  const candidates: string[] = [];

  const push = (candidate?: string | null) => {
    if (!candidate) return;
    const normalized = normalizeJsonCandidate(candidate);
    if (!normalized || candidates.includes(normalized)) return;
    candidates.push(normalized);
  };

  const fencedBlockPattern = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fencedBlockPattern.exec(trimmed)) !== null) {
    if (/^[{\[]/.test(match[1].trim())) {
      push(match[1]);
    }
  }

  push(trimmed);
  push(extractBalancedJson(trimmed));

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    push(trimmed.slice(firstBracket, lastBracket + 1));
  }

  return candidates;
}

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
      model: "claude-haiku-4-5",
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

    const parsed = (() => {
      let result: any;
      let parseError: Error | null = null;
      for (const candidate of collectJsonCandidates(text)) {
        try {
          result = JSON.parse(candidate);
          break;
        } catch (error: any) {
          parseError = error;
        }
      }
      // 全候補が失敗した場合、切断されたJSONの修復を試みる
      if (!result || typeof result !== "object") {
        try {
          const repaired = repairTruncatedJSON(text);
          result = JSON.parse(repaired);
        } catch (error: any) {
          parseError = error;
        }
      }
      if (!result || typeof result !== "object") {
        throw new Error(
          `AIレビュー結果をJSONとして解析できませんでした: ${parseError?.message || "unknown error"} / response: ${text.slice(0, 200)}`,
        );
      }
      return result;
    })();

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
      topRisks: Array.isArray(parsed.report?.topRisks)
        ? parsed.report.topRisks.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
      nextFixes: Array.isArray(parsed.report?.nextFixes)
        ? parsed.report.nextFixes.filter((value: unknown): value is string => typeof value === "string" && value.trim().length > 0)
        : undefined,
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

export function buildAuditSummary(report: FactCheckReport): FactCheckAuditSummary {
  const inferredRisks = report.changes
    .filter((change) => change.severity === "high")
    .slice(0, 3)
    .map((change) => change.reason)
    .filter(Boolean);

  const topRisks = (report.topRisks && report.topRisks.length > 0
    ? report.topRisks
    : [...report.complianceIssues, ...inferredRisks]).slice(0, 3);

  const nextFixes = (report.nextFixes && report.nextFixes.length > 0
    ? report.nextFixes
    : report.changes
        .slice(0, 3)
        .map((change) => change.improved || change.reason)
        .filter(Boolean)
  ).slice(0, 3);

  return {
    score: report.overallScore,
    topRisks,
    nextFixes,
  };
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
