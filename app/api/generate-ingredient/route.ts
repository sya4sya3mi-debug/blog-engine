export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { generateIngredientArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";
import { buildAuditSummary, factCheckArticle } from "@/lib/fact-check";

export async function POST(req: Request) {
  const config = getConfig();
  const body = await req.json();
  const { ingredientId, targetAge } = body;
  let balloonOpts = body.enableBalloon
    ? { authorIconUrl: body.authorIconUrl as string | undefined, authorName: body.authorName as string | undefined }
    : undefined;

  if (balloonOpts && (!balloonOpts.authorIconUrl || !balloonOpts.authorName)) {
    try {
      const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
      const profile = await wp.getAuthorProfile();
      balloonOpts = {
        authorIconUrl: balloonOpts.authorIconUrl || profile.avatarUrl || undefined,
        authorName: balloonOpts.authorName || profile.name || undefined,
      };
    } catch {
      // ignore and keep defaults
    }
  }

  if (!ingredientId) {
    return Response.json({ error: "成分を選択してください" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        let existingPosts: { title: string; url: string; slug: string }[] = [];
        try {
          const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
          const posts = await wp.getRecentPosts(100);
          existingPosts = posts
            .filter((p: any) => p.status === "publish")
            .map((p: any) => ({
              title: typeof p.title === "object" ? p.title.rendered : p.title,
              url: p.link,
              slug: p.slug,
            }));
        } catch {
          console.log("[Ingredient] WordPress posts fetch failed, continuing without internal links");
        }

        const article = await generateIngredientArticle(
          config.anthropicApiKey,
          ingredientId,
          existingPosts,
          targetAge || "30s",
          balloonOpts,
        );

        if (config.factCheckEnabled) {
          try {
            const fcResult = await factCheckArticle(config.anthropicApiKey, {
              title: article.title,
              htmlContent: article.htmlContent,
              metaDescription: article.metaDescription,
              keyword: article.keyword || ingredientId || "",
              tags: article.tags,
              themeLabel: article.themeLabel || ingredientId || "",
            });
            if (fcResult.success) {
              article.title = fcResult.improved.title;
              article.htmlContent = fcResult.improved.htmlContent;
              article.metaDescription = fcResult.improved.metaDescription;
              article.tags = fcResult.improved.tags;
              article.auditSummary = buildAuditSummary(fcResult.report);
              console.log("[Ingredient FactCheck] " + fcResult.report.changes.length + "件の改善を適用");
            } else {
              console.warn("[Ingredient FactCheck] レビュー失敗（元の記事を使用）:", fcResult.error);
            }
          } catch (e: any) {
            console.warn("[Ingredient FactCheck] エラー（元の記事を使用）:", e.message);
          }
        }

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: true,
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
            faqSchema: article.faqSchema,
            seoNotes: article.seoNotes,
            internalLinks: article.internalLinks,
            externalSources: article.externalSources,
            imageSeo: article.imageSeo,
            auditSummary: article.auditSummary,
          },
          internalLinksCount: existingPosts.length,
        })));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: false,
          error: `成分記事生成エラー: ${error.message}`,
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
