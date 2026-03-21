// ==========================================
// BlogEngine V2 - Manual Generate Endpoint
// ダッシュボードからの手動記事生成（テーマ指定 or 商品指定）
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig, ALL_GENRES } from "@/lib/config";
import { generateArticle, generateProductArticle, TargetAge } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";
import { AffiliateLink, replaceAffiliatePlaceholders } from "@/lib/affiliate";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();

  // mode: "theme"（テーマ指定）or "product"（商品指定）
  const { mode, themeId, keyword, products, customKeyword, postToWP, targetAge, affiliateLinks } = body as {
    mode: "theme" | "product";
    themeId?: string;
    keyword?: string;
    products?: string[];
    customKeyword?: string;
    postToWP?: boolean;
    targetAge?: TargetAge;
    affiliateLinks?: AffiliateLink[];
  };

  const age: TargetAge = targetAge || "30s";

  const genre = ALL_GENRES.find((g) => g.id === config.activeGenre);
  if (!genre) {
    return NextResponse.json({ error: "ジャンルが見つかりません" }, { status: 400 });
  }

  try {
    let article;

    if (mode === "product") {
      // 商品指定モード
      if (!products || products.length === 0) {
        return NextResponse.json({ error: "商品名を1つ以上指定してください" }, { status: 400 });
      }
      article = await generateProductArticle(config.anthropicApiKey, products, genre.name, age, customKeyword);
    } else {
      // テーマ指定モード
      const theme = themeId
        ? genre.subThemes.find((t) => t.id === themeId)
        : genre.subThemes[0];
      if (!theme) {
        return NextResponse.json({ error: "テーマが見つかりません" }, { status: 400 });
      }
      const kw = keyword || theme.keywords[0];
      article = await generateArticle(config.anthropicApiKey, kw, theme, genre.name, age);
    }

    // アフィリエイトリンク自動置換
    if (affiliateLinks && affiliateLinks.length > 0) {
      article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, affiliateLinks);
    }

    let wpResult = null;

    // WordPress投稿（オプション）
    if (postToWP) {
      const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
      const post = await wp.createPost({
        title: article.title,
        content: article.htmlContent,
        status: config.wpDefaultStatus,
        meta: { _seo_description: article.metaDescription },
      });
      wpResult = { postId: post.id, status: post.status, link: post.link };
    }

    return NextResponse.json({
      status: "success",
      article: {
        title: article.title,
        metaDescription: article.metaDescription,
        htmlContent: article.htmlContent,
        keyword: article.keyword,
        themeLabel: article.themeLabel,
      },
      wordpress: wpResult,
    });
  } catch (error: any) {
    console.error("Generate error:", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
