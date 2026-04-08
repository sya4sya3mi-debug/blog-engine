// ==========================================
// 既存記事の吹き出しを全削除→調査者視点で再生成
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const config = getConfig();
    const { postId, postType, authorIconUrl, authorName } = await req.json();
    if (!postId) return NextResponse.json({ error: "postIdが必要です" }, { status: 400 });

    const endpoint = postType === "page" ? "pages" : "posts";
    const authHeader = "Basic " + Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64");

    let resolvedAuthorIconUrl: string | undefined = authorIconUrl || undefined;
    let resolvedAuthorName: string | undefined = authorName || undefined;
    if (!resolvedAuthorIconUrl || !resolvedAuthorName) {
      try {
        const baseUrl = config.wpSiteUrl.replace(/\/+$/, "");
        const profileRes = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=edit`, {
          headers: { Authorization: authHeader },
        });
        if (profileRes.ok) {
          const user = (await profileRes.json()) as {
            name?: string;
            email?: string;
            avatar_urls?: Record<string, string>;
          };

          resolvedAuthorName = resolvedAuthorName || user.name || undefined;

          const email = (user.email || "").trim().toLowerCase();
          const computedGravatarUrl = email
            ? `https://secure.gravatar.com/avatar/${createHash("md5").update(email).digest("hex")}?s=96&d=mp&r=pg`
            : "";
          const wpAvatarUrl = user.avatar_urls?.["96"] || user.avatar_urls?.["48"] || "";
          resolvedAuthorIconUrl = resolvedAuthorIconUrl || computedGravatarUrl || wpAvatarUrl || undefined;
          if (resolvedAuthorIconUrl) resolvedAuthorIconUrl = resolvedAuthorIconUrl.replace(/^http:\/\//i, "https://");
        }
      } catch {
        // ignore and keep defaults
      }
    }

    const name = resolvedAuthorName || "みお";

    // 1. raw content取得
    const res = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}?context=edit`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) throw new Error(`記事取得失敗 (${res.status})`);
    const post = await res.json();
    let content: string = post.content.raw;
    if (!content) {
      const pubRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}?_fields=content`);
      content = (await pubRes.json()).content.rendered;
    }

    // 2. 既存の吹き出しを全削除（<!-- wp:html --> ブロック含む）
    // パターン: <!-- wp:html -->\n<div style="display:flex;align-items:...">...</div>\n<!-- /wp:html -->
    const wpHtmlBalloonRegex = /<!-- wp:html -->\s*\n?<div style="display:flex;align-items:(?:flex-start|center)[^"]*">[\s\S]*?<\/div><\/div>\s*\n?<!-- \/wp:html -->/g;
    const rawBalloonRegex = /<div style="display:flex;align-items:(?:flex-start|center)[^"]*">[\s\S]*?background:#(?:FFF9E5|f8f8f8)[\s\S]*?<\/div><\/div>/g;

    let removedCount = (content.match(wpHtmlBalloonRegex) || []).length + (content.match(rawBalloonRegex) || []).length;
    content = content.replace(wpHtmlBalloonRegex, "");
    content = content.replace(rawBalloonRegex, "");
    // Kosugi Maruのlinkタグも削除（再挿入するので）
    content = content.replace(/<!-- wp:html -->\s*\n?<link[^>]*Kosugi\+Maru[^>]*>\s*\n?<!-- \/wp:html -->\s*\n?/g, "");
    content = content.replace(/<link[^>]*Kosugi\+Maru[^>]*>\s*\n?/g, "");

    // 3. H2見出しを抽出
    const h2Regex = /<h2[^>]*>(.*?)<\/h2>/g;
    const sections: { heading: string; position: number }[] = [];
    let match;
    while ((match = h2Regex.exec(content)) !== null) {
      const heading = match[1].replace(/<[^>]+>/g, "").trim();
      if (heading === "目次" || heading === "用語集") continue;
      sections.push({ heading, position: match.index + match[0].length });
    }

    if (sections.length === 0) {
      // 吹き出し削除だけして返す
      const updateRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ content }),
      });
      return NextResponse.json({ success: true, removedCount, insertCount: 0 });
    }

    // 4. AIで調査者視点のコメントを生成（各H2に1つ、ただし連続しないよう1つ飛ばし）
    const targetSections = sections.filter((_, i) => {
      // 最初、最後、偶数番目のセクションに吹き出しを入れる（連続防止）
      if (i === 0 || i === sections.length - 1) return true;
      return i % 2 === 0;
    });

    const client = new Anthropic({ apiKey: config.anthropicApiKey });
    const sectionList = targetSections.map((s, i) => `${i + 1}. ${s.heading}`).join("\n");

    const aiRes = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `あなたは美容ブログ「みおのミハダノート」の筆者みお（30代女性）です。
以下の記事セクション見出しに対して、それぞれ1つずつ筆者の一言コメントを作成してください。

セクション一覧：
${sectionList}

【絶対ルール】
- あなたはこの商品を実際に使っていません。あくまで「気になって調べた」「口コミを見た」立場です
- 以下の表現は絶対に使わないこと：
  × 「実際に使って」「使ってみた」「使い始めて」「試して」「試した」
  × 「読者さんからよく聞かれる」「DMから質問」「よく質問される」
  × 「私も使って」「愛用して」
- 以下の表現を使うこと：
  ○ 「調べてみたら」「口コミを見て」「成分が気になって」「評判を調べたら」
  ○ 「気になるポイント」「ここは要チェック」「比較してみると」
  ○ 「口コミでも評価が高い」「SNSで話題」「成分表を見ると」

【トーン】
- 40-70文字程度
- 明るく親しみやすい口調
- 「！」を適度に使う

JSON配列で出力（他のテキスト不要）：
[{"index": 1, "comment": "コメント内容"}, ...]`
      }],
    });

    const aiText = aiRes.content[0].type === "text" ? aiRes.content[0].text : "";
    const jsonMatch = aiText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("AIコメント生成失敗");
    const comments: { index: number; comment: string }[] = JSON.parse(jsonMatch[0]);

    // 5. アイコンHTML
    const iconHtml = resolvedAuthorIconUrl
      ? `<img src="${resolvedAuthorIconUrl}" alt="${name}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:2px solid #FFE066;object-fit:cover;display:block" />`
      : `<div style="width:60px;height:60px;border-radius:50%;background:#FFE066;display:flex;align-items:center;justify-content:center;font-size:24px">👩</div>`;

    // 6. 後ろから挿入
    let insertCount = 0;
    for (let i = targetSections.length - 1; i >= 0; i--) {
      const section = targetSections[i];
      const commentObj = comments.find(c => c.index === i + 1);
      if (!commentObj) continue;

      const balloonHtml = `\n<!-- wp:html -->\n<div style="display:flex;align-items:flex-start;gap:14px;margin:20px 0;padding:0;clear:both"><div style="flex-shrink:0;width:68px;text-align:center">${iconHtml}<div style="font-size:11px;color:#888;margin-top:1px;font-family:'Kosugi Maru',sans-serif">${name}</div></div><div style="position:relative;background:#FFF9E5;border:2px solid #FFE066;border-radius:16px;padding:10px 16px;flex:1;max-width:calc(100% - 82px);font-family:'Kosugi Maru',sans-serif;font-size:15px;line-height:1.6;color:#333;box-sizing:border-box;margin-top:12px"><div style="position:absolute;left:-10px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFE066"></div><div style="position:absolute;left:-7px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFF9E5"></div>${commentObj.comment}</div></div>\n<!-- /wp:html -->\n`;

      const afterH2 = content.substring(section.position);
      const firstParaEnd = afterH2.indexOf('</p>');
      if (firstParaEnd !== -1) {
        const insertPos = section.position + firstParaEnd + 4;
        content = content.substring(0, insertPos) + balloonHtml + content.substring(insertPos);
      } else {
        content = content.substring(0, section.position) + balloonHtml + content.substring(section.position);
      }
      insertCount++;
    }

    // 7. フォント読み込みタグ追加
    if (!content.includes("Kosugi+Maru") && !content.includes("Kosugi Maru")) {
      content = `<!-- wp:html -->\n<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap" rel="stylesheet">\n<!-- /wp:html -->\n` + content;
    }

    // 8. WordPress更新
    const updateRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({ content }),
    });
    if (!updateRes.ok) throw new Error(`更新失敗 (${updateRes.status})`);

    return NextResponse.json({
      success: true,
      removedCount,
      insertCount,
      comments: comments.map(c => ({ section: targetSections[c.index - 1]?.heading, comment: c.comment })),
    });
  } catch (e: any) {
    console.error("[Fix Balloons] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
