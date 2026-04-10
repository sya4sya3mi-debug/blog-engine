// ==========================================
// BlogEngine V2 - Internal Linking System
// 集める記事 → 売る記事 への内部リンク設計
// ==========================================

export interface InternalLink {
  from: string;      // ソーステーマID（集める記事側）
  to: string;        // ターゲットテーマID（売る記事側）
  anchor: string;    // アンカーテキスト
  context: string;   // リンク前の導入文
}

/**
 * テーマ間の内部リンクグラフ
 * 集める記事（atsumeru）から売る記事（uru）への誘導を定義
 */
// V3: 6テーマの内部リンクグラフ
// 集める記事 → 売る記事 への読者導線
export const INTERNAL_LINK_GRAPH: InternalLink[] = [
  // 毛穴・ニキビ（集める） → シミ・美白（売る）
  { from: "keana-nikibi", to: "bihaku-shimi", anchor: "シミ・色素沈着ケアの詳しい方法はこちら", context: "ニキビ跡が色素沈着してシミになることもあります。早めのケアが大切です。" },
  // 毛穴・ニキビ（集める） → 美容クリニック（売る）
  { from: "keana-nikibi", to: "biyou-clinic", anchor: "毛穴・ニキビ治療ができるクリニックの選び方", context: "セルフケアで改善しない場合は、美容クリニックでのピーリングやダーマペンも選択肢です。" },

  // エイジングケア（売る） → 美容クリニック（売る）
  { from: "aging-care", to: "biyou-clinic", anchor: "ハイフ・ボトックスなどの施術を詳しく知る", context: "スキンケアだけではカバーしきれないたるみやシワには、美容医療という選択肢もあります。" },
  // エイジングケア → シミ・美白
  { from: "aging-care", to: "bihaku-shimi", anchor: "シミ・くすみ対策のスキンケア方法", context: "エイジングケアと同時に、シミ・くすみ対策も始めるのがおすすめです。" },

  // シミ・美白（売る） → 美容クリニック（売る）
  { from: "bihaku-shimi", to: "biyou-clinic", anchor: "シミ取りレーザーなどの美容施術を詳しく知る", context: "ホームケアで改善しない頑固なシミには、クリニックでのレーザー治療も検討してみてください。" },

  // ヘアケア（売る） → 医療脱毛（売る）
  { from: "hair-care", to: "datsumo", anchor: "医療脱毛の詳細はこちら", context: "ヘアケアと合わせて、ムダ毛の処理方法も見直してみませんか？" },

  // 毛穴・ニキビ → エイジングケア
  { from: "keana-nikibi", to: "aging-care", anchor: "30代からのエイジングケアの始め方", context: "毛穴の開きが気になり始めたら、エイジングケアの始め時かもしれません。" },

  // 美容クリニック → 医療脱毛
  { from: "biyou-clinic", to: "datsumo", anchor: "医療脱毛の体験レポートと選び方", context: "美容クリニックに通い始めたら、医療脱毛も合わせて検討する方が多いです。" },
];

// ==========================================
// SEO内部リンク強化: 関連度スコアリング
// TF-IDF風のキーワード重複分析で関連記事を自動検出
// ==========================================

export interface ScoredPost {
  id: number;
  title: string;
  link: string;
  slug: string;
  score: number;          // 関連度スコア（0〜1）
  sharedKeywords: string[]; // 共通キーワード
}

/** HTMLタグ除去 + テキスト正規化 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 日本語テキストからキーワードを抽出（2〜8文字のカタカナ・漢字・英字チャンク） */
function extractKeywords(text: string): Map<string, number> {
  const freq = new Map<string, number>();

  // カタカナ語（2文字以上）
  const katakana = text.match(/[ァ-ヶー]{2,}/g) || [];
  // 漢字チャンク（2〜8文字）
  const kanji = text.match(/[一-龥々]{2,8}/g) || [];
  // 英単語（3文字以上）
  const english = text.match(/[a-zA-Z]{3,}/gi) || [];

  for (const words of [katakana, kanji, english]) {
    for (const w of words) {
      const key = w.toLowerCase();
      freq.set(key, (freq.get(key) || 0) + 1);
    }
  }
  return freq;
}

/** ストップワード（一般的すぎて関連度判定に使えない語） */
const STOP_WORDS = new Set([
  "こと", "もの", "ため", "よう", "それ", "これ", "ここ", "そこ",
  "する", "なる", "ある", "いる", "できる", "おすすめ", "ランキング",
  "まとめ", "比較", "効果", "方法", "使い方", "口コミ", "人気",
  "the", "and", "for", "that", "this", "with", "from",
]);

/**
 * 2記事間の関連度スコアを計算（コサイン類似度ベース）
 * SEO的に強い内部リンクの条件:
 *  - トピカルに近い（同じキーワード群を共有）
 *  - 完全重複ではない（カニバリゼーション回避）
 */
function computeRelevanceScore(
  sourceKeywords: Map<string, number>,
  targetKeywords: Map<string, number>,
): { score: number; sharedKeywords: string[] } {
  const shared: string[] = [];
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // ストップワード除外した共通キーワードのみ評価
  const allKeysArr = Array.from(new Set([...Array.from(sourceKeywords.keys()), ...Array.from(targetKeywords.keys())]));

  for (let i = 0; i < allKeysArr.length; i++) {
    const key = allKeysArr[i];
    if (STOP_WORDS.has(key)) continue;
    const a = sourceKeywords.get(key) || 0;
    const b = targetKeywords.get(key) || 0;
    if (a > 0 && b > 0) {
      shared.push(key);
    }
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return { score: 0, sharedKeywords: [] };

  const cosine = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

  // SEO最適: 類似度0.15〜0.7が理想（近すぎるとカニバリ、遠すぎると無関係）
  // 0.7超えはペナルティ（カニバリゼーションリスク）
  let adjustedScore = cosine;
  if (cosine > 0.7) {
    adjustedScore = 0.7 - (cosine - 0.7) * 0.5; // カニバリペナルティ
  }

  return {
    score: Math.max(0, Math.min(1, adjustedScore)),
    sharedKeywords: shared.sort((a, b) => {
      const freqA = (sourceKeywords.get(a) || 0) + (targetKeywords.get(a) || 0);
      const freqB = (sourceKeywords.get(b) || 0) + (targetKeywords.get(b) || 0);
      return freqB - freqA;
    }).slice(0, 10),
  };
}

/**
 * 全記事プールからターゲット記事に最も関連の強い記事をランク付け
 *
 * @param targetTitle   リライト対象記事のタイトル
 * @param targetHtml    リライト対象記事のHTML本文
 * @param allPosts      WordPressの全公開記事（id, title, link, slug, content）
 * @param maxResults    返す最大件数（デフォルト8）
 * @param minScore      最低関連度スコア（デフォルト0.08）
 */
export function rankRelatedPosts(
  targetTitle: string,
  targetHtml: string,
  allPosts: { id: number; title: string; link: string; slug: string; content?: string }[],
  maxResults: number = 8,
  minScore: number = 0.08,
): ScoredPost[] {
  const sourceText = targetTitle + " " + stripHtml(targetHtml);
  const sourceKw = extractKeywords(sourceText);

  const scored: ScoredPost[] = [];

  for (const post of allPosts) {
    const postText = post.title + " " + stripHtml(post.content || post.title);
    const postKw = extractKeywords(postText);
    const { score, sharedKeywords } = computeRelevanceScore(sourceKw, postKw);

    if (score >= minScore && sharedKeywords.length >= 1) {
      scored.push({
        id: post.id,
        title: post.title,
        link: post.link,
        slug: post.slug,
        score,
        sharedKeywords,
      });
    }
  }

  // スコア降順 → 上位N件
  return scored.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/**
 * 関連記事データからClaudeへのコンテキスト文字列を生成
 */
export function buildRelatedPostsContext(posts: ScoredPost[]): string {
  if (posts.length === 0) return "（関連記事なし）";
  return posts.map((p, i) =>
    `${i + 1}. 「${p.title}」\n   URL: ${p.link}\n   共通トピック: ${p.sharedKeywords.slice(0, 5).join("・")}\n   関連度: ${(p.score * 100).toFixed(0)}%`
  ).join("\n");
}

/**
 * 特定テーマから誘導可能な内部リンクを取得する
 */
export function getInternalLinksFrom(themeId: string): InternalLink[] {
  return INTERNAL_LINK_GRAPH.filter((link) => link.from === themeId);
}

/**
 * 特定テーマへ誘導してくるリンクを取得する（被リンク分析用）
 */
export function getInternalLinksTo(themeId: string): InternalLink[] {
  return INTERNAL_LINK_GRAPH.filter((link) => link.to === themeId);
}

/**
 * 記事HTML内の内部リンクプレースホルダーを実際のリンクに置換する
 *
 * 3段階のフォールバック:
 *  1. existingPosts にマッチする投稿があれば → その投稿へリンク
 *  2. wpBaseUrl があれば → カテゴリページURL (例: /category/{themeId}/) へリンク
 *  3. どちらもなければ → テキストのみのスタイル付きボックス
 *
 * @param html           記事HTML
 * @param wpBaseUrl       WordPressサイトURL（例: https://example.com）
 * @param existingPosts   既存投稿の { slug, link, title } リスト（WordPressから取得）
 */
export function replaceInternalLinkPlaceholders(
  html: string,
  wpBaseUrl?: string,
  existingPosts?: { slug: string; link: string; title: string }[],
): string {
  // <p class="internal-link-suggestion">▶ 【関連記事】{テキスト}</p> のパターン
  const regex = /<p\s+class="internal-link-suggestion">[^<]*<\/p>/g;

  return html.replace(regex, (match) => {
    const textMatch = match.match(/>([^<]*)</);
    const rawText = textMatch ? textMatch[1] : "";
    const cleanText = rawText.replace(/^▶\s*/, "").replace(/^【関連記事】/, "").trim();

    // 既存投稿でマッチする記事を探す（実在する記事のみリンク）
    if (existingPosts && existingPosts.length > 0) {
      const matchedPost = existingPosts.find((post) => {
        const keywords = cleanText.split(/[\s・、,]/);
        return keywords.some((kw) => kw.length >= 2 && ((post.title || "").includes(kw) || (post.slug || "").includes(kw)));
      });

      if (matchedPost) {
        return `<div class="internal-link-box" style="background:#f8f0ff;border-left:4px solid #9b59b6;padding:12px 16px;margin:16px 0;border-radius:4px;font-size:14px;">
  <a href="${matchedPost.link}" rel="noopener" style="color:#7c3aed;text-decoration:none;font-weight:bold;">▶ 【関連記事】${matchedPost.title}</a>
</div>`;
      }
    }

    // マッチする既存記事がない → プレースホルダーを完全に削除（存在しない記事へのリンクは生成しない）
    return "";
  });
}
