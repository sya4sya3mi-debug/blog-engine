// ==========================================
// BlogEngine V2 - Category Article Generation
// カテゴリー記事（ピラーページ）を生成
// WordPress既存記事を自動で内部リンクとして挿入
// ==========================================

export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { generateCategoryArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";

export async function POST(req: Request) {
  const config = getConfig();
  const body = await req.json();
  const { categoryId, targetAge, subThemeIds, suggestTopic } = body;
  const safeSubThemeIds = Array.isArray(subThemeIds)
    ? subThemeIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];
  const balloonOpts = body.enableBalloon ? { authorIconUrl: body.authorIconUrl as string | undefined, authorName: body.authorName as string | undefined } : undefined;

  if (!categoryId) {
    return Response.json({ error: "カテゴリーを選択してください" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        // WordPress既存記事を取得（内部リンク用）
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
        } catch (e) {
          console.log("[Category] WordPress posts fetch failed, continuing without internal links");
        }

        // カテゴリー記事生成
        const article = await generateCategoryArticle(
          config.anthropicApiKey,
          categoryId,
          existingPosts,
          targetAge || "30s",
          safeSubThemeIds,
          suggestTopic,
          balloonOpts,
        );

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
          },
          internalLinksCount: existingPosts.length,
        })));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: false,
          error: `カテゴリー記事生成エラー: ${error.message}`,
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
