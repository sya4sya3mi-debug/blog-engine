// ==========================================
// BlogEngine V2 - CTA Template System
// ティア別・記事タイプ別のCTAテンプレート
// ==========================================

import { AffiliateTier } from "./affiliate";

export interface CTAParams {
  programName: string;      // クリニック名・商品名
  affiliateHtml: string;    // アフィリエイトリンクHTML
  tier: AffiliateTier;
  month?: number;           // 現在の月（緊急性要素用）
}

/**
 * 現在の月を取得（JST）
 */
function getCurrentMonth(): number {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.getMonth() + 1;
}

/**
 * 季節に応じたフレーズを取得
 */
function getSeasonalPhrase(month: number): string {
  if (month >= 3 && month <= 5) return "春の紫外線対策シーズン";
  if (month >= 6 && month <= 8) return "夏の美容ケアシーズン";
  if (month >= 9 && month <= 11) return "秋の肌リセットシーズン";
  return "冬の乾燥対策シーズン";
}

/**
 * S-rank CTA: クリニック予約用
 * 不安解消ポイント + 無料カウンセリングCTA
 */
export function buildClinicCTA(params: CTAParams): string {
  const month = params.month || getCurrentMonth();
  const seasonal = getSeasonalPhrase(month);

  return `<div class="cta-box cta-tier-s">
  <div class="cta-badge">📋 無料カウンセリング</div>
  <h4>${params.programName}</h4>
  <ul class="cta-points">
    <li>✅ 無料カウンセリングで不安を解消</li>
    <li>✅ ${seasonal}のお得なプランあり</li>
    <li>✅ オンライン予約で待ち時間なし</li>
  </ul>
  <div class="cta-link">
    ${params.affiliateHtml}
  </div>
  <p class="cta-note">※ カウンセリングは無料です。施術を強要されることはありません。</p>
</div>`;
}

/**
 * A-rank CTA: トライアル購入用
 * 商品特徴 + お試し価格 + 申し込みボタン
 */
export function buildTrialCTA(params: CTAParams): string {
  const month = params.month || getCurrentMonth();

  return `<div class="cta-box cta-tier-a">
  <div class="cta-badge">🎁 初回限定</div>
  <h4>${params.programName}</h4>
  <p class="cta-description">${month}月の限定キャンペーン実施中</p>
  <div class="cta-link">
    ${params.affiliateHtml}
  </div>
  <p class="cta-note">※ 個人の感想であり、効果を保証するものではありません。</p>
</div>`;
}

/**
 * B-rank CTA: EC商品購入用
 * シンプルな商品カード
 */
export function buildProductCTA(params: CTAParams): string {
  return `<div class="cta-box cta-tier-b">
  <div class="cta-link">
    ${params.affiliateHtml}
  </div>
</div>`;
}

/**
 * ティアに応じたCTAを生成
 */
export function buildCTA(params: CTAParams): string {
  switch (params.tier) {
    case "S":
      return buildClinicCTA(params);
    case "A":
      return buildTrialCTA(params);
    case "B":
    default:
      return buildProductCTA(params);
  }
}
