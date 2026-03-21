// ==========================================
// BlogEngine V2 - Configuration & Theme Rotation
// 戦略: 美容医療(高単価CPA) + コスメ(安定EC) の2軸
// ==========================================

export interface SubTheme {
  id: string;
  label: string;
  keywords: string[];
  articleType: "comparison" | "howto" | "qa" | "guide";
}

export interface Genre {
  id: string;
  name: string;
  color: string;
  icon: string;
  subThemes: SubTheme[];
}

// ===== 美容トレンドノート =====
// 最優先: 美容医療・脱毛・施術系（申込型 = 高単価CPA）
// 安定化: 化粧品・ドラッグストア系（ECアフィ = 承認安定）

export const BEAUTY_GENRE: Genre = {
  id: "beauty",
  name: "美容トレンドノート",
  color: "#FF6B9D",
  icon: "💄",
  subThemes: [
    // ========== 最優先: 美容医療・施術系（高単価CPA） ==========
    {
      id: "iryou-datsumo",
      label: "医療脱毛（女性）",
      articleType: "comparison",
      keywords: [
        "医療脱毛 おすすめ 比較",
        "医療脱毛 料金 相場",
        "医療脱毛 回数 期間",
        "医療脱毛 VIO 痛み",
        "医療脱毛 全身 安い",
      ],
    },
    {
      id: "mens-datsumo",
      label: "メンズ脱毛・ヒゲ脱毛",
      articleType: "comparison",
      keywords: [
        "ヒゲ脱毛 何回 効果",
        "メンズ脱毛 料金 比較",
        "メンズ 医療脱毛 おすすめ",
        "ヒゲ脱毛 痛い 対策",
      ],
    },
    {
      id: "ipl",
      label: "IPL・フォトフェイシャル",
      articleType: "comparison",
      keywords: [
        "IPL フォトフェイシャル 効果",
        "IPL レーザートーニング 違い",
        "フォトフェイシャル 料金 回数",
        "シミ取り IPL 比較",
      ],
    },
    {
      id: "hifu",
      label: "ハイフ（HIFU）",
      articleType: "comparison",
      keywords: [
        "ハイフ 効果 持続期間",
        "HIFU 料金 比較",
        "ハイフ たるみ 何回",
        "医療ハイフ エステハイフ 違い",
      ],
    },
    {
      id: "kanpan",
      label: "肝斑・くすみ治療",
      articleType: "guide",
      keywords: [
        "肝斑 治療 比較",
        "肝斑 レーザートーニング 効果",
        "くすみ 原因 治療法",
        "肝斑 トラネキサム酸 効果",
      ],
    },
    {
      id: "laser-toning",
      label: "レーザートーニング",
      articleType: "comparison",
      keywords: [
        "レーザートーニング 効果 回数",
        "レーザートーニング 料金 相場",
        "レーザートーニング シミ 肝斑",
      ],
    },
    {
      id: "peeling",
      label: "ピーリング・毛穴治療",
      articleType: "howto",
      keywords: [
        "ケミカルピーリング 効果 回数",
        "毛穴治療 おすすめ クリニック",
        "ピーリング 料金 比較",
        "毛穴 黒ずみ 皮膚科 治療",
      ],
    },
    {
      id: "electroporation",
      label: "エレクトロポレーション",
      articleType: "qa",
      keywords: [
        "エレクトロポレーション 効果",
        "エレクトロポレーション イオン導入 違い",
        "エレクトロポレーション 料金 回数",
      ],
    },
    {
      id: "botox",
      label: "エラボトックス・ボトックス",
      articleType: "qa",
      keywords: [
        "エラボトックス 効果 期間",
        "ボトックス 料金 比較",
        "ボトックス 副作用 リスク",
      ],
    },
    {
      id: "online-clinic",
      label: "オンライン美容診療",
      articleType: "comparison",
      keywords: [
        "オンライン 美容皮膚科 おすすめ",
        "オンライン診療 美容 比較",
        "美容皮膚科 予約 取りやすい",
      ],
    },

    // ========== 安定化: コスメ・スキンケア（EC = 承認安定） ==========
    {
      id: "skincare-aging",
      label: "エイジングケア化粧品",
      articleType: "howto",
      keywords: [
        "エイジングケア 美容液 おすすめ",
        "シワ改善 化粧品 ランキング",
        "たるみ スキンケア 30代",
        "ほうれい線 ケア 化粧品",
      ],
    },
    {
      id: "sunscreen",
      label: "日焼け止め・UVケア",
      articleType: "comparison",
      keywords: [
        "日焼け止め 顔用 おすすめ",
        "日焼け止め 敏感肌 選び方",
        "UVケア 下地 比較",
      ],
    },
    {
      id: "skincare-sensitive",
      label: "敏感肌スキンケア",
      articleType: "howto",
      keywords: [
        "敏感肌 化粧水 おすすめ",
        "敏感肌 保湿クリーム 選び方",
        "肌荒れ スキンケア 成分",
      ],
    },
    {
      id: "cleansing",
      label: "クレンジング・洗顔",
      articleType: "comparison",
      keywords: [
        "クレンジング おすすめ 肌に優しい",
        "毛穴 クレンジング ランキング",
        "ダブル洗顔不要 おすすめ",
      ],
    },
    {
      id: "pore-care",
      label: "毛穴ケア（ホームケア）",
      articleType: "howto",
      keywords: [
        "毛穴ケア 化粧水 おすすめ",
        "毛穴 黒ずみ スキンケア",
        "毛穴 引き締め 方法",
      ],
    },
    {
      id: "acne-care",
      label: "ニキビ・肌荒れケア",
      articleType: "qa",
      keywords: [
        "大人ニキビ スキンケア おすすめ",
        "ニキビ跡 ケア 方法",
        "ニキビ 化粧水 選び方",
      ],
    },
    {
      id: "shampoo-haircare",
      label: "シャンプー・ヘアケア",
      articleType: "comparison",
      keywords: [
        "シャンプー おすすめ 市販",
        "アミノ酸シャンプー ランキング",
        "ダメージヘア トリートメント おすすめ",
      ],
    },
    {
      id: "bodycare",
      label: "ボディケア・デリケートゾーン",
      articleType: "howto",
      keywords: [
        "ボディクリーム おすすめ 保湿",
        "デリケートゾーン ケア おすすめ",
        "ボディケア いい匂い 人気",
      ],
    },
    {
      id: "supplement",
      label: "美容サプリ・インナーケア",
      articleType: "qa",
      keywords: [
        "コラーゲン サプリ 効果",
        "ビタミンC サプリ おすすめ",
        "美容サプリ 選び方 成分",
      ],
    },
    {
      id: "time-saving",
      label: "時短スキンケア・メンズケア",
      articleType: "howto",
      keywords: [
        "時短スキンケア おすすめ",
        "メンズ スキンケア 初心者",
        "オールインワン おすすめ 30代",
      ],
    },
  ],
};

export const ALL_GENRES: Genre[] = [BEAUTY_GENRE];

// ----- ターゲット年代 -----
export type TargetAge = "20s" | "30s" | "40s";
const TARGET_AGES: TargetAge[] = ["20s", "30s", "40s"];

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

/** 今日のターゲット年代を決定（日付ベースのローテーション） */
export function getTodaysTargetAge(dateStr: string): TargetAge {
  const hash = hashString(dateStr + "-age");
  return TARGET_AGES[hash % TARGET_AGES.length];
}

/** 今日の投稿時刻を決定（JST 9-12, 15-18, 19-22 からランダム） */
export function getTodaysPostHour(dateStr: string): number {
  const timeSlots = [
    [9, 10, 11, 12],
    [15, 16, 17, 18],
    [19, 20, 21, 22],
  ];
  const slotHash = hashString(dateStr + "-slot");
  const slotIndex = slotHash % timeSlots.length;
  const slot = timeSlots[slotIndex];
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
