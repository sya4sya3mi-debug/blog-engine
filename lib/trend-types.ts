// ==========================================
// BlogEngine V2 - Beauty Trend Types
// 美容トレンド自動収集のデータ型定義
// ==========================================

export type TrendSource = "gdelt" | "pubmed" | "youtube";

export type TrendCategory =
  | "美容医療"
  | "スキンケア"
  | "新作コスメ"
  | "ヘアケア"
  | "インナーケア"
  | "その他";

export interface TrendItem {
  id: string; // sourceUrlのハッシュ（重複排除用）
  source: TrendSource;
  sourceUrl: string;
  title: string;
  titleJa: string; // 英語記事は日本語翻訳
  summary: string;
  summaryJa: string;
  category: TrendCategory;
  relevanceScore: number; // 0-100（美容キーワード一致度）
  trendScore: number; // 0-100（鮮度+ソース信頼度）
  combinedScore: number; // 0.6×relevance + 0.4×trend
  publishedAt: string; // ISO date
  collectedAt: string; // ISO date
  keywords: string[]; // 抽出された美容キーワード
  matchedThemeIds: string[]; // config.tsのSubThemeとマッチ
  language: string; // "en" | "ja"
  used: boolean; // 記事生成に使用済みフラグ
  metadata: Record<string, unknown>;
}

export interface TrendCollectionResult {
  collected: number;
  deduplicated: number;
  stored: number;
  errors: string[];
  items: TrendItem[];
}

// カテゴリ分類用キーワードマッピング
export const CATEGORY_KEYWORDS: Record<TrendCategory, string[]> = {
  美容医療: [
    "医療脱毛", "ハイフ", "HIFU", "ボトックス", "フォトフェイシャル",
    "IPL", "レーザー", "ピーリング", "エレクトロポレーション",
    "aesthetic", "dermatology", "laser", "botox", "filler",
    "cosmetic surgery", "clinic", "クリニック", "施術", "美容外科",
  ],
  スキンケア: [
    "スキンケア", "化粧水", "美容液", "セラム", "保湿",
    "レチノール", "ビタミンC", "ナイアシンアミド", "ヒアルロン酸",
    "skincare", "serum", "moisturizer", "retinol", "retinoid",
    "hyaluronic acid", "niacinamide", "sunscreen", "日焼け止め",
    "エイジングケア", "anti-aging", "毛穴", "ニキビ", "acne",
  ],
  新作コスメ: [
    "新作", "コスメ", "ファンデーション", "リップ", "アイシャドウ",
    "new launch", "cosmetics", "foundation", "lipstick", "makeup",
    "メイク", "ベースメイク", "下地", "パウダー", "マスカラ",
    "beauty product", "限定", "新商品",
  ],
  ヘアケア: [
    "シャンプー", "トリートメント", "ヘアケア", "ヘアオイル",
    "shampoo", "hair care", "hair treatment", "conditioner",
    "育毛", "頭皮", "scalp", "ダメージヘア",
  ],
  インナーケア: [
    "サプリ", "コラーゲン", "プロテイン", "インナーケア",
    "supplement", "collagen", "vitamin", "ビタミン",
    "腸活", "美容ドリンク", "プラセンタ",
  ],
  その他: [],
};
