// ==========================================
// BlogEngine V2 - Rakuten Product Search API
// 楽天商品検索 & アフィリエイトリンク自動生成
// ==========================================

export interface RakutenProduct {
  itemName: string;
  itemPrice: number;
  itemUrl: string;
  affiliateUrl: string;
  shopName: string;
  imageUrl: string;
  reviewAverage: number;
  reviewCount: number;
}

interface RakutenApiItem {
  Item: {
    itemName: string;
    itemPrice: number;
    itemUrl: string;
    affiliateUrl: string;
    shopName: string;
    mediumImageUrls: { imageUrl: string }[];
    reviewAverage: number;
    reviewCount: number;
  };
}

interface RakutenApiResponse {
  Items: RakutenApiItem[];
  count: number;
  hits: number;
}

/**
 * 楽天商品検索APIでアフィリエイトリンク付き商品を取得する
 */
export async function searchRakutenProducts(
  appId: string,
  affiliateId: string,
  keyword: string,
  hits: number = 5,
): Promise<RakutenProduct[]> {
  const params = new URLSearchParams({
    applicationId: appId,
    affiliateId: affiliateId,
    keyword: keyword,
    hits: String(hits),
    sort: "-reviewCount", // レビュー件数順（信頼性の高い商品を優先）
    format: "json",
  });

  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`楽天API エラー (${res.status}): ${body}`);
  }

  const data: RakutenApiResponse = await res.json();

  return data.Items.map((item) => ({
    itemName: item.Item.itemName,
    itemPrice: item.Item.itemPrice,
    itemUrl: item.Item.itemUrl,
    affiliateUrl: item.Item.affiliateUrl,
    shopName: item.Item.shopName,
    imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl || "",
    reviewAverage: item.Item.reviewAverage,
    reviewCount: item.Item.reviewCount,
  }));
}

/**
 * 楽天商品からアフィリエイトHTMLを生成する
 */
export function buildRakutenAffiliateHtml(product: RakutenProduct): string {
  return `<div class="rakuten-affiliate" style="border:1px solid #ddd;border-radius:8px;padding:16px;margin:16px 0;display:flex;gap:16px;align-items:center;">
  ${product.imageUrl ? `<a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener"><img src="${product.imageUrl}" alt="${product.itemName}" style="width:128px;height:128px;object-fit:contain;border-radius:4px;" /></a>` : ""}
  <div>
    <a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener" style="font-weight:bold;font-size:15px;color:#333;text-decoration:none;">${product.itemName}</a>
    <div style="margin-top:6px;font-size:18px;font-weight:bold;color:#bf0000;">¥${product.itemPrice.toLocaleString()}</div>
    <div style="margin-top:4px;font-size:12px;color:#666;">${product.shopName}${product.reviewCount > 0 ? ` | ★${product.reviewAverage} (${product.reviewCount}件)` : ""}</div>
    <a href="${product.affiliateUrl}" target="_blank" rel="nofollow noopener" style="display:inline-block;margin-top:8px;padding:8px 20px;background:#bf0000;color:#fff;border-radius:6px;font-size:13px;font-weight:bold;text-decoration:none;">楽天市場で見る</a>
  </div>
</div>`;
}
