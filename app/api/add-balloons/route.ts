// ==========================================
// 既存記事にAI生成の吹き出しコメントを追加
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: NextRequest) {
  try {
    const config = getConfig();
    const { postId, postType, authorIconUrl, authorName } = await req.json();

    if (!postId) {
      return NextResponse.json({ error: "postIdが必要です" }, { status: 400 });
    }

    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const name = authorName || "みお";
    const endpoint = postType === "page" ? "pages" : "posts";

    // 記事のraw contentを取得
    const res = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}?context=edit`, {
      headers: {
        Authorization: "Basic " + Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64"),
      },
    });
    if (!res.ok) throw new Error(`記事取得失敗 (${res.status})`);
    const post = await res.json();
    let content: string = post.content.raw;
    if (!content) {
      const pubRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}?_fields=content`);
      const pubPost = await pubRes.json();
      content = pubPost.content.rendered;
    }

    // H2見出しとその後のテキストを抽出
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/g;
    const sections: { heading: string; position: number }[] = [];
    let match;
    while ((match = h2Regex.exec(content)) !== null) {
      const heading = match[1].replace(/<[^>]+>/g, "").trim();
      // 目次・用語集はスキップ
      if (heading === "目次" || heading === "用語集") continue;
      sections.push({ heading, position: match.index + match[0].length });
    }

    if (sections.length === 0) {
      return NextResponse.json({ error: "H2見出しが見つかりませんでした" }, { status: 404 });
    }

    // Claude AIで各セクションの吹き出しコメントを生成
    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const sectionList = sections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");

    const aiRes = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `あなたは美容ブログ「みおのミハダノート」の筆者みお（30代女性）です。
以下の記事セクション見出しに対して、それぞれ1つずつ筆者の一言コメントを作成してください。

セクション一覧：
${sectionList}

ルール：
- 各コメントは40-80文字程度
- 実体験や感想、読者への親しみのあるアドバイス
- 「！」を適度に使い、明るく親しみやすいトーン
- 専門的すぎない、友達に話すような口調
- 「私も〜」「意外と〜」「ここ大事！」のような語りかけ

JSON配列で出力してください（他のテキスト不要）：
[{"index": 1, "comment": "コメント内容"}, ...]`
      }],
    });

    const aiText = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AIコメント生成に失敗しました");
    const comments: { index: number; comment: string }[] = JSON.parse(jsonMatch[0]);

    // アイコンHTML
    const iconHtml = authorIconUrl
      ? `<img src="${authorIconUrl}" alt="${name}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:2px solid #FFE066;object-fit:cover;display:block" />`
      : `<div style="width:60px;height:60px;border-radius:50%;background:#FFE066;display:flex;align-items:center;justify-content:center;font-size:24px">👩</div>`;

    // 後ろから挿入（インデックスがずれないように）
    let insertCount = 0;
    for (let i = sections.length - 1; i >= 0; i--) {
      const section = sections[i];
      const commentObj = comments.find(c => c.index === i + 1);
      if (!commentObj) continue;

      const balloonHtml = `\n<!-- wp:html -->\n<div style="display:flex;align-items:flex-start;gap:14px;margin:20px 0;padding:0;clear:both"><div style="flex-shrink:0;width:68px;text-align:center">${iconHtml}<div style="font-size:11px;color:#888;margin-top:1px;font-family:'Kosugi Maru',sans-serif">${name}</div></div><div style="position:relative;background:#FFF9E5;border:2px solid #FFE066;border-radius:16px;padding:10px 16px;flex:1;max-width:calc(100% - 82px);font-family:'Kosugi Maru',sans-serif;font-size:15px;line-height:1.6;color:#333;box-sizing:border-box;margin-top:12px"><div style="position:absolute;left:-10px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFE066"></div><div style="position:absolute;left:-7px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFF9E5"></div>${commentObj.comment}</div></div>\n<!-- /wp:html -->\n`;

      // H2の直後（次の段落の後）に挿入
      // H2の後の最初の</p>を見つけてその後に挿入
      const afterH2 = content.substring(section.position);
      const firstParaEnd = afterH2.indexOf('</p>');
      if (firstParaEnd !== -1) {
        const insertPos = section.position + firstParaEnd + 4;
        content = content.substring(0, insertPos) + balloonHtml + content.substring(insertPos);
      } else {
        // </p>が見つからない場合はH2直後に挿入
        content = content.substring(0, section.position) + balloonHtml + content.substring(section.position);
      }
      insertCount++;
    }

    // Google Fonts読み込みタグ
    if (!content.includes("Kosugi+Maru") && !content.includes("Kosugi Maru")) {
      content = `<!-- wp:html -->\n<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap" rel="stylesheet">\n<!-- /wp:html -->\n` + content;
    }

    // WordPress記事を更新（固定ページ対応）
    const updateUrl = `${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}`;
    const updateRes = await fetch(updateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64"),
      },
      body: JSON.stringify({ content }),
    });
    if (!updateRes.ok) throw new Error(`記事更新失敗 (${updateRes.status})`);

    return NextResponse.json({
      success: true,
      insertCount,
      comments: comments.map(c => ({ section: sections[c.index - 1]?.heading, comment: c.comment })),
    });
  } catch (e: any) {
    console.error("[Add Balloons] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
