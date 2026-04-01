// ==========================================
// BlogEngine V2 - Affiliate Partner Database
// 提携先DB管理 & テーマ別自動選択 & プレースホルダー置換
// ==========================================

/** 報酬タイプ */
export type CommissionType = "cpa" | "cpc" | "percent";

/** 収益ティア */
export type AffiliateTier = "S" | "A" | "B";

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
  tier: AffiliateTier;     // S=クリニック¥7000-10000, A=トライアル¥2000-2500, B=EC 5%
  estimatedCpa: number;    // 推定1件あたり報酬（円）
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
    .filter((p) => p.active && Array.isArray(p.themeIds) && p.themeIds.includes(themeId) && (p.html || "").trim())
    .sort((a, b) => b.priority - a.priority);
}

/**
 * テーマIDに合う提携先をティア別に分類して取得する
 */
export function selectTieredPartners(
  partners: AffiliatePartner[],
  themeId: string,
): { S: AffiliatePartner[]; A: AffiliatePartner[]; B: AffiliatePartner[] } {
  const matched = selectPartnersForTheme(partners, themeId);
  return {
    S: matched.filter((p) => p.tier === "S"),
    A: matched.filter((p) => p.tier === "A"),
    B: matched.filter((p) => p.tier === "B" || !p.tier), // tier未設定はBとして扱う
  };
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
 * - レガシー: <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定】</p>
 * - 商品指定: <p class="affiliate-placeholder">【アフィリエイトリンク挿入予定：商品名】</p>
 * - ティア指定: <div class="cta-slot" data-tier="S" data-position="mid">...</div>
 */
export function replaceAffiliatePlaceholders(
  htmlContent: string,
  links: AffiliateLink[],
  tieredPartners?: { S: AffiliatePartner[]; A: AffiliatePartner[]; B: AffiliatePartner[] },
): string {
  const validLinks = (links || []).filter((l) => l.html && l.html.trim());

  // リンクが空でも cta-slot の置換は試みる
  if (validLinks.length === 0) return replaceCtaSlots(htmlContent, tieredPartners, []);

  // 1. プレースホルダー置換（商品名マッチング対応）
  // 形式: 【アフィリエイトリンク挿入予定：商品名】 → 商品名が一致するリンクを優先挿入
  const placeholderRegex = /<p\s+class="affiliate-placeholder">([^<]*)<\/p>/g;
  let fallbackIndex = 0;
  let result = htmlContent.replace(placeholderRegex, (_match, innerText: string) => {
    // プレースホルダー内から商品名を抽出（「：」以降）
    const nameMatch = innerText.match(/[：:](.+?)】/);
    const targetName = nameMatch ? nameMatch[1].trim() : "";

    // 商品名でマッチするリンクを探す
    if (targetName) {
      const matched = validLinks.find((l) =>
        l.html.includes(targetName) || // HTMLに商品名が含まれる
        targetName.split(/\s+/).some((word) => word.length >= 3 && l.html.includes(word)) // 部分一致
      );
      if (matched) {
        return `<div class="product-rec-card">${matched.html}</div>`;
      }
    }

    // マッチしない場合はフォールバック（順番に割り当て）
    const link = validLinks[fallbackIndex % validLinks.length];
    fallbackIndex++;
    return `<div class="product-rec-card">${link.html}</div>`;
  });

  // 2. ティア別CTA-slot置換（tieredPartners がなければ links をフォールバック）
  result = replaceCtaSlots(result, tieredPartners, validLinks);

  return result;
}

/**
 * ティア別CTA-slotプレースホルダーを置換する
 * tieredPartners がない場合は links（簡易形式）をフォールバックとして使用
 */
function replaceCtaSlots(
  html: string,
  tieredPartners?: { S: AffiliatePartner[]; A: AffiliatePartner[]; B: AffiliatePartner[] },
  fallbackLinks?: AffiliateLink[],
): string {
  const ctaSlotRegex = /<div\s+class="cta-slot"\s+data-tier="([SAB])"\s+data-position="(\w+)">[^<]*<\/div>/g;

  // cta-slot が記事内に存在しなければ何もしない
  if (!ctaSlotRegex.test(html)) return html;
  ctaSlotRegex.lastIndex = 0; // reset after test

  // tieredPartners がある場合はティア別に置換
  if (tieredPartners) {
    const tierCounters: Record<string, number> = { S: 0, A: 0, B: 0 };
    return html.replace(ctaSlotRegex, (_match, tier: string, _position: string) => {
      const partners = tieredPartners[tier as AffiliateTier] || [];
      if (partners.length === 0) return ""; // パートナー未登録なら削除
      const idx = tierCounters[tier] % partners.length;
      tierCounters[tier]++;
      return `<div class="affiliate-link rec-tier-${tier.toLowerCase()}">${partners[idx].html}</div>`;
    });
  }

  // tieredPartners がない場合 → fallbackLinks（AffiliateLink[]）で全cta-slotを置換
  const validFallback = fallbackLinks?.filter((l) => l.html && l.html.trim()) || [];
  if (validFallback.length === 0) return html;

  let fallbackIndex = 0;
  return html.replace(ctaSlotRegex, () => {
    const link = validFallback[fallbackIndex % validFallback.length];
    fallbackIndex++;
    return `<div class="product-rec-card">${link.html}</div>`;
  });
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
