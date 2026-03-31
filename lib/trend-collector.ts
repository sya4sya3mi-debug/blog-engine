// ==========================================
// BlogEngine V2 - Trend Collection Orchestrator
// GDELT + YouTube + PubMed を並列収集・重複排除・スコアリング
// ==========================================

import {
  TrendItem,
  TrendCollectionResult,
  TrendCategory,
  CATEGORY_KEYWORDS,
} from "./trend-types";
import { searchGdelt } from "./gdelt";
import { searchYouTube, searchGoogleNews } from "./youtube";
import { searchPubMed } from "./pubmed";
import { BEAUTY_GENRE } from "./config";

interface CollectorConfig {
  anthropicApiKey?: string;
  youtubeApiKey?: string;
  ncbiApiKey?: string;
  skipTranslation?: boolean; // 手動実行時は翻訳スキップ（高速化）
}

/**
 * 全ソースから美容トレンドを収集・スコアリング
 */
export async function collectBeautyTrends(
  config: CollectorConfig
): Promise<TrendCollectionResult> {
  const errors: string[] = [];
  const startTime = Date.now();

  // 4つのAPIを並列実行（YouTube APIキーがなければGoogle Newsで代替）
  const ytKey = config.youtubeApiKey || "";
  const hasYoutubeKey = ytKey.length > 0;
  console.log(`[Trend] YouTube key present: ${hasYoutubeKey} (length: ${ytKey.length})`);

  const [gdeltResult, youtubeResult, pubmedResult, googleNewsResult] =
    await Promise.allSettled([
      searchGdelt({ maxResults: 30, timespanDays: 7 }),
      hasYoutubeKey
        ? searchYouTube(config.youtubeApiKey!, { maxResultsPerQuery: 5 })
        : Promise.resolve([] as TrendItem[]),
      searchPubMed({
        maxResults: 15,
        recentDays: 30,
        apiKey: config.ncbiApiKey,
      }),
      searchGoogleNews({ maxResults: 30 }), // 常に実行（日本語ニュース）
    ]);

  // 結果を収集
  let allItems: TrendItem[] = [];

  if (gdeltResult.status === "fulfilled") {
    allItems.push(...gdeltResult.value);
    console.log(`[Trend] GDELT: ${gdeltResult.value.length} items`);
  } else {
    errors.push(`GDELT: ${gdeltResult.reason}`);
  }

  if (youtubeResult.status === "fulfilled" && youtubeResult.value.length > 0) {
    allItems.push(...youtubeResult.value);
    console.log(`[Trend] YouTube: ${youtubeResult.value.length} items`);
  } else if (youtubeResult.status === "rejected") {
    errors.push(`YouTube: ${youtubeResult.reason}`);
  }

  if (pubmedResult.status === "fulfilled") {
    allItems.push(...pubmedResult.value);
    console.log(`[Trend] PubMed: ${pubmedResult.value.length} items`);
  } else {
    errors.push(`PubMed: ${pubmedResult.reason}`);
  }

  if (googleNewsResult.status === "fulfilled") {
    allItems.push(...googleNewsResult.value);
    console.log(`[Trend] Google News: ${googleNewsResult.value.length} items`);
  } else {
    errors.push(`Google News: ${googleNewsResult.reason}`);
  }

  const collected = allItems.length;

  // 重複排除
  allItems = deduplicateItems(allItems);
  const deduplicated = collected - allItems.length;

  // カテゴリ分類
  allItems = allItems.map(categorizeItem);

  // テーママッチング
  allItems = allItems.map(matchThemes);

  // スコアリング
  allItems = allItems.map(scoreItem);

  // スコア降順でソート
  allItems.sort((a, b) => b.combinedScore - a.combinedScore);

  // 英語記事の日本語翻訳（Claude API使用、上位10件のみ）
  if (config.anthropicApiKey && !config.skipTranslation) {
    const englishItems = allItems
      .filter((item) => item.language === "en" && !item.titleJa)
      .slice(0, 15);

    if (englishItems.length > 0) {
      try {
        await translateItems(englishItems, config.anthropicApiKey);
      } catch (err) {
        errors.push(`翻訳エラー: ${err}`);
      }
    }
  }

  console.log(
    `[Trend Collector] ${collected} collected, ${deduplicated} deduped, ${allItems.length} stored in ${Date.now() - startTime}ms`
  );

  return {
    collected,
    deduplicated,
    stored: allItems.length,
    errors,
    items: allItems,
  };
}

/**
 * 重複排除 - URL完全一致 + タイトル類似度
 */
function deduplicateItems(items: TrendItem[]): TrendItem[] {
  const seen = new Map<string, TrendItem>();
  const result: TrendItem[] = [];

  for (const item of items) {
    // URL完全一致チェック
    if (seen.has(item.sourceUrl)) continue;

    // タイトル類似度チェック（80%以上で重複と判定）
    let isDuplicate = false;
    for (const existing of result) {
      if (titleSimilarity(item.title, existing.title) > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;

    seen.set(item.sourceUrl, item);
    result.push(item);
  }

  return result;
}

/**
 * タイトル類似度（Jaccard係数）
 */
function titleSimilarity(a: string, b: string): number {
  const arrA = normalizeTitle(a).split(/\s+/).filter(Boolean);
  const arrB = normalizeTitle(b).split(/\s+/).filter(Boolean);

  if (arrA.length === 0 || arrB.length === 0) return 0;

  const setB = new Set(arrB);
  let intersection = 0;
  for (let i = 0; i < arrA.length; i++) {
    if (setB.has(arrA[i])) intersection++;
  }

  const uniqueA = new Set(arrA).size;
  const uniqueB = setB.size;
  const union = uniqueA + uniqueB - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\u3040-\u9fff]/g, " ").trim();
}

/**
 * カテゴリ分類
 */
function categorizeItem(item: TrendItem): TrendItem {
  const text = `${item.title} ${item.summary} ${item.keywords.join(" ")}`.toLowerCase();

  let bestCategory: TrendCategory = "その他";
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (category === "その他") continue;

    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category as TrendCategory;
    }
  }

  return { ...item, category: bestCategory };
}

/**
 * 既存テーマとのマッチング
 */
function matchThemes(item: TrendItem): TrendItem {
  const text = `${item.title} ${item.titleJa} ${item.summary} ${item.summaryJa} ${item.keywords.join(" ")}`.toLowerCase();
  const matchedIds: string[] = [];

  for (const theme of BEAUTY_GENRE.subThemes) {
    let matchCount = 0;
    for (const keyword of theme.keywords) {
      // キーワードの各単語が含まれるかチェック
      const words = keyword.split(/\s+/);
      for (const word of words) {
        if (word.length >= 2 && text.includes(word.toLowerCase())) {
          matchCount++;
        }
      }
    }

    // 2単語以上マッチしたらテーマに関連ありと判定
    if (matchCount >= 2) {
      matchedIds.push(theme.id);
    }
  }

  return { ...item, matchedThemeIds: matchedIds };
}

/**
 * スコアリング
 */
function scoreItem(item: TrendItem): TrendItem {
  // --- relevanceScore: 美容キーワード一致度 ---
  let relevance = 0;
  const allKeywords = BEAUTY_GENRE.subThemes.flatMap((t) => t.keywords);
  const text = `${item.title} ${item.titleJa} ${item.summary} ${item.keywords.join(" ")}`.toLowerCase();

  for (const kw of allKeywords) {
    const words = kw.split(/\s+/);
    for (const w of words) {
      if (w.length >= 2 && text.includes(w.toLowerCase())) {
        relevance += 5;
      }
    }
  }
  // テーママッチボーナス
  relevance += item.matchedThemeIds.length * 10;
  relevance = Math.min(100, relevance);

  // --- trendScore: 鮮度 + ソース信頼度 ---
  let trend = 0;

  // 鮮度スコア
  const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60);
  if (ageHours < 24) trend += 50;
  else if (ageHours < 48) trend += 40;
  else if (ageHours < 72) trend += 30;
  else if (ageHours < 168) trend += 20; // 1週間以内
  else trend += 10;

  // ソース信頼度ボーナス
  switch (item.source) {
    case "pubmed":
      trend += 30; // 学術論文は信頼度が高い
      break;
    case "youtube":
      trend += 25; // レビュー動画は実用的
      break;
    case "gdelt":
      trend += 20; // ニュースは速報性
      break;
  }

  trend = Math.min(100, trend);

  // --- combinedScore ---
  const combined = Math.round(relevance * 0.6 + trend * 0.4);

  return {
    ...item,
    relevanceScore: relevance,
    trendScore: trend,
    combinedScore: combined,
  };
}

/**
 * 英語タイトル/サマリーをClaudeで日本語翻訳
 */
async function translateItems(
  items: TrendItem[],
  apiKey: string
): Promise<void> {
  if (items.length === 0) return;

  const titlesToTranslate = items.map(
    (item, i) => `${i + 1}. ${item.title}`
  );

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `以下の英語の美容関連タイトルを日本語に翻訳してください。
各タイトルを番号付きで、翻訳のみを返してください。余計な説明は不要です。

${titlesToTranslate.join("\n")}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error(`Translation API error: ${res.status}`);
      return;
    }

    const data = await res.json();
    const content =
      data.content?.[0]?.text || "";

    // 翻訳結果をパース
    const lines = content.split("\n").filter((l: string) => l.trim());
    for (let i = 0; i < Math.min(items.length, lines.length); i++) {
      const line = lines[i].replace(/^\d+\.\s*/, "").trim();
      if (line) {
        items[i].titleJa = line;
        items[i].summaryJa = line; // サマリーもタイトルの翻訳で代替
      }
    }
  } catch (err) {
    console.error("Translation error:", err);
  }
}
