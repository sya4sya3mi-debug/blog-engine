// ==========================================
// BlogEngine V2 - Configuration & Theme Rotation
// 戦略: 美容医療(高単価CPA) + コスメ(安定EC) の2軸
// ==========================================

export interface SubTheme {
  id: string;
  label: string;
  keywords: string[];
  articleType: "comparison" | "ranking" | "review" | "howto" | "qa" | "guide" | "problem-solving" | "trend";
  articleIntent: "uru" | "atsumeru"; // 売る記事（高CVR）vs 集める記事（高トラフィック）
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

// ==========================================
// V3: プロのアフィリエイター戦略
// 6テーマ × ロングテール悩み系キーワード
//
// 戦略:
// 1. テーマを6個に絞り「トピカルオーソリティ」を早期確立
// 2. ロングテール（悩み系）KWで新規ブログでも上位表示を狙う
// 3. 記事タイプは「悩み解決」→「商品提案」の流れ
// 4. 「売る記事」は具体的な悩みに紐づけて商品を推薦
// 5. 「集める記事」は情報系で読者を集め、内部リンクで売る記事へ誘導
// ==========================================
export const BEAUTY_GENRE: Genre = {
  id: "beauty",
  name: "美容トレンドノート",
  color: "#FF6B9D",
  icon: "💄",
  subThemes: [
    // ===== スキンケア①: シミ・美白（悩み深い × 商品単価高い = 収益性◎）=====
    {
      id: "bihaku-shimi",
      label: "シミ・美白ケア",
      articleType: "problem-solving",
      articleIntent: "uru",
      keywords: [
        // ロングテール悩み系（競合少・CVR高）
        "30代 シミ 急に増えた 原因",
        "シミ 消したい 自宅ケア 方法",
        "頬のシミ 薄くする 美容液 選び方",
        "マスク跡 色素沈着 消す方法",
        "シミ隠し ファンデーション 塗り方 コツ",
        "肝斑 シミ 違い 見分け方",
        "産後 シミ 増えた スキンケア",
        "トラネキサム酸 シミ 効果 期間",
        "ビタミンC誘導体 美容液 選び方 濃度",
        "ハイドロキノン 市販 使い方 注意点",
      ],
    },
    // ===== スキンケア②: 毛穴・ニキビ（検索ボリューム大 × 悩み継続）=====
    {
      id: "keana-nikibi",
      label: "毛穴・ニキビ悩み",
      articleType: "problem-solving",
      articleIntent: "atsumeru",
      keywords: [
        "鼻の毛穴 黒ずみ 取れない 原因",
        "30代 毛穴 開き 改善 スキンケア",
        "頬の毛穴 たるみ毛穴 見分け方",
        "大人ニキビ 繰り返す 原因 対策",
        "顎ニキビ 治らない 内側からケア",
        "ニキビ跡 赤み 消す方法 自宅",
        "毛穴 酵素洗顔 正しい使い方",
        "クレンジング 毛穴 角栓 おすすめ方法",
        "ピーリング 自宅 やり方 頻度",
        "毛穴 化粧水 セラミド ビタミンC どっち",
      ],
    },
    // ===== スキンケア③: エイジングケア（30代ターゲット × 単価高）=====
    {
      id: "aging-care",
      label: "エイジングケア",
      articleType: "problem-solving",
      articleIntent: "uru",
      keywords: [
        "30代 ほうれい線 目立ってきた 対策",
        "目の下 たるみ スキンケア 30代",
        "おでこ シワ 改善 クリーム",
        "首のシワ 原因 ケア方法",
        "レチノール 初心者 使い方 注意点",
        "ナイアシンアミド レチノール 併用 方法",
        "30代 基礎化粧品 見直し タイミング",
        "エイジングケア 始め時 何歳から",
        "たるみ毛穴 ハリ美容液 選び方",
        "目元 小じわ アイクリーム 効果ある",
      ],
    },
    // ===== 美容医療①: 医療脱毛（CPA ¥7,000-10,000 高単価）=====
    {
      id: "datsumo",
      label: "医療脱毛",
      articleType: "guide",
      articleIntent: "uru",
      keywords: [
        // 悩み・不安系（検索意図が明確 = CVR高）
        "医療脱毛 痛い 我慢できる レベル",
        "VIO脱毛 恥ずかしい 初めて 流れ",
        "医療脱毛 何回で終わる リアル体験",
        "脱毛サロン 医療脱毛 違い 結局どっち",
        "医療脱毛 後悔 した人 理由",
        "脱毛 カウンセリング 何聞かれる 準備",
        "医療脱毛 学生 安い 分割払い",
        "背中脱毛 自分でできない 対処法",
        "医療脱毛 当日 やること 注意点",
        "脱毛後 肌荒れ かゆい 対策",
      ],
    },
    // ===== 美容医療②: シミ・たるみ施術（CPA高 × 30代の悩み直結）=====
    {
      id: "biyou-clinic",
      label: "美容クリニック施術",
      articleType: "guide",
      articleIntent: "uru",
      keywords: [
        "ハイフ 痛い 効果 いつから わかる",
        "ボトックス 初めて 不安 副作用",
        "シミ取り レーザー 料金 1個いくら",
        "ピーリング クリニック 自宅 違い 効果",
        "フォトフェイシャル 赤み いつ消える",
        "美容皮膚科 初めて 何する 費用",
        "ダーマペン 毛穴 効果 ダウンタイム",
        "美容医療 やめた方がいい 施術 リスク",
        "エラボトックス 小顔 効果 持続期間",
        "美容クリニック 選び方 失敗しない ポイント",
      ],
    },
    // ===== ヘアケア（検索ボリューム大 × 楽天EC相性◎）=====
    {
      id: "hair-care",
      label: "ヘアケア・頭皮ケア",
      articleType: "problem-solving",
      articleIntent: "uru",
      keywords: [
        "髪 パサパサ 広がる 原因 対策",
        "頭皮 かゆい フケ 原因 シャンプー",
        "縮毛矯正 やめたい 移行方法",
        "白髪 30代 増えてきた 対策",
        "アミノ酸シャンプー 市販 ドラッグストア",
        "ヘアオイル つけすぎ べたつき 正しい量",
        "カラー後 色落ち 防ぐ シャンプー",
        "髪 ツヤ 出す方法 ドライヤー やり方",
        "頭皮マッサージ 効果 薄毛 予防",
        "トリートメント 市販 サロン級 おすすめ",
      ],
    },
  ],
};

export const ALL_GENRES: Genre[] = [BEAUTY_GENRE];

// ----- テーマ→収益ティアマッピング -----
// S: クリニック予約CPA ¥7,000-10,000 / A: トライアル購入CPA ¥2,000-2,500 / B: EC報酬 5%
// ティアマッピング（V3: 6テーマ）
// S: クリニック予約CPA ¥7,000-10,000 / A: 商品購入CPA ¥2,000-2,500 / B: EC報酬 5%
export const THEME_TIER_MAP: Record<string, "S" | "A" | "B"> = {
  "datsumo": "S",        // 医療脱毛 → クリニック予約
  "biyou-clinic": "S",   // 美容施術 → クリニック予約
  "bihaku-shimi": "A",   // シミ美白 → 高単価美容液
  "aging-care": "A",     // エイジング → 高単価化粧品
  "keana-nikibi": "B",   // 毛穴ニキビ → スキンケアEC
  "hair-care": "B",      // ヘアケア → シャンプー等EC
};

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
    openaiApiKey: getEnv("OPENAI_API_KEY", ""),
    // X (Twitter) API credentials
    xApiKey: getEnv("X_API_KEY", ""),
    xApiSecret: getEnv("X_API_SECRET", ""),
    xAccessToken: getEnv("X_ACCESS_TOKEN", ""),
    xAccessTokenSecret: getEnv("X_ACCESS_TOKEN_SECRET", ""),
    // Trend collection
    youtubeApiKey: getEnv("YOUTUBE_API_KEY", ""),
    ncbiApiKey: getEnv("NCBI_API_KEY", ""),
    // Gemini (YouTube動画分析)
    geminiApiKey: getEnv("GEMINI_API_KEY", ""),
    // Fact-check
    factCheckEnabled: getEnv("FACT_CHECK_ENABLED", "true") === "true",
  };
}
