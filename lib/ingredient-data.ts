export type IngredientStatus = "recommended" | "watchlist";
export type EvidenceLevel = "high" | "medium";

export interface IngredientCandidate {
  id: string;
  name: string;
  slug: string;
  status: IngredientStatus;
  evidenceLevel: EvidenceLevel;
  trendScore: number;
  complianceRisk: "low" | "medium";
  summary: string;
  articleAngle: string;
  concernTags: string[];
  benefitTags: string[];
  trendSignals: string[];
  whyRecommended: string[];
  caution: string[];
  avoidClaims: string[];
  searchKeywords: string[];
  updatedAt: string;
}

const UPDATED_AT = "2026-04-22";

const INGREDIENT_CANDIDATES: IngredientCandidate[] = [
  {
    id: "niacinamide",
    name: "ナイアシンアミド",
    slug: "niacinamide",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 95,
    complianceRisk: "low",
    summary: "保湿、肌荒れ予防、キメの見え方改善など幅広い切り口を作りやすい定番成分。",
    articleAngle: "初めてでも使いやすい万能成分として、2026年の定番化トレンドを説明する。",
    concernTags: ["毛穴", "くすみ", "乾燥", "皮脂", "エイジングケア"],
    benefitTags: ["守りの美容", "毎日使いやすい", "併用しやすい"],
    trendSignals: [
      "美容メディアの定番成分特集で継続的に掲載",
      "高濃度よりも低刺激処方への関心が拡大",
      "ビタミンCやセラミドとの組み合わせ訴求が強い",
    ],
    whyRecommended: [
      "説明できる効能範囲が広く、記事テーマを量産しやすい",
      "比較的コンプライアンス設計がしやすい",
      "商品選びや使い方の解説に自然につながる",
    ],
    caution: [
      "高濃度製品は刺激感が出る場合がある",
      "濃度の高さだけで優劣を断定しない",
    ],
    avoidClaims: [
      "シワが必ず消える",
      "毛穴がなくなる",
    ],
    searchKeywords: ["ナイアシンアミド 効果", "ナイアシンアミド 使い方", "ナイアシンアミド 化粧水"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "azelaic-acid",
    name: "アゼライン酸",
    slug: "azelaic-acid",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 90,
    complianceRisk: "low",
    summary: "皮脂や肌荒れ悩み向けの成分として話題性が高く、比較記事にも展開しやすい。",
    articleAngle: "毛穴・皮脂悩み向けの成分として、話題化した理由と使い分けを丁寧に解説する。",
    concernTags: ["毛穴", "皮脂", "肌荒れ", "赤み"],
    benefitTags: ["トレンド感", "比較記事向き", "悩み特化"],
    trendSignals: [
      "海外スキンケア文脈から日本でも認知が拡大",
      "毛穴・皮脂悩み向け成分としてSNSで言及が増加",
      "ナイアシンアミドやレチノールとの違い比較需要が強い",
    ],
    whyRecommended: [
      "悩みが明確で検索意図に合わせやすい",
      "比較コンテンツと相性がよい",
      "成分理解の基礎記事としても展開しやすい",
    ],
    caution: [
      "刺激感や乾燥感に注意が必要",
      "敏感肌への使用は頻度や濃度の説明が必要",
    ],
    avoidClaims: [
      "ニキビを治療する",
      "赤みが確実に消える",
    ],
    searchKeywords: ["アゼライン酸 効果", "アゼライン酸 使い方", "アゼライン酸 ナイアシンアミド"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "vitamin-c",
    name: "ビタミンC誘導体",
    slug: "vitamin-c",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 88,
    complianceRisk: "low",
    summary: "透明感や毛穴印象ケアの文脈で定番人気があり、濃度や種類の解説需要も高い。",
    articleAngle: "ビタミンC誘導体の種類・濃度・朝夜の使い分けを整理して失敗しにくい記事にする。",
    concernTags: ["くすみ", "毛穴", "皮脂", "ハリ"],
    benefitTags: ["認知度が高い", "検索ボリュームが大きい", "商品比較しやすい"],
    trendSignals: [
      "高濃度美容液だけでなく、毎日使い向け処方にも注目",
      "毛穴ケア文脈で継続的に検索需要がある",
      "朝の使用可否や刺激の少ない選び方への関心が高い",
    ],
    whyRecommended: [
      "読者の理解度に合わせて初心者向けにも深掘りにも対応しやすい",
      "濃度・種類・併用テーマで派生記事を作りやすい",
      "比較記事とランキング記事へ接続しやすい",
    ],
    caution: [
      "乾燥感や刺激感への配慮が必要",
      "即効性や漂白のような表現は避ける",
    ],
    avoidClaims: [
      "シミが消える",
      "一晩で透明感が出る",
    ],
    searchKeywords: ["ビタミンC誘導体 効果", "ビタミンC美容液 朝", "ビタミンC誘導体 毛穴"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "ceramide",
    name: "セラミド",
    slug: "ceramide",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 82,
    complianceRisk: "low",
    summary: "バリア機能や乾燥対策の説明に向いており、守りのスキンケア成分として需要が安定している。",
    articleAngle: "攻めの成分と違い、守りのスキンケアとして選ばれる理由を分かりやすく整理する。",
    concernTags: ["乾燥", "敏感肌", "ゆらぎ", "バリア機能"],
    benefitTags: ["低リスク", "初心者向け", "保湿記事向き"],
    trendSignals: [
      "低刺激・バリア重視のトレンドと相性がよい",
      "攻めの成分と併用する守りのアイテム需要が強い",
      "季節の変わり目や敏感肌文脈で安定した人気がある",
    ],
    whyRecommended: [
      "コンプライアンス面の運用がしやすい",
      "初心者向け記事に落とし込みやすい",
      "化粧水・乳液・クリーム比較へ展開できる",
    ],
    caution: [
      "即効性の誇張を避ける",
      "成分名だけでなく配合設計の違いに触れる",
    ],
    avoidClaims: [
      "敏感肌を治す",
      "どんな肌でも刺激ゼロ",
    ],
    searchKeywords: ["セラミド 効果", "セラミド 化粧水 おすすめ", "セラミド 敏感肌"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "tranexamic-acid",
    name: "トラネキサム酸",
    slug: "tranexamic-acid",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 86,
    complianceRisk: "medium",
    summary: "透明感ケアや肌荒れ予防の文脈で需要が高いが、医薬部外品表現との境界には注意が必要。",
    articleAngle: "美白有効成分の文脈に寄せすぎず、スキンケアでの選び方と注意点を中心に構成する。",
    concernTags: ["くすみ", "肌荒れ", "透明感"],
    benefitTags: ["人気成分", "美白文脈に強い", "比較需要が高い"],
    trendSignals: [
      "美白系アイテムの比較記事で指名検索が多い",
      "ナイアシンアミドとの違い比較が増えている",
      "化粧水と美容液の使い分け検索が安定している",
    ],
    whyRecommended: [
      "透明感系記事の軸になりやすい",
      "比較表コンテンツに落とし込みやすい",
      "ユーザーが商品選びに直結しやすい",
    ],
    caution: [
      "医薬部外品の効能表現を勝手に拡張しない",
      "治療や改善の断定表現を避ける",
    ],
    avoidClaims: [
      "肝斑が治る",
      "シミが薄くなると断定する",
    ],
    searchKeywords: ["トラネキサム酸 効果", "トラネキサム酸 ナイアシンアミド", "トラネキサム酸 化粧水"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "peptide",
    name: "ペプチド",
    slug: "peptide",
    status: "recommended",
    evidenceLevel: "medium",
    trendScore: 80,
    complianceRisk: "low",
    summary: "ハリ感や年齢肌向けケアの切り口で人気があり、韓国コスメ文脈とも相性がよい。",
    articleAngle: "レチノールほど強くないハリケア成分として、初心者向けに使い分けを整理する。",
    concernTags: ["ハリ", "乾燥", "エイジングケア"],
    benefitTags: ["韓国コスメ文脈", "比較しやすい", "やさしめの攻めケア"],
    trendSignals: [
      "韓国発のハリケア特集で継続的に露出",
      "レチノールが苦手な人向けの代替候補として紹介されやすい",
      "クリームや美容液の選び方需要が高い",
    ],
    whyRecommended: [
      "ハリケアテーマの裾野を広げられる",
      "成分初心者にも説明しやすい",
      "エイジングケア記事の導線として使いやすい",
    ],
    caution: [
      "作用機序を断定しすぎない",
      "肌再生など医療寄り表現を避ける",
    ],
    avoidClaims: [
      "肌が再生する",
      "たるみが治る",
    ],
    searchKeywords: ["ペプチド 化粧品 効果", "ペプチド レチノール 違い", "ペプチド 美容液"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "retinol",
    name: "レチノール",
    slug: "retinol",
    status: "recommended",
    evidenceLevel: "high",
    trendScore: 84,
    complianceRisk: "medium",
    summary: "人気は高いが刺激やA反応の説明が不可欠なため、慎重な導線設計が必要な成分。",
    articleAngle: "人気成分として紹介しつつ、初心者向けの使い方と注意点を主役にする。",
    concernTags: ["ハリ", "キメ", "エイジングケア"],
    benefitTags: ["指名検索が強い", "比較需要が高い", "記事価値が高い"],
    trendSignals: [
      "高機能美容液の代表格として継続的に人気",
      "初心者向けの使い方・頻度検索が多い",
      "レチナールやバクチオールとの比較文脈が増加",
    ],
    whyRecommended: [
      "検索需要が強い",
      "注意点中心の記事設計がしやすい",
      "比較コンテンツのハブになりやすい",
    ],
    caution: [
      "刺激反応や頻度調整の説明を省かない",
      "妊娠中・授乳中など高リスク領域は一般論に留める",
    ],
    avoidClaims: [
      "シワが消える",
      "短期間で若返る",
    ],
    searchKeywords: ["レチノール 使い方", "レチノール 効果", "レチノール 初心者"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "pdrn",
    name: "PDRN",
    slug: "pdrn",
    status: "watchlist",
    evidenceLevel: "medium",
    trendScore: 78,
    complianceRisk: "medium",
    summary: "韓国美容文脈で注目度は高いが、説明が先行しやすくエビデンスの伝え方に注意が必要。",
    articleAngle: "流行成分として取り上げつつ、現時点では期待値調整を重視した記事にする。",
    concernTags: ["ハリ", "ツヤ", "エイジングケア"],
    benefitTags: ["トレンド先行", "韓国美容", "話題化"],
    trendSignals: [
      "韓国美容トレンド記事で継続的に露出",
      "サーモン由来説明がSNSで拡散しやすい",
      "ただし製品差が大きく誤解も多い",
    ],
    whyRecommended: [
      "トレンド記事には使える",
      "注意喚起込みの記事なら価値がある",
    ],
    caution: [
      "再生や治療のような医療表現を避ける",
      "由来や配合設計の違いを曖昧にしない",
    ],
    avoidClaims: [
      "肌が再生する",
      "注射と同じ効果",
    ],
    searchKeywords: ["PDRN スキンケア", "PDRN 効果", "PDRN 化粧品"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "exosome",
    name: "エクソソーム",
    slug: "exosome",
    status: "watchlist",
    evidenceLevel: "medium",
    trendScore: 76,
    complianceRisk: "medium",
    summary: "話題性は高いが、医療・再生医療を想起させやすく、推奨より注意喚起中心が望ましい成分テーマ。",
    articleAngle: "バズ成分としての注目理由と、期待しすぎない見方を整理する注意喚起型記事にする。",
    concernTags: ["ハリ", "エイジングケア", "ツヤ"],
    benefitTags: ["話題性が高い", "検索関心あり", "注意喚起向き"],
    trendSignals: [
      "再生美容ワードとしてSNSで話題化しやすい",
      "一方で行政・規制文脈の注意喚起も存在する",
      "化粧品記事では表現設計が特に重要",
    ],
    whyRecommended: [
      "推奨成分というより注意喚起・比較記事のテーマとして有効",
    ],
    caution: [
      "強い推奨表現を避ける",
      "医療と化粧品の境界を曖昧にしない",
    ],
    avoidClaims: [
      "再生医療レベルの効果",
      "細胞が若返る",
    ],
    searchKeywords: ["エクソソーム 化粧品", "エクソソーム 効果", "エクソソーム スキンケア"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "bakuchiol",
    name: "バクチオール",
    slug: "bakuchiol",
    status: "watchlist",
    evidenceLevel: "medium",
    trendScore: 70,
    complianceRisk: "low",
    summary: "植物由来レチノール代替として語られやすいが、比較のさせ方に注意が必要。",
    articleAngle: "レチノールの代替候補としてではなく、やさしいハリケア成分として整理する。",
    concernTags: ["ハリ", "乾燥", "エイジングケア"],
    benefitTags: ["比較記事向き", "やさしめケア", "話題性あり"],
    trendSignals: [
      "レチノールが合わない人向けの話題で露出",
      "植物由来のやさしさ訴求が増えている",
      "比較表コンテンツと相性がよい",
    ],
    whyRecommended: [
      "比較記事には有効",
      "ただしレチノールと同等扱いは避けたい",
    ],
    caution: [
      "レチノールと同じ働きと断定しない",
      "刺激ゼロのような表現を避ける",
    ],
    avoidClaims: [
      "レチノールと同じ効果",
      "絶対に刺激が出ない",
    ],
    searchKeywords: ["バクチオール 効果", "バクチオール レチノール 違い", "バクチオール 美容液"],
    updatedAt: UPDATED_AT,
  },
  {
    id: "ectoin",
    name: "エクトイン",
    slug: "ectoin",
    status: "watchlist",
    evidenceLevel: "medium",
    trendScore: 68,
    complianceRisk: "low",
    summary: "バリア・保護系成分として注目され始めているが、日本ではまだ説明コストが高い。",
    articleAngle: "新しめの保護系成分として、セラミドとの違いを整理しながら紹介する。",
    concernTags: ["乾燥", "敏感肌", "ゆらぎ"],
    benefitTags: ["新規性", "差別化", "守りケア"],
    trendSignals: [
      "海外ブランド文脈で採用が増加",
      "バリア重視トレンドと方向性が合う",
      "ただし読者認知はまだ高くない",
    ],
    whyRecommended: [
      "差別化テーマには有効",
      "ただし主力成分より補助的な扱いが安全",
    ],
    caution: [
      "万能成分のように扱わない",
      "セラミドを上回るといった断定を避ける",
    ],
    avoidClaims: [
      "どんな敏感肌でも使える",
      "バリア機能を完全に回復させる",
    ],
    searchKeywords: ["エクトイン 化粧品", "エクトイン 効果", "エクトイン セラミド"],
    updatedAt: UPDATED_AT,
  },
];

export function listIngredientCandidates() {
  const ingredients = [...INGREDIENT_CANDIDATES].sort((a, b) => {
    if (a.status !== b.status) return a.status === "recommended" ? -1 : 1;
    return b.trendScore - a.trendScore;
  });

  return {
    updatedAt: UPDATED_AT,
    ingredients,
    recommended: ingredients.filter((item) => item.status === "recommended"),
    watchlist: ingredients.filter((item) => item.status === "watchlist"),
  };
}

export function getIngredientCandidate(id: string) {
  return INGREDIENT_CANDIDATES.find((item) => item.id === id);
}
