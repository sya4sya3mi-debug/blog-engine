// ==========================================
// BlogEngine V2 - Fact-Check API Endpoint
// 生成記事のファクトチェック＆改良
// ==========================================

import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { factCheckArticle, FactCheckInput } from "@/lib/fact-check";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();

  const { article } = body as { article: FactCheckInput };

  if (!article || !article.htmlContent) {
    return new Response(
      JSON.stringify({ error: "記事データが不足しています" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // ストリーミングレスポンス（ハートビートでVercel Hobbyタイムアウト回避）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const result = await factCheckArticle(config.anthropicApiKey, article);

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      } catch (error: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: false,
          original: article,
          improved: article,
          report: { overallScore: 0, changes: [], complianceIssues: [], summary: "" },
          error: error.message || "ファクトチェック中にエラーが発生しました",
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
