// ==========================================
// BlogEngine V2 - Compliance Auto-Fixer
// 薬機法・景表法・ステマ規制の自動チェック＆修正
// ==========================================

export interface ComplianceResult {
  fixed: boolean;
  fixes: string[];
  warnings: string[];
}

/**
 * 投稿前コンプライアンス自動修正
 * - PR表記の確認＆挿入
 * - rel="nofollow sponsored" 自動付与
 * - 体験談ディスクレーマー確認
 * - ランキング根拠チェック
 */
export function autoFixCompliance(html: string): { html: string; result: ComplianceResult } {
  const fixes: string[] = [];
  const warnings: string[] = [];
  let fixedHtml = html || "";

  // 1. PR表記チェック — 記事冒頭にpr-noticeがなければ挿入
  if (!fixedHtml.includes('pr-notice')) {
    fixedHtml = `<div class="pr-notice" style="font-size:11px;color:#999;margin-bottom:16px;">PR：本記事にはアフィリエイト広告が含まれています</div>\n${fixedHtml}`;
    fixes.push("PR表記を記事冒頭に自動挿入しました");
  }

  // 2. 外部リンクに rel="nofollow sponsored" を自動付与
  // アフィリエイトリンク（affiliate-link クラス内のリンク）に対して
  const linkRegex = /<a\s+([^>]*href="https?:\/\/[^"]*"[^>]*)>/g;
  fixedHtml = fixedHtml.replace(linkRegex, (match, attrs: string) => {
    // 既に rel 属性がある場合
    if (/rel=/.test(attrs)) {
      // nofollow と sponsored が含まれているかチェック
      const relMatch = attrs.match(/rel="([^"]*)"/);
      if (relMatch) {
        const relValues = relMatch[1].split(/\s+/);
        let needsFix = false;
        if (!relValues.includes("nofollow")) {
          relValues.push("nofollow");
          needsFix = true;
        }
        if (!relValues.includes("sponsored")) {
          relValues.push("sponsored");
          needsFix = true;
        }
        if (needsFix) {
          const newAttrs = attrs.replace(/rel="[^"]*"/, `rel="${relValues.join(" ")}"`);
          fixes.push("外部リンクに nofollow/sponsored を追加しました");
          return `<a ${newAttrs}>`;
        }
      }
      return match;
    }
    // rel 属性がない場合 — 追加
    fixes.push("外部リンクに rel=\"nofollow sponsored\" を自動付与しました");
    return `<a ${attrs} rel="nofollow sponsored">`;
  });

  // 3. ランキング記事の根拠チェック
  if (fixedHtml.includes("ランキング") || fixedHtml.includes("おすすめ順")) {
    if (!fixedHtml.includes("ranking-criteria") && !fixedHtml.includes("選定基準")) {
      warnings.push("ランキング記事ですが、選定基準（ranking-criteria）が見つかりません。景表法対応のため、選定基準を明記してください");
    }
  }

  // 4. 禁止表現チェック（警告のみ）
  const forbiddenPatterns = [
    // 薬機法違反
    { pattern: /必ず治[るり]/, label: "「必ず治る」→「ケアが期待できる」に変更推奨" },
    { pattern: /確実に改善/, label: "「確実に改善」→「改善が見込める」に変更推奨" },
    { pattern: /シミが消え/, label: "「シミが消える」→「シミにアプローチ」に変更推奨" },
    { pattern: /シワが治/, label: "「シワが治る」→「シワケアをサポート」に変更推奨" },
    { pattern: /ニキビが治/, label: "「ニキビが治る」→「ニキビケアをサポート」に変更推奨" },
    { pattern: /アンチエイジング/, label: "「アンチエイジング」→「エイジングケア」に変更推奨（薬機法）" },
    { pattern: /肌が生まれ変わ/, label: "「肌が生まれ変わる」は効能逸脱表現です" },
    { pattern: /若返[るり]/, label: "「若返る」は効能逸脱表現です" },
    // 景表法違反
    { pattern: /最強/, label: "「最強」は最大級表現のため使用を避けてください" },
    { pattern: /日本一/, label: "「日本一」は最大級表現のため使用を避けてください" },
    { pattern: /業界No\.?1/, label: "「業界No.1」は根拠なき最大級表現です" },
    { pattern: /誰でも簡単に/, label: "「誰でも簡単に」は根拠なき効果保証のため使用を避けてください" },
    { pattern: /\d+%の(方|人|ユーザー)が/, label: "「〇%の人が」は根拠なき数値。出典がない限り禁止" },
    // ステマ規制
    { pattern: /医師(も|が)推薦/, label: "「医師が推薦」は医師推薦を装う表現です" },
    { pattern: /芸能人(も|が)愛用/, label: "「芸能人が愛用」は根拠なき権威付けです" },
  ];

  for (const { pattern, label } of forbiddenPatterns) {
    if (pattern.test(fixedHtml)) {
      warnings.push(label);
    }
  }

  // 5. 体験談後のディスクレーマーチェック
  // 体験談パターンを検出（「使ってみた」「試してみた」「通ってみた」等）
  const experiencePatterns = /(?:使ってみ|試してみ|通ってみ|受けてみ|始めてみ)[たて]/g;
  const expMatches = fixedHtml.match(experiencePatterns);
  if (expMatches && expMatches.length > 0) {
    if (!fixedHtml.includes("効果には個人差があります")) {
      warnings.push("体験談が含まれていますが「※ 効果には個人差があります」のディスクレーマーが見つかりません");
    }
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
