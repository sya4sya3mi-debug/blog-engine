// ==========================================
// BlogEngine V2 - Cron Endpoint
// 毎日1回実行（UTC 0:00 = JST 9:00）→ 記事生成＆WP投稿
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig, ALL_GENRES, getTodaysTheme } from "@/lib/config";
import { generateArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";

export const maxDuration = 60; // Vercel function timeout

export async function GET(req: NextRequest) {
  // Vercel Cron認証
  const authHeader = req.headers.get("authorization");
  const config = getConfig();

  if (authHeader !== `Bearer ${config.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 今日の日付（JST）
  const now = new Date();
  const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = jstDate.toISOString().split("T")[0];

  // アクティブジャンルを取得
  const genre = ALL_GENRES.find((g) => g.id === config.activeGenre);
  if (!genre) {
    return NextResponse.json({ error: `ジャンル '${config.activeGenre}' が見つかりません` }, { status: 400 });
  }

  // 今日のテーマ＆キーワードを決定（日付ベースの決定論的ローテーション）
  const { theme, keyword } = getTodaysTheme(genre, dateStr);

  try {
    // 1. Claude APIで記事生成
    const article = await generateArticle(config.anthropicApiKey, keyword, theme, genre.name);

    // 2. WordPress に投稿
    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);

    const categoryId = await wp.findOrCreateCategory(theme.label, theme.id);

    const post = await wp.createPost({
      title: article.title,
      content: article.htmlContent,
      status: config.wpDefaultStatus,
      categories: [categoryId],
      meta: {
        _seo_description: article.metaDescription,
      },
    });

    return NextResponse.json({
      status: "success",
      date: dateStr,
      theme: theme.label,
      keyword,
      article: {
        title: article.title,
        wpPostId: post.id,
        wpStatus: post.status,
        wpLink: post.link,
      },
    });
  } catch (error: any) {
    console.error("Cron execution error:", error);
    return NextResponse.json(
      { status: "error", message: error.message, date: dateStr, theme: theme.label, keyword },
      { status: 500 }
    );
  }
}
