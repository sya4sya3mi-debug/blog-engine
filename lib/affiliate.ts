// ==========================================
// BlogEngine V2 - Affiliate Link Management
// プレースホルダーを登録済みリンクに自動置換
// ==========================================

export interface AffiliateLink {
  themeId: string;
  html: string; // 挿入するアフィリエイトHTML（バナー、テキストリンク等）
}

/**
 * 記事HTML内のアフィリエイトプレースホルダーを登録済みリンクに置換する
 *
 * プレースホルダー形式:
 * - テーマ指定モード: <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定】</p>
 * - 商品指定モード:   <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p>
 */
export function replaceAffiliatePlaceholders(
  htmlContent: string,
  links: AffiliateLink[],
): string {
  if (!links || links.length === 0) return htmlContent;

  // 有効なリンクのみ（空HTMLを除外）
  const validLinks = links.filter((l) => l.html.trim());
  if (validLinks.length === 0) return htmlContent;

  // 全プレースホルダーを検索
  const placeholderRegex = /<p\s+class="affiliate-placeholder">[^<]*<\/p>/g;
  const matches = htmlContent.match(placeholderRegex);
  if (!matches) return htmlContent;

  // 各プレースホルダーを順番にリンクで置換（リンクはループ使用）
  let linkIndex = 0;
  const result = htmlContent.replace(placeholderRegex, () => {
    const link = validLinks[linkIndex % validLinks.length];
    linkIndex++;
    return `<div class="affiliate-link">${link.html}</div>`;
  });

  return result;
}

/**
 * Cron実行時に環境変数からアフィリエイトリンクを取得する
 * 環境変数 AFFILIATE_LINKS に JSON配列で保存:
 * [{"themeId":"iryou-datsumo","html":"<a href='...'>...</a>"}, ...]
 */
export function getCronAffiliateLinks(themeId: string): AffiliateLink[] {
  const raw = process.env.AFFILIATE_LINKS;
  if (!raw) return [];
  try {
    const allLinks: AffiliateLink[] = JSON.parse(raw);
    return allLinks.filter((l) => l.themeId === themeId);
  } catch {
    return [];
  }
}
