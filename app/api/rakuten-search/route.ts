// ==========================================
// BlogEngine V2 - Rakuten Product Search Endpoint
// 楽天商品検索 → アフィリエイトリンク自動取得
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";

export async function POST(req: NextRequest) {
  const { keyword, hits } = (await req.json()) as { keyword: string; hits?: number };

  const rakutenAppId = process.env.RAKUTEN_APP_ID;
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;
  const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID;

  if (!rakutenAppId || !rakutenAffiliateId) {
    return NextResponse.json(
      { error: "楽天API設定がありません。環境変数 RAKUTEN_APP_ID, RAKUTEN_ACCESS_KEY, RAKUTEN_AFFILIATE_ID を設定してください" },
      { status: 400 }
    );
  }

  if (!keyword || !keyword.trim()) {
    return NextResponse.json({ error: "検索キーワードを入力してください" }, { status: 400 });
  }

  try {
    const products = await searchRakutenProducts(rakutenAppId, rakutenAffiliateId, keyword, hits || 5, rakutenAccessKey);

    const results = products.map((p) => ({
      ...p,
      affiliateHtml: buildRakutenAffiliateHtml(p),
    }));

    return NextResponse.json({ status: "success", products: results });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
