// ==========================================
// BlogEngine V2 - Rakuten Product Search API
// 楽天商品検索 & 収益最適化アルゴリズム
// ==========================================

export interface RakutenProduct {
  itemName: string;
  catchcopy: string;           // キャッチコピー
  itemCode: string;            // 商品コード（レビュー取得用）
  itemPrice: number;
  itemUrl: string;
  affiliateUrl: string;
  shopName: string;
  imageUrl: string;
  reviewAverage: number;
  reviewCount: number;
  itemCaption: string;         // 商品説明文（販売元の公式情報）
  // 収益最大化フィールド
  affiliateRate: number;       // アフィリエイト料率（%）
  pointRate: number;           // ポイント倍率
  pointCampaignActive: boolean; // ポイントキャンペーン中か
  freeShipping: boolean;       // 送料無料か
  nextDayDelivery: boolean;    // あす楽対応か
  shopOfTheYear: boolean;      // ショップ・オブ・ザ・イヤー受賞店か
  onSale: boolean;             // セール中か
  saleEndTime: string;         // セール終了時刻
  giftAvailable: boolean;      // ギフト対応か
  inStock: boolean;            // 在庫ありか
  // 収益スコア
  profitScore: number;
  estimatedCommission: number;
  genreId: string;
}

interface RakutenApiItem {
  Item: {
    itemName: string;
    catchcopy: string;         // キャッチコピー（販促メッセージ）
    itemCode: string;          // 商品コード
    itemPrice: number;
    itemUrl: string;
    affiliateUrl: string;
    shopName: string;
    shopCode: string;
    mediumImageUrls: { imageUrl: string }[];
    reviewAverage: number;
    reviewCount: number;
    genreId: string;
    itemCaption: string;       // 商品説明文（販売元が記載）
    shopUrl: string;
    // 収益最大化に重要なフィールド
    affiliateRate: number;     // アフィリエイト料率（%）
    pointRate: number;         // ポイント倍率（2-10倍）
    pointRateStartTime: string;
    pointRateEndTime: string;
    postageFlag: number;       // 0=送料込み, 1=送料別
    asurakuFlag: number;       // 0=あす楽なし, 1=あす楽対応
    shopOfTheYearFlag: number; // 0=なし, 1=ショップ・オブ・ザ・イヤー
    startTime: string;         // セール開始
    endTime: string;           // セール終了
    giftFlag: number;          // ギフト対応
    availability: number;      // 0=在庫なし, 1=在庫あり
    creditCardFlag: number;    // クレジットカード対応
  };
}

interface RakutenApiResponse {
  Items: RakutenApiItem[];
  count: number;
  hits: number;
}

// ===== 美容系ジャンルIDホワイトリスト（新API 2026年〜） =====
// 新APIではgenreIdパラメータが無視されるため、結果をサーバーサイドでフィルタリング
const BEAUTY_GENRE_WHITELIST = new Set([
  // スキンケア・基礎化粧品
  "216348", // 美容液
  "216307", // 化粧水・ローション
  "216671", // ボディクリーム
  "216670", // ボディローション
  "405061", // クレンジング
  "503054", // 日焼け止め
  "567442", // 化粧水（別カテゴリ）
  "200343", // スキンケア基礎
  // メイク・コスメ
  "216349", // ファンデーション
  "216350", // 口紅・リップ
  "216351", // アイシャドウ
  "216352", // マスカラ
  "210619", // メイクアップ
  "405063", // ベースメイク
  "405062", // ポイントメイク
  // ヘアケア
  "405409", // シャンプー
  "567233", // シャンプー（別カテゴリ）
  "210677", // ヘアケア・スタイリング
  "216673", // トリートメント
  "210678", // ヘアカラー
  // ボディケア
  "216669", // ボディケア
  "216672", // ボディソープ
  "216674", // ハンドケア
  "503099", // デリケートゾーンケア
  // サプリメント・健康食品
  "567602", // マルチビタミン
  "567607", // プラセンタ
  "402594", // 酵素サプリ
  "567604", // コラーゲン
  "567608", // 美容サプリ
  "100938", // サプリメント（旧ID互換）
  // 美容家電・美顔器
  "216131", // 美顔器
  "503190", // 美容家電
  "405068", // 美容機器
]);

// 美容系ジャンルかどうか判定（ホワイトリスト＋商品名キーワード判定）
function isBeautyProduct(genreId: string, itemName: string): boolean {
  // ホワイトリストに含まれる
  if (BEAUTY_GENRE_WHITELIST.has(genreId)) return true;

  // 商品名に美容系キーワードが含まれる場合も許可
  const beautyKeywords = [
    "美容液", "化粧水", "クリーム", "乳液", "洗顔", "クレンジング",
    "美白", "保湿", "スキンケア", "コスメ", "ファンデ", "リップ",
    "日焼け止め", "UV", "シャンプー", "トリートメント", "ヘアケア",
    "美顔器", "サプリ", "コラーゲン", "ヒアルロン酸", "セラミド",
    "レチノール", "ビタミンC", "ナイアシンアミド", "ピーリング",
    "毛穴", "ニキビ", "シワ", "たるみ", "エイジング", "アンチエイジング",
    "脱毛", "除毛", "ボディクリーム", "ボディケア", "ハンドクリーム",
    "パック", "マスク", "導入", "ブースター", "オールインワン",
  ];

  // 非美容キーワード（これらが含まれる場合は除外）
  const excludeKeywords = [
    "ジャケット", "Tシャツ", "パンツ", "スカート", "ワンピース",
    "コート", "ブラウス", "セーター", "ニット", "デニム",
    "スニーカー", "ブーツ", "サンダル", "バッグ", "財布",
    "イヤホン", "スマホ", "ケーブル", "充電", "PC",
    "食品", "米", "肉", "魚", "野菜", "フルーツ",
    "キャミソール", "インナー", "下着", "ブラジャー",
    "カーテン", "ラグ", "家具", "収納",
  ];

  const nameContainsExclude = excludeKeywords.some((kw) => itemName.includes(kw));
  if (nameContainsExclude) return false;

  const nameContainsBeauty = beautyKeywords.some((kw) => itemName.includes(kw));
  return nameContainsBeauty;
}

// デフォルト報酬率
const DEFAULT_COMMISSION_RATE = 3; // %

// ===== テーマ → 楽天ジャンルID マッピング =====
// 美容系テーマに対応する楽天市場のジャンルIDで絞り込み
// 楽天ジャンル: 100371=スキンケア, 100372=メイク, 100373=ヘアケア, 100374=ボディケア
//   551176=日焼け止め, 100938=サプリ, 216131=美容家電, 100375=美容・コスメ(親)
// ===== テーマ → 楽天ジャンルID マッピング（V3: 売れ筋ベース） =====
// 方針: キーワード検索ではなく「テーマ専用キーワード × レビュー数降順ソート」で
// 既に売れている（=CVRが実証済み）商品を優先取得
interface ThemeConfig {
  keywords: string[];           // 楽天検索用キーワード（テーマに最適化）
  relevanceTerms: string[];     // 関連性判定用（商品名にこれが含まれれば関連あり）
  priceRange: { min: number; max: number }; // 収益最適価格帯
}

// V3: 6テーマに対応した楽天検索設定
const THEME_GENRE_MAP: Record<string, ThemeConfig> = {
  "bihaku-shimi": {
    keywords: ["美白 美容液 シミ", "トラネキサム酸 化粧水"],
    relevanceTerms: ["美白", "シミ", "くすみ", "トーンアップ", "ブライトニング", "ハイドロキノン", "ビタミンC", "トラネキサム酸", "色素沈着"],
    priceRange: { min: 2000, max: 10000 },
  },
  "keana-nikibi": {
    keywords: ["毛穴ケア 美容液 ビタミンC", "ニキビケア 化粧水 薬用"],
    relevanceTerms: ["毛穴", "ニキビ", "角栓", "黒ずみ", "ピーリング", "酵素洗顔", "サリチル酸", "クレンジング", "角質"],
    priceRange: { min: 1000, max: 5000 },
  },
  "aging-care": {
    keywords: ["エイジングケア 美容液 レチノール", "シワ改善 クリーム"],
    relevanceTerms: ["エイジング", "シワ", "ハリ", "たるみ", "レチノール", "ナイアシンアミド", "ペプチド", "コラーゲン", "リンクル", "ほうれい線"],
    priceRange: { min: 2000, max: 15000 },
  },
  "datsumo": {
    keywords: ["脱毛 アフターケア 保湿", "除毛クリーム 女性 人気"],
    relevanceTerms: ["脱毛", "除毛", "ムダ毛", "抑毛", "アフターケア", "保湿"],
    priceRange: { min: 1000, max: 8000 },
  },
  "biyou-clinic": {
    keywords: ["ドクターズコスメ 美容液", "美顔器 EMS リフトアップ"],
    relevanceTerms: ["ドクターズ", "医薬部外品", "薬用", "美顔器", "EMS", "リフトアップ", "IPL", "LED"],
    priceRange: { min: 3000, max: 30000 },
  },
  "hair-care": {
    keywords: ["アミノ酸 シャンプー 女性", "ヘアオイル ダメージケア"],
    relevanceTerms: ["シャンプー", "トリートメント", "ヘアオイル", "ヘアケア", "スカルプ", "髪", "頭皮", "白髪", "ダメージ"],
    priceRange: { min: 1500, max: 8000 },
  },
};

export interface SearchOptions {
  keyword?: string;
  themeId?: string;        // テーマID（ジャンル自動絞り込み）
  minPrice?: number;       // 最低価格
  maxPrice?: number;       // 最高価格
  maxResults?: number;     // 最終表示件数
  expandKeywords?: boolean; // テーマ別キーワード展開
}

/**
 * テーマ関連性スコアを計算
 * 商品名にテーマのrelevanceTermsが含まれるかチェック
 */
function calculateThemeRelevance(itemName: string, themeId: string): number {
  const config = THEME_GENRE_MAP[themeId];
  if (!config) return 50; // テーマ不明なら中立

  const nameLower = itemName.toLowerCase();
  let matchCount = 0;
  for (const term of config.relevanceTerms) {
    if (nameLower.includes(term.toLowerCase())) {
      matchCount++;
    }
  }
  // 0マッチ=0, 1マッチ=50, 2マッチ=75, 3+マッチ=100
  if (matchCount === 0) return 0;
  if (matchCount === 1) return 50;
  if (matchCount === 2) return 75;
  return 100;
}

/**
 * 収益スコアを計算する（V2: 購買インセンティブ全要素反映）
 * スコア = 推定報酬 × 購買実績 × 信頼性 × 価格帯 × CVRブースト
 *
 * CVRブースト要因:
 *  - 送料無料: +30%（送料無料は最大のCVR向上要因）
 *  - あす楽: +20%（即配は衝動買いを促進）
 *  - ポイント倍率: +10%〜50%（ポイント高倍率=楽天ユーザーに訴求力大）
 *  - セール中: +25%（期間限定は緊急性を生む）
 *  - ショップ・オブ・ザ・イヤー: +15%（信頼性ボーナス）
 *  - 高アフィリエイト料率: 直接反映（8%の商品 > 3%の商品）
 */
function calculateProfitScore(
  item: RakutenApiItem["Item"],
  defaultCommissionRate: number,
): { profitScore: number; estimatedCommission: number; actualRate: number } {
  // アフィリエイト料率（API返却値があればそちらを優先、なければデフォルト）
  const rate = item.affiliateRate > 0 ? item.affiliateRate : defaultCommissionRate;
  const price = item.itemPrice;

  // 推定報酬額（1件あたり）
  const estimatedCommission = Math.round(price * (rate / 100));

  // 購買実績指数（レビュー数の対数 → 大量レビュー=売れ筋）
  const purchaseIndex = Math.log10(Math.max(item.reviewCount, 1) + 1);

  // 信頼性指数（レビュー評価 3.5以上でボーナス）
  const trustIndex = item.reviewAverage >= 3.5 ? item.reviewAverage / 5 : item.reviewAverage / 10;

  // 価格帯ボーナス（3000円〜15000円が美容系のスイートスポット）
  let priceBonus = 1.0;
  if (price >= 3000 && price <= 15000) {
    priceBonus = 1.5;
  } else if (price > 15000 && price <= 30000) {
    priceBonus = 1.2;
  } else if (price < 1000) {
    priceBonus = 0.5;
  }

  // CVRブースト（購買を後押しする要素を加算）
  let cvrBoost = 1.0;
  if (item.postageFlag === 0) cvrBoost += 0.30;       // 送料無料
  if (item.asurakuFlag === 1) cvrBoost += 0.20;       // あす楽
  if (item.pointRate >= 2) cvrBoost += 0.10 * Math.min(item.pointRate, 10);  // ポイント倍率
  if (item.startTime && item.endTime) cvrBoost += 0.25; // セール中
  if (item.shopOfTheYearFlag === 1) cvrBoost += 0.15; // ショップ・オブ・ザ・イヤー
  if (item.availability === 0) cvrBoost = 0;          // 在庫なし → スコア0

  // 総合収益スコア
  const profitScore = estimatedCommission * purchaseIndex * trustIndex * priceBonus * cvrBoost;

  return { profitScore: Math.round(profitScore * 100) / 100, estimatedCommission, actualRate: rate };
}

/**
 * 楽天商品検索API（V3: 売れ筋ベース収益最適化）
 *
 * アプローチ:
 * 1. テーマ専用キーワード × レビュー数降順ソートで「既に売れている商品」を取得
 * 2. テーマ関連性フィルタで無関係な商品を除外
 * 3. 収益スコア × テーマ関連度で最終ランキング
 * 4. ユーザー入力キーワードは「絞り込みフィルタ」として使用
 */
export async function searchRakutenProducts(
  appId: string,
  affiliateId: string,
  keyword: string,
  hits: number = 5,
  accessKey?: string,
  options?: Partial<SearchOptions>,
): Promise<RakutenProduct[]> {
  const themeId = options?.themeId;
  const themeConfig = themeId ? THEME_GENRE_MAP[themeId] : undefined;
  const minPrice = options?.minPrice ?? themeConfig?.priceRange?.min ?? 0;
  const maxPrice = options?.maxPrice ?? themeConfig?.priceRange?.max;
  const maxResults = options?.maxResults ?? hits;

  // ===== 検索キーワード戦略（テーマ優先） =====
  const searchKeywords: string[] = [];

  // テーマがある場合: テーマ専用キーワードを最優先
  if (themeConfig?.keywords) {
    searchKeywords.push(...themeConfig.keywords);
  }

  // ユーザー入力キーワード: 3文字以上のみ追加（「あ」などの無意味入力を排除）
  if (keyword && keyword.length >= 3 && !searchKeywords.includes(keyword)) {
    searchKeywords.push(keyword);
  }

  // テーマもキーワードもない場合のフォールバック
  if (searchKeywords.length === 0) {
    if (keyword && keyword.length >= 2) {
      searchKeywords.push(keyword);
    } else {
      searchKeywords.push("美容液 おすすめ");
    }
  }

  // 最大2キーワードに制限（タイムアウト対策）
  const keywordsToSearch = searchKeywords.slice(0, 2);
  const allProducts: RakutenProduct[] = [];

  for (const kw of keywordsToSearch) {
    try {
      // レビュー数降順ソート = 売れ筋順
      const products = await fetchRakutenApi(appId, affiliateId, kw, 30, accessKey, {
        minPrice,
        maxPrice,
        sort: "-reviewCount", // 売れ筋順（レビュー数降順）
      });
      allProducts.push(...products);
    } catch (e) {
      console.error(`[Rakuten] キーワード「${kw}」の検索に失敗:`, e);
    }

    if (keywordsToSearch.length > 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // 重複排除（商品URL基準）
  const seen = new Set<string>();
  const uniqueProducts = allProducts.filter((p) => {
    if (seen.has(p.itemUrl)) return false;
    seen.add(p.itemUrl);
    return true;
  });

  // ===== テーマ関連性フィルタ =====
  let filtered = uniqueProducts;

  if (themeId && themeConfig) {
    // テーマ指定あり → 関連性スコアが0の商品を除外
    filtered = filtered.filter((p) => {
      const relevance = calculateThemeRelevance(p.itemName, themeId);
      return relevance > 0;
    });
  } else {
    // テーマなし → 従来の美容フィルタのみ
    filtered = filtered.filter((p) => isBeautyProduct(p.genreId, p.itemName));
  }

  // ユーザー入力キーワードが3文字以上なら追加絞り込み
  if (keyword && keyword.length >= 3 && themeConfig) {
    const keywordFiltered = filtered.filter((p) =>
      p.itemName.toLowerCase().includes(keyword.toLowerCase())
    );
    // 絞り込み結果が3件以上あれば適用、少なすぎれば無視
    if (keywordFiltered.length >= 3) {
      filtered = keywordFiltered;
    }
  }

  // 最低価格フィルタ
  const priceFiltered = filtered.filter((p) => p.itemPrice >= minPrice);

  // ===== 最終スコア: 収益スコア × テーマ関連度ボーナス =====
  const scoredProducts = priceFiltered.map((p) => {
    let finalScore = p.profitScore;

    if (themeId) {
      const relevance = calculateThemeRelevance(p.itemName, themeId);
      // 関連度に応じたボーナス/ペナルティ
      const themeBonus = relevance >= 75 ? 2.0 : relevance >= 50 ? 1.2 : 0.5;
      finalScore = finalScore * themeBonus;
    }

    // レビュー数による売れ筋ボーナス（既に売れている = CVR実証済み）
    const salesBonus =
      p.reviewCount >= 1000 ? 2.0 :
      p.reviewCount >= 500 ? 1.5 :
      p.reviewCount >= 100 ? 1.2 : 1.0;
    finalScore = finalScore * salesBonus;

    return { ...p, profitScore: Math.round(finalScore * 100) / 100 };
  });

  // 最終スコアで降順ソート
  scoredProducts.sort((a, b) => b.profitScore - a.profitScore);

  // 上位N件を返す
  return scoredProducts.slice(0, maxResults);
}

/**
 * 楽天API低レベル呼び出し
 */
async function fetchRakutenApi(
  appId: string,
  affiliateId: string,
  keyword: string,
  hits: number,
  accessKey?: string,
  filters?: { minPrice?: number; maxPrice?: number; sort?: string },
): Promise<RakutenProduct[]> {
  const params = new URLSearchParams({
    applicationId: appId,
    affiliateId: affiliateId,
    keyword: keyword,
    hits: String(Math.min(hits, 30)), // API最大30件
    sort: filters?.sort || "-reviewCount", // デフォルト: 売れ筋順
    format: "json",
    imageFlag: "1", // 画像ありのみ
  });

  if (accessKey) {
    params.set("accessKey", accessKey);
  }

  // 価格フィルタ（APIレベル）
  if (filters?.minPrice && filters.minPrice > 0) {
    params.set("minPrice", String(filters.minPrice));
  }
  if (filters?.maxPrice && filters.maxPrice > 0) {
    params.set("maxPrice", String(filters.maxPrice));
  }

  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601?${params}`;

  const res = await fetch(url, {
    headers: {
      Origin: "https://blog-engine-phi.vercel.app",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`楽天API エラー (${res.status}): ${body}`);
  }

  const data: RakutenApiResponse = await res.json();

  const now = Date.now();

  return data.Items.map((item) => {
    const genreId = String(item.Item.genreId);
    const defaultRate = BEAUTY_GENRE_WHITELIST.has(genreId) ? 4 : DEFAULT_COMMISSION_RATE;
    const { profitScore, estimatedCommission, actualRate } = calculateProfitScore(item.Item, defaultRate);

    // ポイントキャンペーン判定
    let pointCampaignActive = false;
    if (item.Item.pointRate >= 2 && item.Item.pointRateStartTime && item.Item.pointRateEndTime) {
      const start = new Date(item.Item.pointRateStartTime).getTime();
      const end = new Date(item.Item.pointRateEndTime).getTime();
      pointCampaignActive = now >= start && now <= end;
    }

    // セール判定
    let onSale = false;
    let saleEndTime = "";
    if (item.Item.startTime && item.Item.endTime) {
      const start = new Date(item.Item.startTime).getTime();
      const end = new Date(item.Item.endTime).getTime();
      onSale = now >= start && now <= end;
      saleEndTime = onSale ? item.Item.endTime : "";
    }

    return {
      itemName: item.Item.itemName,
      catchcopy: item.Item.catchcopy || "",
      itemCode: item.Item.itemCode || "",
      itemPrice: item.Item.itemPrice,
      itemUrl: item.Item.itemUrl,
      affiliateUrl: item.Item.affiliateUrl,
      shopName: item.Item.shopName,
      imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl || "",
      reviewAverage: item.Item.reviewAverage,
      reviewCount: item.Item.reviewCount,
      itemCaption: item.Item.itemCaption || "",
      affiliateRate: actualRate,
      pointRate: item.Item.pointRate || 1,
      pointCampaignActive,
      freeShipping: item.Item.postageFlag === 0,
      nextDayDelivery: item.Item.asurakuFlag === 1,
      shopOfTheYear: item.Item.shopOfTheYearFlag === 1,
      onSale,
      saleEndTime,
      giftAvailable: item.Item.giftFlag === 1,
      inStock: item.Item.availability !== 0,
      profitScore,
      estimatedCommission,
      genreId,
    };
  });
}

/**
 * 楽天商品からアフィリエイトHTMLを生成する（収益情報付き）
 */
// ==========================================
// 楽天レビュー検索API
// ==========================================

export interface RakutenReview {
  reviewer: string;       // ニックネーム
  rating: number;         // 評価（1-5）
  title: string;          // レビュータイトル
  body: string;           // レビュー本文
}

/**
 * 楽天商品のレビューを取得する
 * IchibaItem/ReviewSearch API を使用
 */
export async function fetchRakutenReviews(
  appId: string,
  itemCode: string,
  maxReviews: number = 5,
  accessKey?: string,
): Promise<RakutenReview[]> {
  const params = new URLSearchParams({
    applicationId: appId,
    itemCode,
    sort: "-time",
    hits: String(Math.min(maxReviews, 30)),
    format: "json",
  });
  if (accessKey) params.set("accessKey", accessKey);

  const url = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/ReviewSearch/20220601?${params}`;

  const res = await fetch(url, {
    headers: { Origin: "https://blog-engine-phi.vercel.app" },
  });
  if (!res.ok) return []; // レビュー取得失敗は無視

  const data = await res.json() as { reviews?: { review: { reviewer: string; rating: number; title: string; body: string } }[] };
  if (!data.reviews) return [];

  return data.reviews.map((r) => ({
    reviewer: r.review.reviewer || "匿名",
    rating: r.review.rating,
    title: r.review.title || "",
    body: r.review.body || "",
  }));
}

/**
 * 商品名で検索してレビューを取得する（商品コード不明時のフォールバック）
 */
export async function searchAndFetchReviews(
  appId: string,
  affiliateId: string,
  productName: string,
  maxReviews: number = 5,
  accessKey?: string,
): Promise<{ product: RakutenProduct | null; reviews: RakutenReview[] }> {
  try {
    const products = await searchRakutenProducts(appId, affiliateId, productName, 1, accessKey, { maxResults: 1 });
    if (products.length === 0) return { product: null, reviews: [] };

    const product = products[0];
    // itemCode を直接使用（APIレスポンスから取得済み）
    const itemCode = product.itemCode;
    if (!itemCode) return { product, reviews: [] };

    const reviews = await fetchRakutenReviews(appId, itemCode, maxReviews, accessKey);

    return { product, reviews };
  } catch {
    return { product: null, reviews: [] };
  }
}

/**
 * レビューをClaudeプロンプト用のテキストに変換する
 */
export function formatReviewsForPrompt(reviews: RakutenReview[]): string {
  if (reviews.length === 0) return "";

  const lines = reviews.slice(0, 5).map((r, i) => {
    const stars = "★".repeat(r.rating) + "☆".repeat(5 - r.rating);
    const bodyShort = r.body.length > 150 ? r.body.slice(0, 150) + "…" : r.body;
    return `口コミ${i + 1}: ${stars}（${r.rating}/5）\n「${bodyShort}」（${r.reviewer}さん）`;
  });

  return `\n【実際の楽天レビュー（参考情報として記事に自然に組み込むこと）】\n${lines.join("\n\n")}

※ 上記は楽天市場の実際の購入者レビューです。記事内で「購入者の口コミでは…」「実際に使った方からは…」のように自然に引用・要約してください。
※ レビュー内容をそのまま丸ごとコピーせず、要約や傾向として活用してください。
※ 口コミ引用後に「※ 個人の感想であり、効果を保証するものではありません」を付記してください。`;
}

/**
 * 商品の公式情報（楽天データ）をClaudeプロンプト用に整形する
 * HTMLタグを除去し、主要情報のみ抽出
 */
export function formatProductSpecsForPrompt(products: RakutenProduct[]): string {
  if (products.length === 0) return "";

  const specs = products.map((p, i) => {
    // 商品説明文からHTMLタグを除去し、先頭500文字に制限
    const cleanCaption = p.itemCaption
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    // 購買インセンティブ情報を組み立て
    const incentives: string[] = [];
    if (p.freeShipping) incentives.push("送料無料");
    if (p.nextDayDelivery) incentives.push("あす楽対応（翌日届く）");
    if (p.pointCampaignActive && p.pointRate >= 2) incentives.push(`ポイント${p.pointRate}倍キャンペーン中`);
    if (p.onSale && p.saleEndTime) incentives.push(`セール中（${p.saleEndTime}まで）`);
    if (p.shopOfTheYear) incentives.push("ショップ・オブ・ザ・イヤー受賞店");
    if (p.giftAvailable) incentives.push("ギフト対応");

    return `商品${i + 1}: ${p.itemName}
${p.catchcopy ? `- キャッチコピー: ${p.catchcopy}` : ""}
- 価格: ¥${p.itemPrice.toLocaleString()}（税込）
- 販売店: ${p.shopName}
- 楽天評価: ★${p.reviewAverage}（${p.reviewCount}件のレビュー）
- アフィリエイト料率: ${p.affiliateRate}%（推定報酬: ¥${p.estimatedCommission}/件）
${incentives.length > 0 ? `- 購入メリット: ${incentives.join(" / ")}` : ""}
${cleanCaption ? `- 販売元の商品説明: ${cleanCaption}` : "- 商品説明: 取得できませんでした"}`;
  });

  return `\n【商品の公式情報（楽天市場のデータ）】
以下は楽天市場から取得した実際の商品データです。記事内の商品紹介ではこの情報のみを使用してください。

${specs.join("\n\n")}

★重要ルール★
- 上記の「販売元の商品説明」に記載されている成分・容量・特徴のみを記事に書いてよい
- 楽天データに記載されていない成分名・容量・効能を絶対に捏造しない
- 不明な情報は「詳細は公式サイトをご確認ください」と記載する
- 価格は上記の楽天価格を「参考価格」として記載する（変動する旨の注記を付ける）

★購買を後押しする情報の活用ルール★
- 「送料無料」「あす楽対応」「ポイント倍率」等の購入メリットは記事内で積極的に言及してよい
- セール中の場合は「期間限定でお得」「○月○日まで」のように緊急性を自然に伝える
- ショップ・オブ・ザ・イヤー受賞店は「楽天の優良ショップ」として信頼性アピールに使ってよい
- ポイント倍率が高い場合は「今なら楽天ポイント○倍」と記事内で触れてよい
- これらの情報は変動するため「記事執筆時点の情報です」と注記を付ける`;
}

export function buildRakutenAffiliateHtml(product: RakutenProduct): string {
  // 購入メリットバッジ
  const badges: string[] = [];
  if (product.freeShipping) badges.push('<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:3px;background:#e8f5e9;color:#2e7d32;font-weight:bold;margin-right:4px;margin-bottom:4px;">送料無料</span>');
  if (product.nextDayDelivery) badges.push('<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:3px;background:#e3f2fd;color:#1565c0;font-weight:bold;margin-right:4px;margin-bottom:4px;">あす楽</span>');
  if (product.pointRate >= 2) badges.push(`<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:3px;background:#fff3e0;color:#e65100;font-weight:bold;margin-right:4px;margin-bottom:4px;">ポイント${product.pointRate}倍</span>`);
  if (product.onSale) badges.push('<span style="display:inline-block;font-size:11px;padding:2px 6px;border-radius:3px;background:#fce4ec;color:#c62828;font-weight:bold;margin-right:4px;margin-bottom:4px;">セール中</span>');
  const badgeHtml = badges.length > 0 ? `<p style="margin:8px 0 0 0;padding:0;line-height:1.8;">${badges.join("")}</p>` : "";

  // WordPress + iPhone Safari 完全互換HTML
  // target="_blank"を使わない（Safariのポップアップブロック回避）
  // onclick でも遷移を保証
  const url = product.affiliateUrl;

  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:500px;margin:20px auto;border:1px solid #dddddd;border-radius:12px;background-color:#fafafa;">
<tr><td align="center" style="padding:16px;">
${product.imageUrl ? `<a href="${url}" rel="nofollow sponsored" style="display:inline-block;"><img src="${product.imageUrl}" alt="${product.itemName}" width="160" style="max-width:100%;height:auto;border-radius:4px;border:0;" /></a><br>` : ""}
<br>
<a href="${url}" rel="nofollow sponsored" style="font-weight:bold;font-size:15px;color:#333333;text-decoration:none;line-height:1.5;">${product.itemName}</a>
<br><br>
<span style="font-size:20px;font-weight:bold;color:#bf0000;">¥${product.itemPrice.toLocaleString()}</span>
<span style="font-size:12px;color:#666666;">（税込）</span>
<br>
<span style="font-size:12px;color:#666666;">${product.shopName}${product.reviewCount > 0 ? ` | ★${product.reviewAverage} (${product.reviewCount}件)` : ""}${product.shopOfTheYear ? " | 優良ショップ" : ""}</span>
<br>
${badges.length > 0 ? badges.join("") + "<br>" : ""}
<br>
<a href="${url}" rel="nofollow sponsored" style="display:inline-block;width:90%;max-width:400px;padding:16px 10px;background-color:#bf0000;color:#ffffff !important;border-radius:8px;font-size:16px;font-weight:bold;text-decoration:none;text-align:center;cursor:pointer;-webkit-tap-highlight-color:rgba(0,0,0,0.1);">楽天市場で見る</a>
<br>
<span style="font-size:10px;color:#999999;">※ 価格は記事執筆時点のものです</span>
</td></tr>
</table>`;
}
