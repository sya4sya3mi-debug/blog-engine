// ==========================================
// BlogEngine V2 - Rakuten Product Search Endpoint
// 楽天商品検索 → 収益最適化アフィリエイトリンク自動取得
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { searchRakutenProducts, buildRakutenAffiliateHtml } from "@/lib/rakuten";

// GETハンドラー（おまかせ検索・成分フィルターから呼ばれる）
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword") || "";
  const hits = url.searchParams.get("hits") ? Number(url.searchParams.get("hits")) : 10;
  const themeId = url.searchParams.get("themeId") || undefined;
  const minPrice = url.searchParams.get("minPrice") ? Number(url.searchParams.get("minPrice")) : undefined;
  const maxPrice = url.searchParams.get("maxPrice") ? Number(url.searchParams.get("maxPrice")) : undefined;
  return handleSearch(keyword, hits, themeId, minPrice, maxPrice);
}

// POSTハンドラー（手動検索・記事生成タブから呼ばれる）
export async function POST(req: NextRequest) {
  const { keyword, hits, themeId, minPrice, maxPrice } = (await req.json()) as {
    keyword: string;
    hits?: number;
    themeId?: string;
    minPrice?: number;
    maxPrice?: number;
  };
  return handleSearch(keyword || "", hits || 10, themeId, minPrice, maxPrice);
}

async function handleSearch(keyword: string, hits: number, themeId?: string, minPrice?: number, maxPrice?: number) {

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
    const products = await searchRakutenProducts(
      rakutenAppId,
      rakutenAffiliateId,
      keyword,
      hits || 10,
      rakutenAccessKey,
      {
        themeId,
        minPrice,
        maxPrice,
        maxResults: hits || 10,
        expandKeywords: !!themeId,
      },
    );

    const results = products.map((p) => ({
      ...p,
      affiliateHtml: buildRakutenAffiliateHtml(p),
    }));

    return NextResponse.json({ status: "success", products: results });
  } catch (error: any) {
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
