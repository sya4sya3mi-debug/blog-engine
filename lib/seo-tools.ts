// ==========================================
// BlogEngine V2 - SEO Tools
// IndexNow + サイトマップPing + インデックス促進
// ==========================================

/**
 * IndexNow API — 記事公開後にBing/Yandexに即時インデックスリクエスト
 * APIキー不要（ホスティングドメインの検証のみ）
 * Google も 2025年から IndexNow に対応
 */
export async function submitIndexNow(pageUrl: string, siteUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // IndexNow はキーなしでも送信可能（一部検索エンジン）
    // Bing の IndexNow エンドポイント
    const indexNowUrl = `https://www.bing.com/indexnow?url=${encodeURIComponent(pageUrl)}&key=blogengine`;

    const res = await fetch(indexNowUrl, { method: "GET" });
    console.log(`[IndexNow Bing] ${res.status} for ${pageUrl}`);

    // Yandex にも送信
    const yandexUrl = `https://yandex.com/indexnow?url=${encodeURIComponent(pageUrl)}&key=blogengine`;
    await fetch(yandexUrl, { method: "GET" }).catch(() => {});

    // search.seznam.cz にも送信（チェコの検索エンジンだが IndexNow 対応）
    const seznamUrl = `https://search.seznam.cz/indexnow?url=${encodeURIComponent(pageUrl)}&key=blogengine`;
    await fetch(seznamUrl, { method: "GET" }).catch(() => {});

    return { success: res.status === 200 || res.status === 202 };
  } catch (e: any) {
    console.error("[IndexNow] Failed:", e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Google Search Console サイトマップ Ping
 * サイトマップURLを通知して再クロールを促す
 */
export async function pingGoogleSitemap(sitemapUrl: string): Promise<{ success: boolean }> {
  try {
    const url = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const res = await fetch(url, { method: "GET" });
    console.log(`[Google Sitemap Ping] ${res.status}`);
    return { success: res.ok };
  } catch (e: any) {
    console.error("[Google Sitemap Ping] Failed:", e.message);
    return { success: false };
  }
}

/**
 * Bing Webmaster サイトマップ Ping
 */
export async function pingBingSitemap(sitemapUrl: string): Promise<{ success: boolean }> {
  try {
    const url = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const res = await fetch(url, { method: "GET" });
    console.log(`[Bing Sitemap Ping] ${res.status}`);
    return { success: res.ok };
  } catch (e: any) {
    console.error("[Bing Sitemap Ping] Failed:", e.message);
    return { success: false };
  }
}

/**
 * 記事公開後のSEO促進処理をまとめて実行
 */
export async function runPostPublishSeo(
  articleUrl: string,
  siteUrl: string,
): Promise<{ indexNow: boolean; googlePing: boolean; bingPing: boolean }> {
  const sitemapUrl = `${siteUrl.replace(/\/+$/, "")}/sitemap.xml`;

  // 並列実行
  const [indexNowResult, googleResult, bingResult] = await Promise.allSettled([
    submitIndexNow(articleUrl, siteUrl),
    pingGoogleSitemap(sitemapUrl),
    pingBingSitemap(sitemapUrl),
  ]);

  return {
    indexNow: indexNowResult.status === "fulfilled" && indexNowResult.value.success,
    googlePing: googleResult.status === "fulfilled" && googleResult.value.success,
    bingPing: bingResult.status === "fulfilled" && bingResult.value.success,
  };
}
