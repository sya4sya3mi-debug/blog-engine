// ==========================================
// BlogEngine V2 - Affiliate Partner Database
// 提携先DB管理 & テーマ別自動選択 & プレースホルダー置換
// ==========================================

/** 報酬タイプ */
export type CommissionType = "cpa" | "cpc" | "percent";

/** 提携先データ */
export interface AffiliatePartner {
  id: string;
  asp: string;             // ASP名（A8.net, afb, もしもアフィリエイト等）
  programName: string;     // プログラム名（クリニック名・商品名）
  themeIds: string[];      // 対応テーマID（複数可）
  commissionType: CommissionType;
  commissionValue: string; // 報酬額（"5000円", "10%"等の表示用文字列）
  priority: number;        // 優先度（数値が大きいほど優先）
  html: string;            // 挿入するアフィリエイトHTML
  active: boolean;         // 有効/無効
}

/** 後方互換用（API通信用の簡易形式） */
export interface AffiliateLink {
  themeId: string;
  html: string;
}

/**
 * テーマIDに合う提携先を優先度順に取得する
 */
export function selectPartnersForTheme(
  partners: AffiliatePartner[],
  themeId: string,
): AffiliatePartner[] {
  return partners
    .filter((p) => p.active && p.themeIds.includes(themeId) && p.html.trim())
    .sort((a, b) => b.priority - a.priority);
}

/**
 * 提携先リストをAffiliateLink形式に変換（API送信用）
 */
export function partnersToLinks(partners: AffiliatePartner[], themeId: string): AffiliateLink[] {
  return selectPartnersForTheme(partners, themeId).map((p) => ({
    themeId,
    html: p.html,
  }));
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

  const validLinks = links.filter((l) => l.html.trim());
  if (validLinks.length === 0) return htmlContent;

  const placeholderRegex = /<p\s+class="affiliate-placeholder">[^<]*<\/p>/g;
  const matches = htmlContent.match(placeholderRegex);
  if (!matches) return htmlContent;

  let linkIndex = 0;
  const result = htmlContent.replace(placeholderRegex, () => {
    const link = validLinks[linkIndex % validLinks.length];
    linkIndex++;
    return `<div class="affiliate-link">${link.html}</div>`;
  });

  return result;
}

/**
 * Cron実行時に環境変数から提携先DBを取得し、テーマに合うリンクを返す
 * 環境変数 AFFILIATE_DB にJSON配列で保存
 */
export function getCronAffiliateLinks(themeId: string): AffiliateLink[] {
  // 新形式: AFFILIATE_DB（提携先DB）
  const dbRaw = process.env.AFFILIATE_DB;
  if (dbRaw) {
    try {
      const partners: AffiliatePartner[] = JSON.parse(dbRaw);
      return partnersToLinks(partners, themeId);
    } catch {}
  }

  // 旧形式互換: AFFILIATE_LINKS
  const raw = process.env.AFFILIATE_LINKS;
  if (!raw) return [];
  try {
    const allLinks: AffiliateLink[] = JSON.parse(raw);
    return allLinks.filter((l) => l.themeId === themeId);
  } catch {
    return [];
  }
}

/**
 * 新しい提携先IDを生成する
 */
export function generatePartnerId(): string {
  return `aff_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}
