// ==========================================
// BlogEngine V2 - Google Suggest API
// サブテーマの注目トピックをリアルタイム取得
// ==========================================

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const keyword = url.searchParams.get("q") || "";

  if (!keyword.trim()) {
    return Response.json({ suggestions: [] });
  }

  try {
    // Google Suggest API（日本語）
    const suggestUrl = `https://suggestqueries.google.com/complete/search?q=${encodeURIComponent(keyword)}&client=firefox&hl=ja&gl=jp`;
    const res = await fetch(suggestUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      return Response.json({ suggestions: [], error: "Google Suggest API error" });
    }

    const data = await res.json();
    // Google Suggestのレスポンス形式: [query, [suggestions]]
    const rawSuggestions: string[] = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];

    // フィルタリング: 元のキーワードと同じものは除外、美容に関連するものを優先
    const suggestions = rawSuggestions
      .filter((s: string) => s !== keyword && s.length > keyword.length)
      .slice(0, 8);

    return Response.json({ suggestions });
  } catch (e: any) {
    return Response.json({ suggestions: [], error: e.message });
  }
}
