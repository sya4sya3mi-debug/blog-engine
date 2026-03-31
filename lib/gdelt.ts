// ==========================================
// BlogEngine V2 - GDELT API Client
// 美容ニュース自動収集（完全無料・APIキー不要）
// ==========================================

import { TrendItem } from "./trend-types";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language: string;
  socialimage?: string;
  sourcecountry?: string;
}

interface GdeltResponse {
  articles?: GdeltArticle[];
}

// 検索クエリ（引用符なし＋広めのキーワード）
// GDELTではOR区切りで広く拾い、フィルタは後処理で行う
// 1クエリに統合（GDELTのレート制限5秒対策）
const BEAUTY_QUERIES = [
  // 英語（グローバルトレンド）
  "beauty skincare serum retinol niacinamide sunscreen",
  "cosmetic dermatology botox filler laser clinic",
  "hair care shampoo scalp treatment keratin",
  // 日本語（国内トレンド）
  "美容 スキンケア 新作 コスメ",
  "美容医療 クリニック 施術",
];

// リクエスト間隔（GDELTは5秒制限）
const GDELT_INTERVAL_MS = 6000; // GDELTは5秒間隔制限

/**
 * GDELTから美容関連ニュースを取得
 */
export async function searchGdelt(options?: {
  maxResults?: number;
  timespanDays?: number;
}): Promise<TrendItem[]> {
  const maxResults = options?.maxResults ?? 30;
  const timespan = options?.timespanDays ?? 3; // 3日間に拡大
  const allItems: TrendItem[] = [];
  const seenUrls = new Set<string>();

  for (const query of BEAUTY_QUERIES) {
    try {
      const params = new URLSearchParams({
        query: query,
        mode: "artlist",
        format: "json",
        maxrecords: "30",
        timespan: `${timespan}d`,
        sort: "datedesc",
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(
        `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        // レート制限の場合はログだけ出して続行
        if (text.includes("limit requests")) {
          console.warn("GDELT rate limited, waiting...");
          await new Promise((r) => setTimeout(r, GDELT_INTERVAL_MS));
          continue;
        }
        console.error(`GDELT API error: ${res.status} ${text.slice(0, 100)}`);
        continue;
      }

      const data: GdeltResponse = await res.json();
      if (!data.articles) continue;

      for (const article of data.articles) {
        if (seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);

        const item = normalizeGdeltArticle(article);
        if (item) allItems.push(item);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn("GDELT request timed out for query:", query);
      } else {
        console.error("GDELT fetch error:", err);
      }
    }

    // GDELTのレート制限対策（5秒間隔）
    await new Promise((r) => setTimeout(r, GDELT_INTERVAL_MS));
  }

  return allItems.slice(0, maxResults);
}

/**
 * GDELTの記事データをTrendItemに正規化
 * フィルタリングは緩めに設定（タイトル or ドメインでチェック）
 */
function normalizeGdeltArticle(article: GdeltArticle): TrendItem | null {
  if (!article.url || !article.title) return null;

  const titleLower = article.title.toLowerCase();
  const domainLower = (article.domain || "").toLowerCase();

  // ドメインが美容系サイトならそのまま通す
  const isBeautyDomain = BEAUTY_DOMAINS.some((d) => domainLower.includes(d));

  // タイトルに美容関連キーワードが1つでもあれば通す
  const matchedTerms = BEAUTY_RELEVANCE_TERMS.filter((term) =>
    titleLower.includes(term.toLowerCase())
  );
  const isRelevantTitle = matchedTerms.length > 0;

  // どちらにも該当しなければスキップ
  if (!isBeautyDomain && !isRelevantTitle) return null;

  const id = hashUrl(article.url);
  const publishedAt = parseGdeltDate(article.seendate);

  return {
    id,
    source: "gdelt",
    sourceUrl: article.url,
    title: article.title,
    titleJa: "", // 後でClaudeで翻訳
    summary: article.title,
    summaryJa: "",
    category: "その他",
    relevanceScore: 0,
    trendScore: 0,
    combinedScore: 0,
    publishedAt,
    collectedAt: new Date().toISOString(),
    keywords: matchedTerms,
    matchedThemeIds: [],
    language: article.language || "en",
    used: false,
    metadata: {
      domain: article.domain,
      socialImage: article.socialimage,
      sourceCountry: article.sourcecountry,
    },
  };
}

// 美容関連ドメイン（これらのサイトはフィルタなしで通す）
const BEAUTY_DOMAINS = [
  "allure.com", "byrdie.com", "cosmopolitan.com", "elle.com",
  "vogue.com", "harpersbazaar.com", "glamour.com", "refinery29.com",
  "beautybay.com", "sephora.com", "ulta.com", "beautyinsider",
  "skincare.com", "dermstore.com", "paulaschoice.com",
  "maquia.hpplus.jp", "voce.jp", "biteki.com", "cosme.net",
  "beauty", "cosmetic", "skincare",
];

// 美容関連キーワード（広めに設定）
const BEAUTY_RELEVANCE_TERMS = [
  // 英語
  "beauty", "skincare", "skin care", "cosmetic", "makeup", "make-up",
  "dermatology", "aesthetic", "anti-aging", "antiaging", "wrinkle",
  "moisturizer", "serum", "sunscreen", "SPF", "retinol", "retinoid",
  "hyaluronic", "collagen", "botox", "filler", "laser", "peel",
  "acne", "rosacea", "pigmentation", "hair care", "shampoo",
  "foundation", "lipstick", "mascara", "eyeshadow", "concealer",
  "facial", "cleanser", "toner", "exfoliant", "niacinamide",
  "vitamin c", "peptide", "ceramide", "skin barrier",
  "plastic surgery", "cosmetic surgery", "facelift", "microneedling",
  // 日本語（日本語記事がヒットする場合）
  "美容", "スキンケア", "コスメ", "化粧", "美白", "保湿",
];

/**
 * GDELTの日付文字列をISO形式に変換
 */
function parseGdeltDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    const match = dateStr.match(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?/
    );
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
    }
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * URLからハッシュIDを生成
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `gdelt_${Math.abs(hash).toString(36)}`;
}
