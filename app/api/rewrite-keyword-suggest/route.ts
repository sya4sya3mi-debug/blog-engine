// ==========================================
// BlogEngine V2 - リライト用キーワード提案API
// 記事内容をSonnetで分析し、SEOキーワード候補を提案
// ==========================================

export const runtime = "nodejs";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const config = getConfig();
    const { postId } = await req.json();

    if (!postId) {
      return NextResponse.json({ error: "postId は必須です" }, { status: 400 });
    }

    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const post = await wp.getPost(postId);

    // HTMLタグを除去してテキストのみ取得
    const plainText = post.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);

    const prompt = `あなたはSEOの専門家です。以下の美容ブログ記事を分析し、SEO上効果的なキーワード候補を提案してください。

【記事タイトル】
${post.title}

【記事本文（抜粋）】
${plainText}

## 出力指示
以下のJSON形式のみで出力してください。他のテキストは不要です。

\`\`\`json
{
  "primaryKeyword": {
    "keyword": "主キーワード（1つ）",
    "searchVolume": "high/medium/low（推定）",
    "competition": "high/medium/low（推定）",
    "intent": "Know/Compare/Do/Trust",
    "reason": "この主キーワードを推奨する理由"
  },
  "secondaryKeywords": [
    {
      "keyword": "補助KW1",
      "role": "このKWをどの見出しや段落で使うべきか",
      "intent": "Know/Compare/Do/Trust"
    },
    {
      "keyword": "補助KW2",
      "role": "使用場所",
      "intent": "Know"
    },
    {
      "keyword": "補助KW3",
      "role": "使用場所",
      "intent": "Compare"
    },
    {
      "keyword": "補助KW4",
      "role": "使用場所",
      "intent": "Do"
    },
    {
      "keyword": "補助KW5",
      "role": "使用場所",
      "intent": "Trust"
    }
  ],
  "lsiKeywords": ["共起語1", "共起語2", "共起語3", "共起語4", "共起語5", "共起語6"],
  "titleSuggestions": [
    "SEO最適化タイトル案1（主KW前半）",
    "SEO最適化タイトル案2（数字入り）",
    "SEO最適化タイトル案3（読者便益型）"
  ],
  "contentGaps": [
    "競合上位記事にありそうで、この記事に不足している可能性のあるトピック1",
    "不足トピック2",
    "不足トピック3"
  ],
  "searchIntent": "この記事の主な検索意図（1〜2文で説明）"
}
\`\`\``;

    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "";

    // JSONを抽出
    const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeMatch ? codeMatch[1].trim() : rawText;
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    const jsonText = firstBrace >= 0 && lastBrace > firstBrace
      ? jsonStr.slice(firstBrace, lastBrace + 1)
      : jsonStr;

    const data = JSON.parse(jsonText);
    return NextResponse.json({ success: true, suggestions: data });
  } catch (e: any) {
    console.error("[keyword-suggest]", e);
    return NextResponse.json({ error: `キーワード提案エラー: ${e.message}` }, { status: 500 });
  }
}
