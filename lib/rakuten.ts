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

  // 検索キーワードリスト（テーマ別に展開 or 単独）
  const searchKeywords: string[] = [keyword];
  if (expandKeywords && themeConfig?.keywords) {
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
        minPrice,
        maxPrice,
      });
      allProducts.push(...products);
    } catch (e) {
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

  // ★ 美容系商品のみフィルタリング（ジャンルID + 商品名キーワード判定）
  const beautyFiltered = uniqueProducts.filter((p) =>
    isBeautyProduct(p.genreId, p.itemName)
  );

  // 最低価格フィルタ
  const priceFiltered = beautyFiltered.filter((p) => p.itemPrice >= minPrice);

  // 収益スコアで降順ソート
  priceFiltered.sort((a, b) => b.profitScore - a.profitScore);

  // 上位N件を返す
  return priceFiltered.slice(0, maxResults);
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
  filters?: { minPrice?: number; maxPrice?: number },
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

  return data.Items.map((item) => {
    const genreId = String(item.Item.genreId);
    // 美容系は基本4%、それ以外は3%
    const commissionRate = BEAUTY_GENRE_WHITELIST.has(genreId) ? 4 : DEFAULT_COMMISSION_RATE;
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
