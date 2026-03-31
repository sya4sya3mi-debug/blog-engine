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
