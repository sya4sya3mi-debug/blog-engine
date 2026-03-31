// ==========================================
// BlogEngine V2 - YouTube Data API v3 Client + Google News RSS
// YouTube: APIキーがあれば使用、なければGoogle News RSSで代替
// ==========================================

import { TrendItem } from "./trend-types";

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    publishedAt: string;
    channelId: string;
    title: string;
    description: string;
    channelTitle: string;
    thumbnails: {
      high?: { url: string };
      medium?: { url: string };
      default?: { url: string };
    };
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
  pageInfo?: { totalResults: number };
  error?: { message: string; code: number };
}

// 美容関連の日本語検索クエリ（5クエリ = 500ユニット/回）
const BEAUTY_SEARCH_QUERIES = [
  // 6テーマに対応した検索クエリ
  "シミ 美白 美容液 おすすめ",
  "毛穴 ニキビ スキンケア",
  "エイジングケア レチノール 使い方",
  "医療脱毛 体験 レビュー",
  "美容クリニック 施術 レビュー",
  "シャンプー ヘアケア おすすめ",
  // トレンド系
  "コスメ 新作 2026",
  "ドラッグストア コスメ 購入品",
  "美容 ルーティン ナイトケア",
  "韓国コスメ 新作 レビュー",
];

/**
 * YouTubeから美容関連動画を検索
 */
export async function searchYouTube(
  apiKey: string,
  options?: {
    maxResultsPerQuery?: number;
    customQueries?: string[];
  }
): Promise<TrendItem[]> {
  if (!apiKey) {
    console.warn("YouTube API key not configured, skipping YouTube search");
    return [];
  }
  console.log(`[YouTube] Starting search with key: ${apiKey.slice(0, 8)}...`);

  const maxPerQuery = options?.maxResultsPerQuery ?? 3;
  const queries = options?.customQueries ?? BEAUTY_SEARCH_QUERIES;
  const allItems: TrendItem[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    try {
      const params = new URLSearchParams({
        part: "snippet",
        q: query,
        type: "video",
        maxResults: String(maxPerQuery),
        order: "date",
        regionCode: "JP",
        relevanceLanguage: "ja",
        publishedAfter: getDateDaysAgo(7), // 直近7日間
        key: apiKey,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?${params}`,
        { signal: controller.signal }
      );
      clearTimeout(timeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = (errData as YouTubeSearchResponse).error?.message || JSON.stringify(errData).slice(0, 200);
        console.error(`[YouTube] API error ${res.status}: ${errMsg}`);
        continue;
      }
      console.log(`[YouTube] Query "${query}" returned ${res.status}`);

      const data: YouTubeSearchResponse = await res.json();
      if (!data.items) continue;

      for (const item of data.items) {
        const videoId = item.id.videoId;
        if (!videoId || seenIds.has(videoId)) continue;
        seenIds.add(videoId);

        allItems.push(normalizeYouTubeItem(item, query));
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn("YouTube request timed out for query:", query);
      } else {
        console.error("YouTube fetch error:", err);
      }
    }

    // レート制限対策
    await new Promise((r) => setTimeout(r, 200));
  }

  return allItems;
}

/**
 * YouTube検索結果をTrendItemに正規化
 */
function normalizeYouTubeItem(
  item: YouTubeSearchItem,
  searchQuery: string
): TrendItem {
  const videoId = item.id.videoId;
  const snippet = item.snippet;
  const thumbnail =
    snippet.thumbnails.high?.url ||
    snippet.thumbnails.medium?.url ||
    snippet.thumbnails.default?.url ||
    "";

  return {
    id: `yt_${videoId}`,
    source: "youtube",
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title,
    titleJa: snippet.title, // 日本語コンテンツなのでそのまま
    summary: snippet.description?.slice(0, 200) || "",
    summaryJa: snippet.description?.slice(0, 200) || "",
    category: "その他", // 後でカテゴリ分類
    relevanceScore: 0,
    trendScore: 0,
    combinedScore: 0,
    publishedAt: snippet.publishedAt,
    collectedAt: new Date().toISOString(),
    keywords: extractYouTubeKeywords(snippet.title, searchQuery),
    matchedThemeIds: [],
    language: "ja",
    used: false,
    metadata: {
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      thumbnail,
      searchQuery,
    },
  };
}

/**
 * YouTube動画タイトルからキーワード抽出
 */
function extractYouTubeKeywords(title: string, searchQuery: string): string[] {
  const keywords: string[] = [];
  const beautyTerms = [
    "スキンケア", "美容液", "化粧水", "日焼け止め", "ファンデ",
    "リップ", "アイシャドウ", "クレンジング", "洗顔", "パック",
    "美白", "毛穴", "ニキビ", "エイジング", "保湿", "乾燥",
    "レチノール", "ビタミンC", "セラム", "クリーム", "オイル",
    "シャンプー", "トリートメント", "ヘアケア", "ヘアオイル",
    "医療脱毛", "ハイフ", "ボトックス", "ピーリング", "レーザー",
    "プチプラ", "デパコス", "新作", "限定", "ランキング", "比較",
  ];

  for (const term of beautyTerms) {
    if (title.includes(term)) {
      keywords.push(term);
    }
  }

  // 検索クエリのキーワードも追加
  const queryWords = searchQuery.split(/\s+/);
  for (const w of queryWords) {
    if (w.length >= 2 && !keywords.includes(w)) {
      keywords.push(w);
    }
  }

  return keywords;
}

/**
 * N日前のISO日付文字列を取得
 */
function getDateDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// ==========================================
// Google News RSS（YouTube APIキーなしの代替手段）
// 美容関連の日本語ニュースを無料で取得
// ==========================================

const GOOGLE_NEWS_QUERIES = [
  "美容 スキンケア 新作 2026",
  "美容医療 クリニック 施術",
  "コスメ 新商品 発売",
  "シャンプー ヘアケア 新作",
  "美白 シミ 新商品",
  "レチノール ナイアシンアミド 美容液",
  "韓国コスメ 日本上陸",
  "ドラッグストア コスメ 人気",
];

/**
 * Google News RSSから美容ニュースを取得（APIキー不要）
 */
export async function searchGoogleNews(options?: {
  maxResults?: number;
}): Promise<TrendItem[]> {
  const maxResults = options?.maxResults ?? 20;
  const allItems: TrendItem[] = [];
  const seenUrls = new Set<string>();

  for (const query of GOOGLE_NEWS_QUERIES) {
    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=ja&gl=JP&ceid=JP:ja`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        console.error(`Google News RSS error: ${res.status}`);
        continue;
      }

      const xml = await res.text();
      const items = parseRssXml(xml, query);

      for (const item of items) {
        if (seenUrls.has(item.sourceUrl)) continue;
        seenUrls.add(item.sourceUrl);
        allItems.push(item);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn("Google News RSS timed out for:", query);
      } else {
        console.error("Google News RSS error:", err);
      }
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  return allItems.slice(0, maxResults);
}

/**
 * シンプルなRSS XMLパーサー（Edge Runtime対応・DOMParser不要）
 */
function parseRssXml(xml: string, searchQuery: string): TrendItem[] {
  const items: TrendItem[] = [];

  // <item>...</item> をすべて抽出
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];

    const title = extractXmlTag(itemXml, "title");
    const link = extractXmlTag(itemXml, "link");
    const pubDate = extractXmlTag(itemXml, "pubDate");
    const source = extractXmlTag(itemXml, "source");

    if (!title || !link) continue;

    const id = `gnews_${hashString(link)}`;

    items.push({
      id,
      source: "gdelt", // Google NewsもニュースソースなのでUIではニュースアイコン表示
      sourceUrl: link,
      title: title,
      titleJa: title, // 日本語ニュースなのでそのまま
      summary: source ? `出典: ${source}` : "",
      summaryJa: source ? `出典: ${source}` : "",
      category: "その他",
      relevanceScore: 0,
      trendScore: 0,
      combinedScore: 0,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      keywords: extractYouTubeKeywords(title, searchQuery),
      matchedThemeIds: [],
      language: "ja",
      used: false,
      metadata: {
        source: source || "Google News",
        searchQuery,
      },
    });
  }

  return items;
}

function extractXmlTag(xml: string, tag: string): string {
  // CDATA対応
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i");
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"') : "";
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
