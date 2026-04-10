// ==========================================
// BlogEngine V2 - 画像なし記事への画像生成・挿入
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";
import { generateEyecatchImage } from "@/lib/image-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET: featured_media が設定されていない公開記事を一覧取得（直近100件）
export async function GET() {
  try {
    const config = getConfig();
    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const recent = await wp.getRecentPosts(100);
    const posts = recent
      .filter((p) => p.status === "publish" && (!p.featured_media || p.featured_media === 0))
      .map((p) => ({
        id: p.id,
        title: p.title?.rendered || "",
      }));

    return NextResponse.json({ posts, total: posts.length });
  } catch (e: any) {
    console.error("[inject-images GET] error:", e.message);
    return NextResponse.json({ error: `取得エラー: ${e.message}` }, { status: 500 });
  }
}

// POST: 指定記事に画像を生成してアイキャッチとして設定
export async function POST(req: NextRequest) {
  try {
    const config = getConfig();

    if (!config.openaiApiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY未設定" }, { status: 400 });
    }

    const { postId, title, keyword, themeLabel } = await req.json();

    if (!postId || !title) {
      return NextResponse.json({ error: "postId と title は必須です" }, { status: 400 });
    }

    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);

    // 1. DALL-E 3 で画像生成
    const eyecatch = await generateEyecatchImage(
      config.openaiApiKey,
      title,
      keyword || "",
      themeLabel || ""
    );

    // 2. WordPress メディアライブラリにアップロード
    const media = await wp.uploadMediaFromUrl(
      eyecatch.imageUrl,
      `eyecatch-${postId}.jpg`,
      eyecatch.altText
    );

    // 3. 記事のアイキャッチに設定
    await wp.updatePost(postId, { featured_media: media.id });

    return NextResponse.json({
      success: true,
      postId,
      mediaId: media.id,
      imageUrl: media.url,
      altText: eyecatch.altText,
    });
  } catch (e: any) {
    console.error("[inject-images POST] error:", e.message);
    return NextResponse.json({ error: `画像挿入エラー: ${e.message}` }, { status: 500 });
  }
}
