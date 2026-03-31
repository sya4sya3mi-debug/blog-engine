// ==========================================
// BlogEngine V2 - Trends API Route
// POST: 手動トレンド収集実行（ハートビート方式）
// ==========================================

export const runtime = "edge";

import { getConfig } from "@/lib/config";
import { collectBeautyTrends } from "@/lib/trend-collector";

export async function POST(req: Request) {
  const config = getConfig();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        const ytKey = process.env.YOUTUBE_API_KEY || "";
        const result = await collectBeautyTrends({
          anthropicApiKey: config.anthropicApiKey,
          youtubeApiKey: ytKey,
          ncbiApiKey: process.env.NCBI_API_KEY || "",
          skipTranslation: true,
        });

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          success: true,
          collected: result.collected,
          deduplicated: result.deduplicated,
          stored: result.stored,
          errors: result.errors,
          items: result.items,
        })));
        controller.close();
      } catch (err) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({
          error: err instanceof Error ? err.message : "Unknown error",
        })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
