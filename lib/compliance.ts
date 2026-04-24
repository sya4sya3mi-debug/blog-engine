// ==========================================
// BlogEngine V2 - Compliance Auto-Fixer
// 外部リンク rel 補正 / PR表記 / 誇大表現チェック
// ==========================================

export interface ComplianceResult {
  fixed: boolean;
  fixes: string[];
  warnings: string[];
}

const AFFILIATE_HOST_PATTERN =
  /rakuten|afl\.rakuten|a8\.net|moshimo|felmat|valuecommerce|afb|accesstrade|janet|linksynergy|amzn\.to|amazon\./i;

function isKnownAffiliateHref(href: string): boolean {
  return AFFILIATE_HOST_PATTERN.test(href);
}

function isAffiliateLink(attrs: string): boolean {
  const href = attrs.match(/href="([^"]+)"/i)?.[1] || "";
  const className = attrs.match(/class="([^"]+)"/i)?.[1] || "";
  const rel = attrs.match(/rel="([^"]+)"/i)?.[1] || "";

  return (
    /affiliate-link|product-rec-card|rec-tier-/i.test(className) ||
    /\bsponsored\b/i.test(rel) ||
    isKnownAffiliateHref(href)
  );
}

function normalizeRel(attrs: string, affiliate: boolean): { attrs: string; changed: boolean } {
  const relMatch = attrs.match(/rel="([^"]*)"/i);
  const required = affiliate
    ? ["nofollow", "sponsored", "noopener", "noreferrer"]
    : ["nofollow", "noopener", "noreferrer"];

  if (!relMatch) {
    return {
      attrs: `${attrs} rel="${required.join(" ")}"`,
      changed: true,
    };
  }

  const current = relMatch[1].split(/\s+/).filter(Boolean);
  const normalized = current.filter((value) => affiliate || value !== "sponsored");
  for (const value of required) {
    if (!normalized.includes(value)) normalized.push(value);
  }

  const nextRel = normalized.join(" ");
  if (nextRel === relMatch[1]) {
    return { attrs, changed: false };
  }

  return {
    attrs: attrs.replace(/rel="[^"]*"/i, `rel="${nextRel}"`),
    changed: true,
  };
}

/**
 * コンプライアンス自動補正
 * - PR表記の自動挿入
 * - 外部リンクの rel 補正
 * - ランキング記事の評価軸チェック
 * - 誇大表現や断定表現の警告
 */
export function autoFixCompliance(html: string | undefined | null): { html: string; result: ComplianceResult } {
  const fixes: string[] = [];
  const warnings: string[] = [];
  let fixedHtml = html || "";

  if (!fixedHtml.includes("pr-notice")) {
    fixedHtml = `<div class="pr-notice" style="font-size:11px;color:#999;margin-bottom:16px;">PR・本記事にはアフィリエイト広告が含まれています</div>\n${fixedHtml}`;
    fixes.push("PR表記を記事冒頭に自動挿入しました");
  }

  const linkRegex = /<a\s+([^>]*href="https?:\/\/[^"]*"[^>]*)>/g;
  fixedHtml = fixedHtml.replace(linkRegex, (match, attrs: string) => {
    const affiliate = isAffiliateLink(attrs);
    const normalized = normalizeRel(attrs, affiliate);
    if (!normalized.changed) return match;

    fixes.push(
      affiliate
        ? "アフィリエイトリンクに rel=\"nofollow sponsored noopener noreferrer\" を補正しました"
        : "編集用外部リンクに rel=\"nofollow noopener noreferrer\" を補正しました",
    );
    return `<a ${normalized.attrs}>`;
  });

  if ((fixedHtml.includes("ランキング") || fixedHtml.includes("おすすめ")) &&
      !fixedHtml.includes("ranking-criteria") &&
      !fixedHtml.includes("選定基準")) {
    warnings.push("ランキング記事ですが、選定基準の記載が見つかりません。景表法対応のため、選定基準を明記してください");
  }

  const forbiddenPatterns = [
    { pattern: /シミが消え/, label: "「シミが消える」は化粧品表現として強すぎます" },
    { pattern: /シワが治/, label: "「シワが治る」は化粧品表現として強すぎます" },
    { pattern: /必ず改善/, label: "「必ず改善」は断定表現です" },
    { pattern: /日本一/, label: "「日本一」は最大級表現です" },
    { pattern: /No\.?1/, label: "「No.1」は根拠のない最大級表現になりやすいです" },
    { pattern: /誰でも効果/, label: "「誰でも効果」は個人差を無視した表現です" },
    { pattern: /医師不要/, label: "「医師不要」は医療判断を誤認させるおそれがあります" },
    { pattern: /最強/, label: "「最強」は最大級表現です" },
    { pattern: /\d+%の人が/, label: "人数・割合の断定には根拠が必要です" },
    { pattern: /医師(が|も)認/, label: "根拠不明の権威づけ表現の可能性があります" },
  ];

  for (const { pattern, label } of forbiddenPatterns) {
    if (pattern.test(fixedHtml)) {
      warnings.push(label);
    }
  }

  const experiencePatterns = /(?:使ってみ|試してみ|やってみ|続けてみ|比べてみ)[たて]/g;
  const expMatches = fixedHtml.match(experiencePatterns);
  if (expMatches && expMatches.length > 0 && !fixedHtml.includes("個人差があります")) {
    warnings.push("体験談が含まれていますが、「効果の感じ方には個人差があります」の注記が見当たりません");
  }

  return {
    html: fixedHtml,
    result: {
      fixed: fixes.length > 0,
      fixes,
      warnings,
    },
  };
}
