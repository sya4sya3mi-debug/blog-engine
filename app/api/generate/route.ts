// ==========================================
// BlogEngine V2 - Manual Generate Endpoint
// Edge Runtime + ストリーミングでVercel Hobbyタイムアウト回避
// ==========================================

import { NextRequest } from "next/server";
import { getConfig, ALL_GENRES } from "@/lib/config";
import { generateArticle, generateProductArticleWithReviews, TargetAge } from "@/lib/generate";
import { AffiliateLink, replaceAffiliatePlaceholders } from "@/lib/affiliate";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";
import { factCheckArticle } from "@/lib/fact-check";

// Edge Runtimeを使用（Hobby: 25秒 → ストリーミングで延長可能）
export const runtime = "edge";

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();

  const { mode, themeId, keyword, products, customKeyword, postToWP, postToX, targetAge, affiliateLinks, generateImages, hasExperience, experienceNote, pricePreset, comparisonMode } = body as {
    mode: "theme" | "product" | "personal-review";
    themeId?: string;
    keyword?: string;
    products?: string[];
    customKeyword?: string;
    postToWP?: boolean;
    postToX?: boolean;
    targetAge?: TargetAge;
    affiliateLinks?: AffiliateLink[];
    generateImages?: boolean;
    hasExperience?: boolean;
    experienceNote?: string;
    pricePreset?: string;
    comparisonMode?: { enabled: boolean; recommendIndex?: number; productPrices?: number[]; productScores?: number[] };
  };

  const age: TargetAge = targetAge || "30s";
  const balloonOpts = body.enableBalloon ? { authorIconUrl: body.authorIconUrl as string | undefined, authorName: body.authorName as string | undefined } : undefined;

  const genre = ALL_GENRES.find((g) => g.id === config.activeGenre);
  if (!genre) {
    return new Response(JSON.stringify({ error: "ジャンルが見つかりません" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ストリーミングレスポンス
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 3秒おきにハートビートでコネクション維持
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        let article;
        let productNamesForImage: string[] | undefined;
        let currentThemeId: string | undefined;

        if (mode === "personal-review") {
          // 本人使用投稿モード
          const { generatePersonalReviewArticle } = await import("@/lib/generate");
          const reviewData = body.reviewData as any;
          const photoUrls = body.photoUrls as string[] || [];

          if (!reviewData?.productName) {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: "商品名を入力してください" })));
            controller.close();
            return;
          }

          article = await generatePersonalReviewArticle(
            config.anthropicApiKey,
            reviewData,
            photoUrls,
            targetAge || "30s",
            balloonOpts,
          );
          productNamesForImage = [reviewData.productName];

          // 楽天からアフィリエイトリンクを自動取得
          const rakutenAppId = process.env.RAKUTEN_APP_ID;
          const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
          const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
          if (rakutenAppId && rakutenAffiliateId) {
            try {
              const { searchRakutenProducts, buildRakutenAffiliateHtml } = await import("@/lib/rakuten");
              const found = await searchRakutenProducts(rakutenAppId, rakutenAffiliateId, reviewData.productName, 3, rakutenAccessKey, { maxResults: 3 });
              if (found.length > 0) {
                const { replaceAffiliatePlaceholders } = await import("@/lib/affiliate");
                const autoLinks = found.map((p) => ({ themeId: "review", html: buildRakutenAffiliateHtml(p) }));
                article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, autoLinks);
              }
            } catch {}
          }
        } else if (mode === "product") {
          if (!products || products.length === 0) {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: "商品名を1つ以上指定してください" })));
            controller.close();
            return;
          }
          // 楽天から商品情報（公式スペック）とレビューを取得
          const rakutenAppId = process.env.RAKUTEN_APP_ID;
          const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
          const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
          let reviewsText = "";
          let productSpecsText = "";
          if (rakutenAppId && rakutenAffiliateId) {
            try {
              const { searchAndFetchReviews, formatReviewsForPrompt, searchRakutenProducts, formatProductSpecsForPrompt } = await import("@/lib/rakuten");

              // 1. 商品スペック取得（販売元の公式情報）
              const foundProducts: import("@/lib/rakuten").RakutenProduct[] = [];
              for (const pName of products.slice(0, 5)) {
                const found = await searchRakutenProducts(rakutenAppId, rakutenAffiliateId, pName, 3, rakutenAccessKey, { maxResults: 1 });
                if (found.length > 0) foundProducts.push(found[0]);
              }
              if (foundProducts.length > 0) {
                productSpecsText = formatProductSpecsForPrompt(foundProducts);
              }

              // 2. レビュー取得（実際の口コミ）
              const allReviews: import("@/lib/rakuten").RakutenReview[] = [];
              for (const pName of products.slice(0, 3)) {
                const { reviews } = await searchAndFetchReviews(rakutenAppId, rakutenAffiliateId, pName, 3, rakutenAccessKey);
                allReviews.push(...reviews);
              }
              if (allReviews.length > 0) {
                reviewsText = formatReviewsForPrompt(allReviews);
              }
            } catch (e: any) {
              console.warn("[Product Data] Fetch failed:", e.message);
            }
          }
          article = await generateProductArticleWithReviews(config.anthropicApiKey, products, genre.name, age, productSpecsText + reviewsText, customKeyword, hasExperience, experienceNote, pricePreset, comparisonMode, balloonOpts);
          productNamesForImage = products;

          // 商品モード: ダッシュボードから送信されたアフィリエイトリンクを即座に差し込む
          if (affiliateLinks && affiliateLinks.length > 0) {
            article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, affiliateLinks);
            console.log(`[Product] Inserted ${affiliateLinks.length} affiliate links from dashboard`);
          }
        } else {
          const theme = themeId
            ? genre.subThemes.find((t) => t.id === themeId)
            : genre.subThemes[0];
          if (!theme) {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: "テーマが見つかりません" })));
            controller.close();
            return;
          }
          const kw = keyword || theme.keywords[0];
          currentThemeId = theme.id;
          article = await generateArticle(config.anthropicApiKey, kw, theme, genre.name, age, undefined, balloonOpts);

          // テーマモード: 提携先DBのリンクを優先、なければ楽天から自動検索
          let themeLinks = affiliateLinks || [];
          if (themeLinks.length === 0) {
            const rakutenAppId = process.env.RAKUTEN_APP_ID;
            const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
            const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
            if (rakutenAppId && rakutenAffiliateId) {
              try {
                const rakutenProducts = await searchRakutenProducts(
                  rakutenAppId, rakutenAffiliateId, kw, 5, rakutenAccessKey,
                  { themeId: theme.id, maxResults: 3, expandKeywords: true },
                );
                if (rakutenProducts.length > 0) {
                  themeLinks = rakutenProducts.map((p) => ({
                    themeId: theme.id,
                    html: buildRakutenAffiliateHtml(p),
                  }));
                  console.log(`[Theme Rakuten] Auto-found ${rakutenProducts.length} products for: ${kw}`);
                }
              } catch (e: any) {
                console.warn("[Theme Rakuten] Search failed:", e.message);
              }
            }
          }
          if (themeLinks.length > 0) {
            article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, themeLinks);
          }
        }

        // ファクトチェック（薬機法・品質チェック）
        if (config.factCheckEnabled) {
          try {
            const fcResult = await factCheckArticle(config.anthropicApiKey, {
              title: article.title,
              htmlContent: article.htmlContent,
              metaDescription: article.metaDescription,
              keyword: article.keyword || "",
              tags: article.tags,
              themeLabel: article.themeLabel || keyword || "",
            });
            if (fcResult.success) {
              article.title = fcResult.improved.title;
              article.htmlContent = fcResult.improved.htmlContent;
              article.metaDescription = fcResult.improved.metaDescription;
              article.tags = fcResult.improved.tags;
              console.log("[Generate FactCheck] " + fcResult.report.changes.length + "件の改善を適用");
            } else {
              console.warn("[Generate FactCheck] レビュー失敗（元の記事を使用）:", fcResult.error);
            }
          } catch (e: any) {
            console.warn("[Generate FactCheck] エラー（元の記事を使用）:", e.message);
          }
        }

        // 残ったプレースホルダーを削除（楽天検索で見つからなかった場合のフォールバック）
        article.htmlContent = article.htmlContent.replace(/<p\s+class="affiliate-placeholder">[^<]*<\/p>/g, "");

        // 手動生成では記事のみ返す（WP/画像/Xは /api/publish で別途実行）
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          status: "success",
          article: {
            title: article.title,
            seoTitle: article.seoTitle,
            metaDescription: article.metaDescription,
            htmlContent: article.htmlContent,
            slug: article.slug,
            focusKeyword: article.focusKeyword,
            keyword: article.keyword,
            themeLabel: article.themeLabel,
            tags: article.tags,
          },
          productNames: productNamesForImage,
        })));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        console.error("Generate error:", error);
        controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: error.message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
