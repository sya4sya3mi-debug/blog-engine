// ==========================================
// BlogEngine V2 - Rakuten Product Search API
// 楽天商品検索 & 収益最適化アルゴリズム
// ==========================================

export interface RakutenProduct {
  itemName: string;
  itemPrice: number;
  itemUrl: string;
  affiliateUrl: string;
  shopName: string;
  imageUrl: string;
  reviewAverage: number;
  reviewCount: number;
  // 収益最適化フィールド
  profitScore: number;       // 収益スコア
  estimatedCommission: number; // 推定報酬額（円）
  genreId: string;
}

interface RakutenApiItem {
  Item: {
    itemName: string;
    itemPrice: number;
    itemUrl: string;
    affiliateUrl: string;
    shopName: string;
    mediumImageUrls: { imageUrl: string }[];
    reviewAverage: number;
    reviewCount: number;
    genreId: string;
  };
}

interface RakutenApiResponse {
  Items: RakutenApiItem[];
  count: number;
  hits: number;
}

// ===== 楽天アフィリエイト報酬率テーブル（2026年3月現在） =====
// ジャンルごとの報酬率(%)
const COMMISSION_RATES: Record<string, number> = {
  // 美容・コスメ・香水: 4%
  "100371": 4,  // スキンケア
  "100372": 4,  // ベースメイク・メイクアップ
  "100373": 4,  // ヘアケア・スタイリング
  "100374": 4,  // ボディケア
  "100375": 4,  // 美容・コスメ・香水（親）
  "551176": 4,  // 日焼け止め・UVケア
  // ダイエット・健康: 4%
  "100938": 4,  // サプリメント
  "100939": 4,  // ダイエット
  // 医薬品・コンタクト: 4%
  "564500": 4,
  // デフォルト
  default: 3,
};

// ===== テーマ → 楽天ジャンルID マッピング =====
// 美容系テーマに対応する楽天市場のジャンルIDで絞り込み
// 楽天ジャンル: 100371=スキンケア, 100372=メイク, 100373=ヘアケア, 100374=ボディケア
//   551176=日焼け止め, 100938=サプリ, 216131=美容家電, 100375=美容・コスメ(親)
const THEME_GENRE_MAP: Record<string, { genreId: string; minPrice: number; keywords: string[] }> = {
  // ===== 医療美容テーマ（施術後ケア・ホームケア商品を提案） =====
  "iryou-datsumo": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["脱毛後 保湿 クリーム", "脱毛 アフターケア", "除毛クリーム 女性 人気"],
  },
  "ipl": {
    genreId: "100371",
    minPrice: 2000,
    keywords: ["美顔器 IPL 家庭用", "フォトフェイシャル ホームケア", "シミ対策 美容液"],
  },
  "hifu": {
    genreId: "100371",
    minPrice: 2000,
    keywords: ["たるみ 美容液 リフトアップ", "ハリ 美容液 エイジング", "EMS 美顔器"],
  },
  "kanpan": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["肝斑 美白 美容液", "トラネキサム酸 化粧水", "ビタミンC誘導体 美容液"],
  },
  "laser-toning": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["美白 美容液 シミ", "トーンアップ 美容液", "ハイドロキノン クリーム"],
  },
  "peeling": {
    genreId: "100371",
    minPrice: 1000,
    keywords: ["ピーリング ジェル 毛穴", "AHA 角質ケア", "酵素洗顔 毛穴 黒ずみ"],
  },
  "electroporation": {
    genreId: "100371",
    minPrice: 3000,
    keywords: ["エレクトロポレーション 美顔器", "イオン導入 美顔器", "美顔器 導入 美容液"],
  },
  "botox": {
    genreId: "100371",
    minPrice: 2000,
    keywords: ["シワ改善 クリーム", "ペプチド 美容液", "塗るボトックス 美容液"],
  },
  "online-clinic": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["美肌 スキンケアセット", "ドクターズコスメ", "医薬部外品 美白"],
  },
  // ===== コスメ・スキンケアテーマ =====
  "skincare-aging": {
    genreId: "100371",
    minPrice: 2000,
    keywords: ["エイジングケア 美容液", "シワ改善 クリーム", "レチノール 美容液"],
  },
  "sunscreen": {
    genreId: "551176",
    minPrice: 1000,
    keywords: ["日焼け止め 顔用", "UV下地 トーンアップ", "日焼け止め 敏感肌"],
  },
  "skincare-sensitive": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["敏感肌 化粧水", "セラミド 保湿", "低刺激 スキンケア"],
  },
  "cleansing": {
    genreId: "100371",
    minPrice: 1000,
    keywords: ["クレンジング 毛穴", "クレンジングバーム 人気", "オイルクレンジング 角栓"],
  },
  "pore-care": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["毛穴ケア 美容液", "毛穴 引き締め 化粧水", "ビタミンC 美容液"],
  },
  "acne-care": {
    genreId: "100371",
    minPrice: 1000,
    keywords: ["ニキビケア 化粧水", "ニキビ跡 美容液", "サリチル酸 洗顔"],
  },
  "shampoo-haircare": {
    genreId: "100373",
    minPrice: 1500,
    keywords: ["アミノ酸シャンプー", "ヘアトリートメント ダメージ", "スカルプシャンプー 女性"],
  },
  "bodycare": {
    genreId: "100374",
    minPrice: 1000,
    keywords: ["ボディクリーム 保湿", "デリケートゾーン ケア", "ボディオイル 人気"],
  },
  "supplement": {
    genreId: "100938",
    minPrice: 1500,
    keywords: ["コラーゲン サプリ", "ビタミンC サプリ", "プラセンタ サプリ"],
  },
  "time-saving": {
    genreId: "100371",
    minPrice: 1500,
    keywords: ["オールインワンジェル", "時短 スキンケア セット", "オールインワン エイジング"],
  },
};

// フォールバック: マッピングにないテーマは美容・コスメ親ジャンルで絞り込み
const DEFAULT_BEAUTY_GENRE = "100375"; // 美容・コスメ・香水（親カテゴリ）

export interface SearchOptions {
  keyword: string;
  themeId?: string;        // テーマID（ジャンル自動絞り込み）
  minPrice?: number;       // 最低価格
  maxPrice?: number;       // 最高価格
  maxResults?: number;     // 最終表示件数
  expandKeywords?: boolean; // テーマ別キーワード展開
}

/**
 * 収益スコアを計算する
 * 高単価 × 高評価 × 購買実績 = 稼げる商品
 */
function calculateProfitScore(
  price: number,
  reviewAverage: number,
  reviewCount: number,
  commissionRate: number,
): { profitScore: number; estimatedCommission: number } {
  // 推定報酬額（1件あたり）
  const estimatedCommission = Math.round(price * (commissionRate / 100));

  // 購買実績指数（レビュー数の対数 → 大量レビュー=売れ筋）
  const purchaseIndex = Math.log10(Math.max(reviewCount, 1) + 1);

  // 信頼性指数（レビュー評価 3.5以上でボーナス）
  const trustIndex = reviewAverage >= 3.5 ? reviewAverage / 5 : reviewAverage / 10;

  // 価格帯ボーナス（3000円〜15000円が美容系のスイートスポット）
  let priceBonus = 1.0;
  if (price >= 3000 && price <= 15000) {
    priceBonus = 1.5; // コンバージョンしやすい価格帯
  } else if (price > 15000 && price <= 30000) {
    priceBonus = 1.2; // 高単価だがCVR下がる
  } else if (price < 1000) {
    priceBonus = 0.5; // 低単価 → 報酬少なすぎ
  }

  // 総合収益スコア
  const profitScore = estimatedCommission * purchaseIndex * trustIndex * priceBonus;

  return { profitScore: Math.round(profitScore * 100) / 100, estimatedCommission };
}

/**
 * 楽天商品検索API（収益最適化版）
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
  const minPrice = options?.minPrice ?? themeConfig?.minPrice ?? 0;
  const maxPrice = options?.maxPrice;
  const maxResults = options?.maxResults ?? hits;
  const expandKeywords = options?.expandKeywords ?? !!themeId;

  // ジャンルID: テーマ設定 → フォールバック（美容・コスメ親カテゴリ）
  const genreId = themeConfig?.genreId ?? DEFAULT_BEAUTY_GENRE;

  // 検索キーワードリスト（テーマ別に展開 or 単独）
  const searchKeywords: string[] = [keyword];
  if (expandKeywords && themeConfig?.keywords) {
    // テーマ別の関連キーワードも追加（重複排除）
    for (const kw of themeConfig.keywords) {
      if (!searchKeywords.includes(kw)) {
        searchKeywords.push(kw);
      }
    }
  }

  // 全キーワードで並行検索（APIリクエスト数を制限: 最大3キーワード）
  const keywordsToSearch = searchKeywords.slice(0, 3);
  const allProducts: RakutenProduct[] = [];

  for (const kw of keywordsToSearch) {
    try {
      const products = await fetchRakutenApi(appId, affiliateId, kw, 30, accessKey, {
        genreId,
        minPrice,
        maxPrice,
      });
      allProducts.push(...products);
    } catch (e) {
      // 1つのキーワードが失敗しても続行
      console.error(`[Rakuten] キーワード「${kw}」の検索に失敗:`, e);
    }

    // APIレート制限対策（1秒間隔）
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

  // 最低価格フィルタ
  const filtered = uniqueProducts.filter((p) => p.itemPrice >= minPrice);

  // 収益スコアで降順ソート
  filtered.sort((a, b) => b.profitScore - a.profitScore);

  // 上位N件を返す
  return filtered.slice(0, maxResults);
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
  filters?: { genreId?: string; minPrice?: number; maxPrice?: number },
): Promise<RakutenProduct[]> {
  const params = new URLSearchParams({
    applicationId: appId,
    affiliateId: affiliateId,
    keyword: keyword,
    hits: String(Math.min(hits, 30)), // API最大30件
    sort: "-reviewCount",
    format: "json",
    imageFlag: "1", // 画像ありのみ
  });

  if (accessKey) {
    params.set("accessKey", accessKey);
  }

  // ジャンル絞り込み
  if (filters?.genreId) {
    params.set("genreId", filters.genreId);
  }

  // 価格フィルタ
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

  return data.Items.map((item) => {
    const genreId = String(item.Item.genreId);
    const commissionRate = COMMISSION_RATES[genreId] ?? COMMISSION_RATES["default"];
    const { profitScore, estimatedCommission } = calculateProfitScore(
      item.Item.itemPrice,
      item.Item.reviewAverage,
      item.Item.reviewCount,
      commissionRate,
    );

    return {
      itemName: item.Item.itemName,
      itemPrice: item.Item.itemPrice,
      itemUrl: item.Item.itemUrl,
      affiliateUrl: item.Item.affiliateUrl,
      shopName: item.Item.shopName,
      imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl || "",
      reviewAverage: item.Item.reviewAverage,
      reviewCount: item.Item.reviewCount,
      profitScore,
      estimatedCommission,
      genreId,
    };
  });
}

/**
 * 楽天商品からアフィリエイトHTMLを生成する（収益情報付き）
 */
export function buildRakutenAffiliateHtml(product: RakutenProduct): string {
  return `<div class="rakuten-affiliate" style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0;display:flex;gap:16px;align-items:center;">
  ${product.imageUrl ? `<a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener"><img src="${product.imageUrl}" alt="${product.itemName}" style="width:128px;height:128px;object-fit:contain;border-radius:4px;" /></a>` : ""}
  <div>
    <a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener" style="font-weight:bold;font-size:15px;color:#333;text-decoration:none;">${product.itemName}</a>
    <div style="margin-top:6px;font-size:18px;font-weight:bold;color:#bf0000;">¥${product.itemPrice.toLocaleString()}</div>
    <div style="margin-top:4px;font-size:12px;color:#666;">${product.shopName}${product.reviewCount > 0 ? ` | ★${product.reviewAverage} (${product.reviewCount}件)` : ""}</div>
    <a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener" style="display:inline-block;margin-top:8px;padding:8px 20px;background:#bf0000;color:#fff;border-radius:6px;font-size:13px;font-weight:bold;text-decoration:none;">楽天市場で見る</a>
  </div>
</div>`;
}
