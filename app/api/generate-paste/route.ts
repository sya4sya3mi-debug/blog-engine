// ==========================================
// BlogEngine V2 - Paste Article Generation
// 他社AI文章をベースにClaude APIでリライト生成
// ==========================================

export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { generatePasteArticle } from "@/lib/generate";
import { factCheckArticle } from "@/lib/fact-check";

export async function POST(req: Request) {
  const config = getConfig();
  const body = await req.json();
  const { pasteTitle, pasteHtml, pasteKeyword, targetAge } = body;
  const balloonOpts = body.enableBalloon
    ? { authorIconUrl: body.authorIconUrl as string | undefined, authorName: body.authorName as string | undefined }
    : undefined;

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

        // ファクトチェック（薬機法・品質チェック）
        if (config.factCheckEnabled) {
          try {
            const fcResult = await factCheckArticle(config.anthropicApiKey, {
              title: article.title,
              htmlContent: article.htmlContent,
              metaDescription: article.metaDescription,
              keyword: article.keyword || pasteKeyword || "",
              tags: article.tags,
              themeLabel: article.themeLabel || "テキスト貼り付け",
            });
            if (fcResult.success) {
              article.title = fcResult.improved.title;
              article.htmlContent = fcResult.improved.htmlContent;
              article.metaDescription = fcResult.improved.metaDescription;
              article.tags = fcResult.improved.tags;
              console.log("[Paste FactCheck] " + fcResult.report.changes.length + "件の改善を適用");
            } else {
              console.warn("[Paste FactCheck] レビュー失敗（元の記事を使用）:", fcResult.error);
            }
          } catch (e: any) {
            console.warn("[Paste FactCheck] エラー（元の記事を使用）:", e.message);
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
