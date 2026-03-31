// ==========================================
// BlogEngine V2 - Trend Collection Cron
// 自動トレンド収集（UTC 18:00 = JST 03:00）
// ==========================================

export const runtime = "edge";

import { collectBeautyTrends } from "@/lib/trend-collector";

export async function GET(req: Request) {
  try {
    // Cron認証
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron-Trends] Starting beauty trend collection...");

    const result = await collectBeautyTrends({
      anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
      youtubeApiKey: process.env.YOUTUBE_API_KEY || "",
      ncbiApiKey: process.env.NCBI_API_KEY || "",
    });

    console.log(
      `[Cron-Trends] Done: ${result.stored} trends stored, ${result.errors.length} errors`
    );

    return Response.json({
      success: true,
      collected: result.collected,
      deduplicated: result.deduplicated,
      stored: result.stored,
      errors: result.errors,
      // Cronではitemsを返さない（ログに残すだけ）
      topTrends: result.items.slice(0, 5).map((item) => ({
        title: item.titleJa || item.title,
        source: item.source,
        score: item.combinedScore,
        category: item.category,
      })),
    });
  } catch (err) {
    console.error("[Cron-Trends] Error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
