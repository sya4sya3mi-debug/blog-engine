// ==========================================
// BlogEngine V2 - Cron Endpoint
// 毎日1回実行（UTC 0:00 = JST 9:00）→ 記事生成＆WP投稿
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig, ALL_GENRES, getTodaysTheme, getTodaysTargetAge } from "@/lib/config";
import { generateArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";
import { replaceAffiliatePlaceholders, getCronAffiliateLinks } from "@/lib/affiliate";

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

  // 今日のテーマ＆キーワード＆ターゲット年代を決定（日付ベースの決定論的ローテーション）
  const { theme, keyword } = getTodaysTheme(genre, dateStr);
  const targetAge = getTodaysTargetAge(dateStr);

  try {
    // 1. Claude APIで記事生成（ターゲット年代に応じた文体で）
    const article = await generateArticle(config.anthropicApiKey, keyword, theme, genre.name, targetAge);

    // 1.5. アフィリエイトリンク自動置換
    const cronLinks = getCronAffiliateLinks(theme.id);
    if (cronLinks.length > 0) {
      article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, cronLinks);
    }

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
      targetAge,
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
