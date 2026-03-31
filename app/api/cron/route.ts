// ==========================================
// BlogEngine V2 - Cron Endpoint
// 毎日1回実行（UTC 0:00 = JST 9:00）→ 記事生成＆WP投稿
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig, ALL_GENRES, getTodaysTheme, getTodaysTargetAge, SubTheme } from "@/lib/config";
import { generateArticle, injectEyecatchIntoArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";
import { replaceAffiliatePlaceholders, getCronAffiliateLinks } from "@/lib/affiliate";
import { factCheckArticle } from "@/lib/fact-check";
import { replaceInternalLinkPlaceholders } from "@/lib/internal-links";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";
import { runPostPublishSeo } from "@/lib/seo-tools";
import { generateEyecatchImage } from "@/lib/image-generator";
import { postArticleToX } from "@/lib/x-poster";

export const runtime = "edge"; // Edge Runtime（Hobby: 25秒 → ストリーミング延長可能）

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
  const dayOfMonth = jstDate.getDate();

  // 記事意図：日付ベースで交互に切り替え（奇数日=売る記事、偶数日=集める記事）
  const articleIntentParam = req.nextUrl.searchParams.get("type") as "uru" | "atsumeru" | "auto" | null;
  const articleIntent: "uru" | "atsumeru" =
    articleIntentParam === "uru" ? "uru" :
    articleIntentParam === "atsumeru" ? "atsumeru" :
    dayOfMonth % 2 === 1 ? "uru" : "atsumeru";

  // ボット判定回避：WordPressの予約投稿で公開時刻をランダム化（JST 9〜20時）
  // cron自体はUTC 0:00（JST 9:00）に実行されるが、記事の公開はランダム時刻に予約
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const randomHour = 9 + (Math.abs(hash) % 12);           // 9〜20時
  const randomMinute = Math.abs((hash >> 4)) % 60;         // 0〜59分
  // 予約公開時刻を計算（UTC）
  const scheduledJstDate = new Date(jstDate);
  scheduledJstDate.setHours(randomHour, randomMinute, 0, 0);
  const scheduledUtc = new Date(scheduledJstDate.getTime() - 9 * 60 * 60 * 1000);
  const scheduledIso = scheduledUtc.toISOString().replace(/\.\d{3}Z$/, ""); // WordPress形式: "2026-03-22T05:30:00"

  // アクティブジャンルを取得
  const genre = ALL_GENRES.find((g) => g.id === config.activeGenre);
  if (!genre) {
    return NextResponse.json({ error: `ジャンル '${config.activeGenre}' が見つかりません` }, { status: 400 });
  }

  // 記事意図に応じてテーマをフィルタリング
  const filteredThemes = genre.subThemes.filter((t: SubTheme) =>
    t.articleIntent === articleIntent
  );
  const effectiveGenre = filteredThemes.length > 0
    ? { ...genre, subThemes: filteredThemes }
    : genre; // フィルタ結果が空なら全テーマからローテーション

  // 今日のテーマ＆キーワード＆ターゲット年代を決定（日付ベースの決定論的ローテーション）
  // 重複チェック：既存のWP記事と被らないテーマ・キーワードを選ぶ
  const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
  let { theme, keyword } = getTodaysTheme(effectiveGenre, dateStr + `-${articleIntent}`);
  const targetAge = getTodaysTargetAge(dateStr);

  // 最大5回まで別のテーマ・キーワードを試す
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      // キーワードの主要部分でWP記事を検索（手動投稿も含む）
      const searchTerm = keyword.split(/\s+/).slice(0, 2).join(" ");
      const existingPosts = await wp.searchPosts(searchTerm, 3);

      // タイトルやスラッグに類似キーワードが含まれていないかチェック
      const isDuplicate = existingPosts.some((post) => {
        const postTitle = (post.title || "").toLowerCase();
        const postSlug = (post.slug || "").toLowerCase();
        const kwWords = keyword.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
        // キーワードの主要語が2つ以上タイトルに含まれていれば重複とみなす
        const matchCount = kwWords.filter((w) => postTitle.includes(w) || postSlug.includes(w)).length;
        return matchCount >= 2;
      });

      if (!isDuplicate) break; // 重複なし → このテーマで記事生成

      // 重複あり → 別のテーマ・キーワードを試す
      console.log(`[Cron] Duplicate detected for "${keyword}", trying next...`);
      attempts++;
      const alt = getTodaysTheme(effectiveGenre, dateStr + `-${articleIntent}-attempt${attempts}`);
      theme = alt.theme;
      keyword = alt.keyword;
    } catch (err) {
      console.error("[Cron] Duplicate check error:", err);
      break; // エラー時はそのまま進む
    }
  }

  if (attempts >= maxAttempts) {
    return NextResponse.json({
      skipped: true,
      reason: `${maxAttempts}回試しましたが、全てのテーマ・キーワードが既存記事と重複しています。新しいキーワードの追加を検討してください。`,
      date: dateStr,
    });
  }

  try {
    // 1. Claude APIで記事生成（ターゲット年代に応じた文体で）
    const article = await generateArticle(config.anthropicApiKey, keyword, theme, genre.name, targetAge);

    // 1.2. ファクトチェック＆改良（有効時のみ実行、失敗時はスキップ）
    if (config.factCheckEnabled) {
      try {
        const fcResult = await factCheckArticle(config.anthropicApiKey, {
          title: article.title,
          htmlContent: article.htmlContent,
          metaDescription: article.metaDescription,
          keyword: article.keyword || keyword,
          tags: article.tags,
          themeLabel: theme.label,
        });
        if (fcResult.success) {
          article.title = fcResult.improved.title;
          article.htmlContent = fcResult.improved.htmlContent;
          article.metaDescription = fcResult.improved.metaDescription;
          article.tags = fcResult.improved.tags;
          console.log(`[Cron FactCheck] ${fcResult.report.changes.length}件の改善を適用（スコア: ${fcResult.report.overallScore}/100）`);
        } else {
          console.warn("[Cron FactCheck] レビュー失敗（元の記事を使用）:", fcResult.error);
        }
      } catch (e: any) {
        console.warn("[Cron FactCheck] エラー（元の記事を使用）:", e.message);
      }
    }

    // 1.5. アフィリエイトリンク自動置換（提携先DB優先 → なければ楽天自動検索）
    let cronLinks = getCronAffiliateLinks(theme.id);
    if (cronLinks.length === 0) {
      const rakutenAppId = process.env.RAKUTEN_APP_ID;
      const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
      const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
      if (rakutenAppId && rakutenAffiliateId) {
        try {
          const rakutenProducts = await searchRakutenProducts(
            rakutenAppId, rakutenAffiliateId, keyword, 5, rakutenAccessKey,
            { themeId: theme.id, maxResults: 3, expandKeywords: true },
          );
          if (rakutenProducts.length > 0) {
            cronLinks = rakutenProducts.map((p) => ({
              themeId: theme.id,
              html: buildRakutenAffiliateHtml(p),
            }));
          }
        } catch (e: any) {
          console.warn("[Cron Rakuten] Search failed:", e.message);
        }
      }
    }
    if (cronLinks.length > 0) {
      article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, cronLinks);
    }

    // 2. WordPress に投稿（wpは上で既に作成済み）

    // 2.1. 内部リンクプレースホルダーを実際のリンクに置換
    try {
      const existingPosts = await wp.getRecentPosts(50);
      const postData = existingPosts.map((p) => ({
        slug: p.slug,
        link: p.link,
        title: p.title?.rendered || "",
      }));
      article.htmlContent = replaceInternalLinkPlaceholders(
        article.htmlContent,
        config.wpSiteUrl,
        postData,
      );
    } catch (e) {
      // 既存投稿の取得に失敗してもカテゴリURLフォールバックで続行
      console.warn("[InternalLinks] Failed to fetch existing posts, using category URL fallback:", e);
      article.htmlContent = replaceInternalLinkPlaceholders(article.htmlContent, config.wpSiteUrl);
    }

    const categoryId = await wp.findOrCreateCategory(theme.label, theme.id);

    // タグを自動作成
    const tagIds = article.tags.length > 0 ? await wp.findOrCreateTags(article.tags) : [];

    // 3. アイキャッチ画像生成 & WordPressアップロード
    let featuredMediaId: number | undefined;
    if (config.openaiApiKey) {
      try {
        const eyecatch = await generateEyecatchImage(
          config.openaiApiKey,
          article.title,
          keyword,
          theme.label,
        );
        const slugDate = dateStr.replace(/-/g, "");
        const media = await wp.uploadMediaFromUrl(
          eyecatch.imageUrl,
          `eyecatch-${article.slug}-${slugDate}.png`,
          eyecatch.altText,
        );
        featuredMediaId = media.id;
        // 画像URLを記事の構造化データ（Article JSON-LD）に反映
        injectEyecatchIntoArticle(article, media.url);
        console.log(`[Eyecatch] Generated and uploaded: mediaId=${media.id}`);
      } catch (e: any) {
        console.error("[Eyecatch] Failed (skipping):", e.message);
        // 画像生成失敗は無視して記事投稿を続行
      }
    }

    const post = await wp.createPost({
      title: article.title,
      content: article.htmlContent,
      slug: article.slug,
      status: "future",
      date: scheduledIso,
      categories: [categoryId],
      tags: tagIds,
      featured_media: featuredMediaId,
      meta: {
        _seo_description: article.metaDescription,
        _yoast_wpseo_title: article.seoTitle,
        _yoast_wpseo_focuskw: article.focusKeyword,
        _yoast_wpseo_metadesc: article.metaDescription,
        ...(article.products && article.products.length > 0 ? {
          _blogengine_products: JSON.stringify(article.products),
        } : {}),
        _blogengine_theme: article.themeLabel || "",
        _blogengine_keyword: article.keyword || "",
      },
    });

    // 4. X (Twitter) に自動投稿
    let xResult = null;
    if (config.xApiKey && config.xAccessToken && post.link) {
      try {
        // アイキャッチ画像URLを取得
        let eyecatchUrl: string | undefined;
        if (post.featured_media) {
          try {
            const mediaRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/media/${post.featured_media}`, {
              headers: { Authorization: `Basic ${btoa(`${config.wpUsername}:${config.wpAppPassword}`)}` },
            });
            if (mediaRes.ok) {
              const mediaData = await mediaRes.json();
              eyecatchUrl = mediaData.source_url;
            }
          } catch {}
        }
        xResult = await postArticleToX(
          {
            apiKey: config.xApiKey,
            apiSecret: config.xApiSecret,
            accessToken: config.xAccessToken,
            accessTokenSecret: config.xAccessTokenSecret,
          },
          article.title,
          post.link,
          article.metaDescription,
          article.tags,
          eyecatchUrl,
        );
      } catch (e: any) {
        console.error("[X Post] Failed:", e.message);
        xResult = { success: false, error: e.message };
      }
    }

    // 5. SEO促進（IndexNow + サイトマップPing）
    let seoResult = null;
    if (post.link) {
      try {
        seoResult = await runPostPublishSeo(post.link, config.wpSiteUrl);
      } catch (e: any) {
        console.warn("[SEO] Post-publish SEO failed:", e.message);
      }
    }

    return NextResponse.json({
      status: "success",
      date: dateStr,
      scheduledPublishTime: `${randomHour}:${String(randomMinute).padStart(2, "0")} JST`,
      articleIntent,
      theme: theme.label,
      keyword,
      targetAge,
      article: {
        title: article.title,
        wpPostId: post.id,
        wpStatus: post.status,
        wpLink: post.link,
      },
      x: xResult,
      seo: seoResult,
    });
  } catch (error: any) {
    console.error("Cron execution error:", error);
    return NextResponse.json(
      { status: "error", message: error.message, date: dateStr, theme: theme.label, keyword },
      { status: 500 }
    );
  }
}
