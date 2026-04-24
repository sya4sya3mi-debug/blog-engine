// ==========================================
// BlogEngine V2 - Paste Article Generation
// 他社AI文章をベースにClaude APIでリライト生成
// ファクトチェックはクライアント側で実行（Edge Function時間制限対策）
// ==========================================

export const runtime = "nodejs";
export const maxDuration = 300;

import { getConfig } from "@/lib/config";
import { generatePasteArticle } from "@/lib/generate";
import { WordPressClient } from "@/lib/wordpress";

export async function POST(req: Request) {
  const config = getConfig();
  const body = await req.json();
  const { pasteTitle, pasteHtml, pasteKeyword, targetAge } = body;
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

  if (!pasteTitle?.trim() || !pasteHtml?.trim()) {
    return Response.json({ error: "タイトルと本文を入力してください" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const article = await generatePasteArticle(
          config.anthropicApiKey,
          pasteTitle.trim(),
          pasteHtml.trim(),
          pasteKeyword?.trim() || "",
          targetAge || "30s",
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
        })));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: false,
          error: `テキスト貼り付け記事生成エラー: ${error.message}`,
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
