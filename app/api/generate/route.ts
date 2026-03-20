import { NextRequest, NextResponse } from "next/server";

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID ?? "";
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID ?? "";

async function searchRakutenProducts(keyword: string): Promise<{ name: string; url: string; price: number }[]> {
  try {
    const params = new URLSearchParams({
      applicationId: RAKUTEN_APP_ID,
      keyword,
      hits: "3",
      sort: "-reviewCount",
      imageFlag: "1",
    });
    if (RAKUTEN_AFFILIATE_ID) params.set("affiliateId", RAKUTEN_AFFILIATE_ID);

    const res = await fetch(`https://openapi.rakuten.co.jp/services/api/IchibaItem/Search/20220601?${params}`);
    if (!res.ok) return [];

    const data = await res.json();
    return (data.Items ?? []).map((item: any) => ({
      name: item.Item.itemName,
      url: RAKUTEN_AFFILIATE_ID ? item.Item.affiliateUrl : item.Item.itemUrl,
      price: item.Item.itemPrice,
    }));
  } catch {
    return [];
  }
}

function insertAffiliateLinks(text: string, products: { name: string; url: string; price: number }[]): string {
  let productIndex = 0;
  return text.replace(/【アフィリエイトリンク挿入予定：楽天】/g, () => {
    const product = products[productIndex];
    productIndex++;
    if (!product) return "【楽天で探す】";
    return `\n👉 [${product.name} (¥${product.price.toLocaleString()}) を楽天で見る](${product.url})\n`;
  });
}

export async function POST(req: NextRequest) {
  try {
    const { keyword, siteTheme, afName } = await req.json();

    if (!keyword || !siteTheme) {
      return NextResponse.json({ error: "keyword is required" }, { status: 400 });
    }

    const prompt = `SEOに精通したアフィリエイトブログライターとして記事を作成してください。
[テーマ] ${siteTheme}h
[キーワード] ${keyword}
[アフィリエイト] ${afName}
[文字数] 1000字程度

# [タイトル]
## はじめに
## おすすめ商品3選（各商品の後に【アフィリエイトリンク挿入予定：楽天】と記載）
## まとめ

※メタディスクリプション（120字以内）：`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("Anthropic API error:", err);
      return NextResponse.json({ error: "記事生成に失敗しました" }, { status: 500 });
    }

    const data = await res.json();
    let text = data.content?.[0]?.text ?? "生成に失敗しました";

    // 楽天アフィリエイトが選択されている場合は商品リンクを自動挿入
    if (afName?.includes("楽天") && RAKUTEN_APP_ID) {
      const products = await searchRakutenProducts(keyword);
      if (products.length > 0) {
        text = insertAffiliateLinks(text, products);
      }
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
