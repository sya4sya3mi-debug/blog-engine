// ==========================================
// BlogEngine V2 - PubMed E-utilities Client
// 美容成分・施術のエビデンス収集（無料）
// レート制限: 3req/秒（APIキーなし）, 10req/秒（APIキーあり）
// ==========================================

import { TrendItem } from "./trend-types";

interface ESearchResult {
  esearchresult?: {
    idlist?: string[];
    count?: string;
  };
}

interface ESummaryResult {
  result?: Record<
    string,
    {
      uid: string;
      title: string;
      sortpubdate: string;
      source: string;
      authors?: { name: string }[];
      pubtype?: string[];
    }
  >;
}

// 美容・皮膚科関連の検索クエリ
const PUBMED_QUERIES = [
  '"cosmetic dermatology"[MeSH] OR "skin rejuvenation"',
  '"retinoid" AND "skin aging"',
  '"hyaluronic acid" AND ("skin" OR "dermal filler")',
  '"laser therapy" AND "skin" AND "cosmetic"',
  '"sunscreen" OR "photoprotection" AND "skin"',
];

/**
 * PubMedから美容関連論文を検索
 */
export async function searchPubMed(options?: {
  maxResults?: number;
  recentDays?: number;
  apiKey?: string;
}): Promise<TrendItem[]> {
  const maxResults = options?.maxResults ?? 10;
  const recentDays = options?.recentDays ?? 14; // 直近2週間
  const apiKey = options?.apiKey;
  const allItems: TrendItem[] = [];
  const seenIds = new Set<string>();
  const requestDelay = apiKey ? 100 : 350; // APIキーありなら高速化

  for (const query of PUBMED_QUERIES) {
    try {
      // Step 1: ESearch - IDリストを取得
      const ids = await esearch(query, recentDays, apiKey);
      if (ids.length === 0) continue;

      await new Promise((r) => setTimeout(r, requestDelay));

      // Step 2: ESummary - 詳細情報を取得
      const newIds = ids.filter((id) => !seenIds.has(id));
      if (newIds.length === 0) continue;

      const summaries = await esummary(newIds.slice(0, 5), apiKey);

      for (const summary of summaries) {
        if (seenIds.has(summary.uid)) continue;
        seenIds.add(summary.uid);
        allItems.push(normalizePubMedItem(summary, query));
      }
    } catch (err) {
      console.error("PubMed fetch error:", err);
    }

    await new Promise((r) => setTimeout(r, requestDelay));
  }

  return allItems.slice(0, maxResults);
}

/**
 * PubMed ESearch: キーワードで論文IDを検索
 */
async function esearch(
  query: string,
  recentDays: number,
  apiKey?: string
): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmax: "5",
    sort: "date",
    retmode: "json",
    datetype: "pdat",
    reldate: String(recentDays),
  });
  if (apiKey) params.set("api_key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`PubMed ESearch error: ${res.status}`);
      return [];
    }

    const data: ESearchResult = await res.json();
    return data.esearchresult?.idlist ?? [];
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("PubMed ESearch timed out");
    }
    return [];
  }
}

/**
 * PubMed ESummary: 論文IDから詳細情報を取得
 */
async function esummary(
  ids: string[],
  apiKey?: string
): Promise<
  {
    uid: string;
    title: string;
    sortpubdate: string;
    source: string;
    authors: string[];
  }[]
> {
  const params = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
  });
  if (apiKey) params.set("api_key", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${params}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`PubMed ESummary error: ${res.status}`);
      return [];
    }

    const data: ESummaryResult = await res.json();
    if (!data.result) return [];

    const results: {
      uid: string;
      title: string;
      sortpubdate: string;
      source: string;
      authors: string[];
    }[] = [];

    for (const id of ids) {
      const item = data.result[id];
      if (!item || !item.title) continue;

      results.push({
        uid: item.uid,
        title: item.title,
        sortpubdate: item.sortpubdate || "",
        source: item.source || "",
        authors: (item.authors || []).map((a) => a.name).slice(0, 3),
      });
    }

    return results;
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("PubMed ESummary timed out");
    }
    return [];
  }
}

/**
 * PubMed論文データをTrendItemに正規化
 */
function normalizePubMedItem(
  item: {
    uid: string;
    title: string;
    sortpubdate: string;
    source: string;
    authors: string[];
  },
  searchQuery: string
): TrendItem {
  const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`;

  return {
    id: `pm_${item.uid}`,
    source: "pubmed",
    sourceUrl: pubmedUrl,
    title: item.title,
    titleJa: "", // 後でClaudeで翻訳
    summary: `${item.source} | ${item.authors.join(", ")}`,
    summaryJa: "",
    category: "その他", // 後でカテゴリ分類
    relevanceScore: 0,
    trendScore: 0,
    combinedScore: 0,
    publishedAt: parsePubMedDate(item.sortpubdate),
    collectedAt: new Date().toISOString(),
    keywords: extractPubMedKeywords(item.title, searchQuery),
    matchedThemeIds: [],
    language: "en",
    used: false,
    metadata: {
      journal: item.source,
      authors: item.authors,
      pmid: item.uid,
    },
  };
}

/**
 * PubMed論文タイトルからキーワード抽出
 */
function extractPubMedKeywords(title: string, query: string): string[] {
  const lower = title.toLowerCase();
  const terms = [
    "retinol", "retinoid", "hyaluronic", "collagen", "niacinamide",
    "vitamin c", "ascorbic", "sunscreen", "photoprotection", "laser",
    "peel", "botulinum", "filler", "skin aging", "wrinkle", "acne",
    "melanin", "pigmentation", "moisturizer", "ceramide", "peptide",
    "antioxidant", "anti-aging", "rejuvenation", "dermal",
  ];
  return terms.filter((t) => lower.includes(t));
}

/**
 * PubMed日付文字列をISO形式に変換
 * 形式: "2026/03/22 00:00" → ISO string
 */
function parsePubMedDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    return new Date(dateStr.replace(/\//g, "-")).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
