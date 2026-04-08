// ==========================================
// 既存記事の吹き出しHTMLを新デザインに更新
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

// 吹き出しブロックの開始マーカーと終了を見つけて抽出する
function extractBalloons(html: string): { start: number; end: number; comment: string }[] {
  const results: { start: number; end: number; comment: string }[] = [];
  // flex-start / center どちらも検出
  const markers = ['display:flex;align-items:flex-start', 'display:flex;align-items:center'];
  let searchFrom = 0;

  while (true) {
    // 両方のマーカーで検索し、先に見つかった方を使う
    let idx = -1;
    for (const m of markers) {
      const found = html.indexOf(m, searchFrom);
      if (found !== -1 && (idx === -1 || found < idx)) idx = found;
    }
    if (idx === -1) break;

    const divStart = html.lastIndexOf('<div', idx);
    if (divStart === -1) { searchFrom = idx + 50; continue; }

    // background:#f8f8f8 or #FFF9E5 が近くにあるか
    const checkRange = html.substring(idx, Math.min(html.length, idx + 1500));
    if (!checkRange.includes('background:#f8f8f8') && !checkRange.includes('background:#FFF9E5')) {
      searchFrom = idx + 50;
      continue;
    }

    // divのネストを追跡して最外部の閉じタグを見つける
    let depth = 1; // 最初の<divを含めて1から開始
    let pos = divStart + 4; // '<div' の直後から検索
    let blockEnd = -1;
    while (pos < html.length) {
      const nextOpen = html.indexOf('<div', pos);
      const nextClose = html.indexOf('</div>', pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          blockEnd = nextClose + 6;
          break;
        }
        pos = nextClose + 6;
      }
    }

    if (blockEnd === -1) { searchFrom = idx + 50; continue; }

    const block = html.substring(divStart, blockEnd);

    // コメントテキスト抽出: 最後のborder-right三角矢印の</div>後のテキスト
    const lastArrowIdx = block.lastIndexOf('border-right:');
    let comment = "";
    if (lastArrowIdx !== -1) {
      const afterArrow = block.substring(lastArrowIdx);
      const closeDivIdx = afterArrow.indexOf('</div>');
      if (closeDivIdx !== -1) {
        let textPart = afterArrow.substring(closeDivIdx + 6);
        // 残りの</div>タグを除去してコメントテキストを取得
        textPart = textPart.replace(/<\/div>/g, "").trim();
        comment = textPart.replace(/<\/?p>/g, "").replace(/<br\s*\/?>/g, "").trim();
      }
    }

    // <!-- wp:html --> で囲まれていればその範囲も含める
    let actualStart = divStart;
    let actualEnd = blockEnd;
    const before = html.substring(Math.max(0, divStart - 30), divStart);
    if (before.includes('<!-- wp:html -->')) {
      actualStart = html.lastIndexOf('<!-- wp:html -->', divStart);
    }
    const after = html.substring(blockEnd, Math.min(html.length, blockEnd + 30));
    if (after.includes('<!-- /wp:html -->')) {
      actualEnd = html.indexOf('<!-- /wp:html -->', blockEnd) + '<!-- /wp:html -->'.length;
    }

    results.push({ start: actualStart, end: actualEnd, comment: comment || "（コメント）" });
    searchFrom = actualEnd;
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const config = getConfig();
    const { postId, postType, authorIconUrl, authorName } = await req.json();
    const endpoint = postType === "page" ? "pages" : "posts";

    if (!postId) {
      return NextResponse.json({ error: "postIdが必要です" }, { status: 400 });
    }

    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);

    let resolvedAuthorIconUrl: string | undefined = authorIconUrl || undefined;
    let resolvedAuthorName: string | undefined = authorName || undefined;
    if (!resolvedAuthorIconUrl || !resolvedAuthorName) {
      try {
        const profile = await wp.getAuthorProfile();
        resolvedAuthorIconUrl = resolvedAuthorIconUrl || profile.avatarUrl || undefined;
        resolvedAuthorName = resolvedAuthorName || profile.name || undefined;
      } catch {
        // ignore and keep defaults
      }
    }

    const name = resolvedAuthorName || "みお";

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

    // アイコンHTML
    const iconHtml = resolvedAuthorIconUrl
      ? `<img src="${resolvedAuthorIconUrl}" alt="${name}" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:2px solid #FFE066;object-fit:cover;display:block" />`
      : `<div style="width:60px;height:60px;border-radius:50%;background:#FFE066;display:flex;align-items:center;justify-content:center;font-size:24px">👩</div>`;

    // 吹き出しブロックを検出
    const balloons = extractBalloons(content);
    if (balloons.length === 0) {
      // デバッグ: 吹き出しマーカーの有無を確認
      const idx = content.indexOf('display:flex;align-items:flex-start');
      const bgIdx = content.indexOf('background:#f8f8f8');
      const sample = idx >= 0 ? content.substring(Math.max(0, idx - 20), idx + 200) : "";
      return NextResponse.json({
        error: "吹き出しが見つかりませんでした",
        matchCount: 0,
        debug: { contentLength: content.length, flexStartAt: idx, bgAt: bgIdx, sample },
      }, { status: 404 });
    }

    // 後ろから置換（インデックスがずれないように）
    for (let i = balloons.length - 1; i >= 0; i--) {
      const b = balloons[i];
      const cleanComment = b.comment.replace(/<\/?p>/g, "").replace(/<\/?span[^>]*>/g, "").replace(/\n/g, "").trim();
      // <!-- wp:html --> で囲むことでwpautopを無効化（GutenbergカスタムHTMLブロック）
      const newBalloon = `<!-- wp:html -->
<div style="display:flex;align-items:flex-start;gap:14px;margin:20px 0;padding:0;clear:both"><div style="flex-shrink:0;width:68px;text-align:center">${iconHtml}<div style="font-size:11px;color:#888;margin-top:1px;font-family:'Kosugi Maru',sans-serif">${name}</div></div><div style="position:relative;background:#FFF9E5;border:2px solid #FFE066;border-radius:16px;padding:10px 16px;flex:1;max-width:calc(100% - 82px);margin-top:12px;font-family:'Kosugi Maru',sans-serif;font-size:15px;line-height:1.6;color:#333;box-sizing:border-box"><div style="position:absolute;left:-10px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFE066"></div><div style="position:absolute;left:-7px;top:16px;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:10px solid #FFF9E5"></div>${cleanComment}</div></div>
<!-- /wp:html -->`;
      content = content.substring(0, b.start) + newBalloon + content.substring(b.end);
    }

    // Google Fonts読み込みタグがなければ先頭に追加
    if (!content.includes("Kosugi+Maru") && !content.includes("Kosugi Maru")) {
      content = `<link href="https://fonts.googleapis.com/css2?family=Kosugi+Maru&display=swap" rel="stylesheet">\n` + content;
    }

    // WordPress記事を更新（投稿・固定ページ両対応）
    const updateRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/${endpoint}/${postId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64"),
      },
      body: JSON.stringify({ content }),
    });
    if (!updateRes.ok) throw new Error(`更新失敗 (${updateRes.status})`);

    return NextResponse.json({
      success: true,
      updatedCount: balloons.length,
      message: `${balloons.length}箇所の吹き出しを更新しました`,
    });
  } catch (e: any) {
    console.error("[Update Balloons] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
