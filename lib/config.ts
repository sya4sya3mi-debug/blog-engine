// ==========================================
// BlogEngine V2 - Configuration & Theme Rotation
// ==========================================

export interface SubTheme {
  id: string;
  label: string;
  keywords: string[];
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  icon: string;
  subThemes: SubTheme[];
}

// ----- 美容ジャンル: 20サブテーマ -----
export const BEAUTY_GENRE: Genre = {
  id: "beauty",
  name: "美容の教科書",
  color: "#FF6B9D",
  icon: "💄",
  subThemes: [
    { id: "lotion", label: "化粧水", keywords: ["化粧水 おすすめ", "化粧水 ランキング", "化粧水 プチプラ"] },
    { id: "serum", label: "美容液", keywords: ["美容液 おすすめ", "美容液 人気", "美容液 エイジングケア"] },
    { id: "cream", label: "保湿クリーム", keywords: ["保湿クリーム おすすめ", "保湿クリーム 敏感肌", "フェイスクリーム ランキング"] },
    { id: "cleansing", label: "クレンジング", keywords: ["クレンジング おすすめ", "クレンジングオイル 人気", "クレンジングバーム ランキング"] },
    { id: "sunscreen", label: "日焼け止め", keywords: ["日焼け止め おすすめ", "日焼け止め 顔用", "UVケア ランキング"] },
    { id: "foundation", label: "ファンデーション", keywords: ["ファンデーション おすすめ", "ファンデ 崩れない", "ファンデーション 乾燥肌"] },
    { id: "lipstick", label: "リップ・口紅", keywords: ["リップ おすすめ", "口紅 人気色", "リップティント ランキング"] },
    { id: "eyeshadow", label: "アイシャドウ", keywords: ["アイシャドウ おすすめ", "アイシャドウパレット 人気", "アイメイク トレンド"] },
    { id: "mascara", label: "マスカラ", keywords: ["マスカラ おすすめ", "マスカラ にじまない", "マスカラ ロング"] },
    { id: "shampoo", label: "シャンプー", keywords: ["シャンプー おすすめ", "シャンプー 市販", "アミノ酸シャンプー ランキング"] },
    { id: "treatment", label: "トリートメント", keywords: ["トリートメント おすすめ", "ヘアトリートメント 市販", "洗い流さないトリートメント"] },
    { id: "hairdryer", label: "ドライヤー", keywords: ["ドライヤー おすすめ", "ドライヤー 速乾", "高級ドライヤー ランキング"] },
    { id: "bodycare", label: "ボディケア", keywords: ["ボディクリーム おすすめ", "ボディローション 保湿", "ボディケア いい匂い"] },
    { id: "nailcare", label: "ネイルケア", keywords: ["ネイルケア おすすめ", "ジェルネイル セルフ", "ネイルオイル 人気"] },
    { id: "perfume", label: "香水・フレグランス", keywords: ["香水 レディース 人気", "プチプラ 香水 おすすめ", "フレグランス モテ"] },
    { id: "skincare-set", label: "スキンケアセット", keywords: ["スキンケア セット おすすめ", "基礎化粧品 ライン使い", "スキンケア 初心者 セット"] },
    { id: "acne", label: "ニキビケア", keywords: ["ニキビケア おすすめ", "大人ニキビ スキンケア", "ニキビ 洗顔 ランキング"] },
    { id: "aging", label: "エイジングケア", keywords: ["エイジングケア おすすめ", "シワ改善 美容液", "たるみ対策 スキンケア"] },
    { id: "pores", label: "毛穴ケア", keywords: ["毛穴ケア おすすめ", "毛穴 黒ずみ 除去", "毛穴 引き締め 化粧水"] },
    { id: "supplement", label: "美容サプリ", keywords: ["美容サプリ おすすめ", "コラーゲン サプリ 人気", "ビタミンC サプリ 美白"] },
  ],
};

export const ALL_GENRES: Genre[] = [BEAUTY_GENRE];

// ----- 決定論的ランダム (日付シード) -----
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/** 今日のテーマを決定（日付ベースのローテーション） */
export function getTodaysTheme(genre: Genre, dateStr: string): { theme: SubTheme; keyword: string } {
  const hash = hashString(dateStr + "-theme");
  const themeIndex = hash % genre.subThemes.length;
  const theme = genre.subThemes[themeIndex];

  const keywordHash = hashString(dateStr + "-keyword");
  const keywordIndex = keywordHash % theme.keywords.length;
  const keyword = theme.keywords[keywordIndex];

  return { theme, keyword };
}

/** 今日の投稿時刻を決定（JST 9-12, 15-18, 19-22 からランダム） */
export function getTodaysPostHour(dateStr: string): number {
  const timeSlots = [
    [9, 10, 11, 12],    // 朝
    [15, 16, 17, 18],   // 昼
    [19, 20, 21, 22],   // 夜
  ];

  // どの時間帯か
  const slotHash = hashString(dateStr + "-slot");
  const slotIndex = slotHash % timeSlots.length;
  const slot = timeSlots[slotIndex];

  // 時間帯内のどの時刻か
  const hourHash = hashString(dateStr + "-hour");
  const hourIndex = hourHash % slot.length;

  return slot[hourIndex];
}

/** 現在のUTC時刻がJSTの投稿時刻と一致するか判定 */
export function shouldRunNow(dateStr: string, utcHour: number): boolean {
  const jstHour = (utcHour + 9) % 24;
  const targetHour = getTodaysPostHour(dateStr);
  return jstHour === targetHour;
}

// ----- 環境変数ヘルパー -----
export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (!val && fallback === undefined) {
    throw new Error(`環境変数 ${key} が設定されていません`);
  }
  return val ?? fallback!;
}

export function getConfig() {
  return {
    anthropicApiKey: getEnv("ANTHROPIC_API_KEY"),
    wpSiteUrl: getEnv("WP_URL"),
    wpUsername: getEnv("WP_USERNAME"),
    wpAppPassword: getEnv("WP_APP_PASSWORD"),
    wpDefaultStatus: getEnv("WP_DEFAULT_STATUS", "draft") as "draft" | "publish",
    appPassword: getEnv("APP_PASSWORD"),
    cronSecret: getEnv("CRON_SECRET"),
    activeGenre: getEnv("ACTIVE_GENRE", "beauty"),
  };
}
