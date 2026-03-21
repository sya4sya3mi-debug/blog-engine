// ==========================================
// BlogEngine V2 - Manual Generate Endpoint
// ストリーミングレスポンスでVercel Hobbyタイムアウト回避
// ==========================================

import { NextRequest } from "next/server";
import { getConfig, ALL_GENRES } from "@/lib/config";
import { generateArticle, generateProductArticle, TargetAge } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";
import { AffiliateLink, replaceAffiliatePlaceholders } from "@/lib/affiliate";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();

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
    return new Response(JSON.stringify({ error: "ジャンルが見つかりません" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ストリーミングレスポンスでタイムアウト回避
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // 処理中に定期的にハートビートを送信してコネクション維持
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(" "));
      }, 5000);

      try {
        let article;

        if (mode === "product") {
          if (!products || products.length === 0) {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ status: "error", message: "商品名を1つ以上指定してください" })));
            controller.close();
            return;
          }
          article = await generateProductArticle(config.anthropicApiKey, products, genre.name, age, customKeyword);
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
          article = await generateArticle(config.anthropicApiKey, kw, theme, genre.name, age);
        }

        // アフィリエイトリンク自動置換
        if (affiliateLinks && affiliateLinks.length > 0) {
          article.htmlContent = replaceAffiliatePlaceholders(article.htmlContent, affiliateLinks);
        }

        let wpResult = null;

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

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          status: "success",
          article: {
            title: article.title,
            metaDescription: article.metaDescription,
            htmlContent: article.htmlContent,
            keyword: article.keyword,
            themeLabel: article.themeLabel,
          },
          wordpress: wpResult,
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
