// ==========================================
// BlogEngine V2 - Publish Endpoint
// プレビュー確認後にWP投稿 + 画像生成 + X投稿を実行
// ==========================================

import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";
import { ALLOWED_TAGS } from "@/lib/tag-allowlist";
import { injectEyecatchIntoArticle, GeneratedArticle } from "@/lib/generate";
import { generateEyecatchImage, generateProductEyecatchImage } from "@/lib/image-generator";
import { replaceInternalLinkPlaceholders } from "@/lib/internal-links";
import { postArticleToX } from "@/lib/x-poster";
import { runPostPublishSeo } from "@/lib/seo-tools";
import { replaceAffiliatePlaceholders } from "@/lib/affiliate";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();

  const {
    article,
    generateImages,
    postToX,
    productNames,
    customXText,
    preGeneratedImageUrl,
    publishStatus,
    scheduledDate,
  } = body as {
    article: {
      title: string;
      seoTitle: string;
      metaDescription: string;
      htmlContent: string;
      slug: string;
      focusKeyword: string;
      keyword: string;
      themeLabel: string;
      tags: string[];
      products?: { name: string; price?: number; url?: string; brand?: string }[];
    };
    generateImages?: boolean;
    postToX?: boolean;
    productNames?: string[];
    customXText?: string;
    preGeneratedImageUrl?: string;
    publishStatus?: "draft" | "publish" | "future";
    scheduledDate?: string; // ISO 8601 format for future posts
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
        let htmlContent = article.htmlContent;

        // 1. 内部リンク置換
        try {
          const existingPosts = await wp.getRecentPosts(50);
          const postData = existingPosts.map((p) => ({
            slug: p.slug,
            link: p.link,
            title: p.title?.rendered || "",
          }));
          htmlContent = replaceInternalLinkPlaceholders(htmlContent, config.wpSiteUrl, postData);
        } catch {
          htmlContent = replaceInternalLinkPlaceholders(htmlContent, config.wpSiteUrl);
        }

        // 1.5. アフィリエイトプレースホルダーが残っていれば楽天から自動検索して差し込む
        const placeholderCheck = /<p\s+class="affiliate-placeholder">/;
        if (placeholderCheck.test(htmlContent)) {
          const rakutenAppId = process.env.RAKUTEN_APP_ID;
          const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;
          const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
          if (rakutenAppId && rakutenAffiliateId) {
            try {
              const searchKw = article.keyword || article.title.slice(0, 20);
              const found = await searchRakutenProducts(
                rakutenAppId, rakutenAffiliateId, searchKw, 5, rakutenAccessKey,
                { maxResults: 3, expandKeywords: true },
              );
              if (found.length > 0) {
                const autoLinks = found.map((p) => ({ themeId: "auto", html: buildRakutenAffiliateHtml(p) }));
                htmlContent = replaceAffiliatePlaceholders(htmlContent, autoLinks);
              }
            } catch {}
          }
          // それでも残ったプレースホルダーは削除（読者に見せない）
          htmlContent = htmlContent.replace(/<p\s+class="affiliate-placeholder">[^<]*<\/p>/g, "");
        }

        // 2. アイキャッチ画像（事前生成 or 新規生成）
        let featuredMediaId: number | undefined;
        let eyecatchUrl: string | undefined;
        if (preGeneratedImageUrl) {
          // ステップ3で事前生成された画像を使用
          try {
            const media = await wp.uploadMediaFromUrl(
              preGeneratedImageUrl,
              `eyecatch-${article.slug || "article"}-${Date.now()}.png`,
              `${article.title} アイキャッチ画像`,
            );
            featuredMediaId = media.id;
            eyecatchUrl = media.url;
            const articleObj = { ...article, htmlContent, eyecatchUrl: undefined } as GeneratedArticle;
            injectEyecatchIntoArticle(articleObj, media.url);
            htmlContent = articleObj.htmlContent;
          } catch (e: any) {
            console.error("[Publish PreGenerated Image] Failed:", e.message);
          }
        } else if (generateImages && config.openaiApiKey) {
          // 従来の自動生成（Cron用）
          try {
            const eyecatch = productNames && productNames.length > 0
              ? await generateProductEyecatchImage(config.openaiApiKey, productNames, article.title)
              : await generateEyecatchImage(config.openaiApiKey, article.title, article.keyword, article.themeLabel);
            const media = await wp.uploadMediaFromUrl(
              eyecatch.imageUrl,
              `eyecatch-${article.slug || "article"}-${Date.now()}.png`,
              eyecatch.altText,
            );
            featuredMediaId = media.id;
            eyecatchUrl = media.url;
            const articleObj = { ...article, htmlContent, eyecatchUrl: undefined } as GeneratedArticle;
            injectEyecatchIntoArticle(articleObj, media.url);
            htmlContent = articleObj.htmlContent;
          } catch (e: any) {
            console.error("[Publish Eyecatch] Failed:", e.message);
          }
        }

        // 3. WordPress投稿
        const tagIds = article.tags.length > 0 ? await wp.findExistingTags(article.tags, ALLOWED_TAGS) : [];
        const wpStatus = (publishStatus || config.wpDefaultStatus || "draft") as "draft" | "publish" | "future";
        // 予約投稿の日時フォーマット修正（datetime-localは秒がないのでWordPress用に追加）
        let wpDate: string | undefined;
        if (wpStatus === "future" && scheduledDate) {
          wpDate = (scheduledDate || "").includes("T")
            ? (scheduledDate!.length <= 16 ? scheduledDate + ":00" : scheduledDate)
            : scheduledDate;
        }
        console.log(`[Publish] status=${wpStatus}, date=${wpDate}, publishStatus=${publishStatus}`);
        const post = await wp.createPost({
          title: article.title,
          content: htmlContent,
          slug: article.slug,
          status: wpStatus,
          tags: tagIds,
          featured_media: featuredMediaId,
          ...(wpDate ? { date: wpDate } : {}),
          meta: {
            _seo_description: article.metaDescription,
            _yoast_wpseo_title: article.seoTitle,
            _yoast_wpseo_focuskw: article.focusKeyword,
            _yoast_wpseo_metadesc: article.metaDescription,
            // ASP情報・商品データ
            ...(article.products && article.products.length > 0 ? {
              _blogengine_products: JSON.stringify(article.products),
            } : {}),
            ...(article.themeLabel ? {
              _blogengine_theme: article.themeLabel,
            } : {}),
            ...(article.keyword ? {
              _blogengine_keyword: article.keyword,
            } : {}),
            // X投稿文を保存（予約投稿時に後からコピーできるように）
            ...(customXText ? {
              _blogengine_x_text: customXText,
            } : {}),
          },
        });

        // 4. X投稿（リトライ付き）
        let xResult: any = null;
        // 予約投稿の場合はX投稿をスキップ（まだ公開されていないため）
        if (postToX && wpStatus !== "future" && config.xApiKey && config.xAccessToken && post.link) {
          const xCreds = {
            apiKey: config.xApiKey,
            apiSecret: config.xApiSecret,
            accessToken: config.xAccessToken,
            accessTokenSecret: config.xAccessTokenSecret,
          };
          // X投稿（テキストのみ、画像なし、URLはリプライで投稿）
          try {
            // customXTextからURLを除去
            let cleanText = customXText || "";
            if (cleanText) {
              cleanText = cleanText.replace(/https?:\/\/[^\s]+/g, "").trim();
              if (!cleanText.includes("プロフ")) {
                cleanText += "\n\n詳しくはプロフのリンクから👆";
              }
            }
            // 画像なし（undefined）でpostArticleToXを呼ぶ → リプライでURLのOGPカードが表示される
            if (cleanText) {
              xResult = await postArticleToX(xCreds, article.title, post.link, "", [], undefined, cleanText);
            } else {
              xResult = await postArticleToX(xCreds, article.title, post.link, article.metaDescription, article.tags, undefined);
            }
          } catch (e: any) {
            xResult = { success: false, error: e.message };
          }
          // 403リトライ（URLなしでリトライ）
          if (!xResult?.success && typeof xResult?.error === "string" && xResult.error.includes("403")) {
            try {
              const { postToX: postToXFn } = await import("@/lib/x-poster");
              const simpleTweet = `${article.title}\n\n詳しくはプロフのリンクから👆`;
              xResult = await postToXFn(xCreds, simpleTweet);
            } catch (e: any) {
              xResult = { success: false, error: `Retry failed: ${e.message}` };
            }
          }
        }

        // 5. SEO促進（IndexNow + サイトマップPing）
        let seoResult = null;
        if (post.link) {
          try {
            seoResult = await runPostPublishSeo(post.link, config.wpSiteUrl);
          } catch {}
        }

        clearInterval(heartbeat);
        // 予約投稿時はX投稿文を返す（後からコピーできるように）
        const savedXText = wpStatus === "future" && customXText
          ? customXText + (post.link ? `\n\n${post.link}` : "")
          : undefined;

        controller.enqueue(encoder.encode(JSON.stringify({
          status: "success",
          wordpress: { postId: post.id, status: post.status, link: post.link, scheduledDate: wpStatus === "future" ? scheduledDate : undefined },
          eyecatchUrl,
          x: xResult,
          seo: seoResult,
          savedXText,
        })));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: error.message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
