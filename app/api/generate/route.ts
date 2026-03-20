import { NextRequest, NextResponse } from "next/server";

const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID ?? "";
const RAKUTEN_ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY ?? "";
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID ?? "";
const SITE_URL = "https://blog-engine-phi.vercel.app";

async function searchRakutenProducts(
  keyword: string
): Promise<{ name: string; url: string; price: number }[]> {
  try {
    const params = new URLSearchParams({
      applicationId: RAKUTEN_APP_ID,
      keyword,
      hits: "3",
      sort: "-reviewCount",
    });

    if (RAKUTEN_ACCESS_KEY) params.set("accessKey", RAKUTEN_ACCESS_KEY);
    if (RAKUTEN_AFFILIATE_ID) params.set("affiliateId", RAKUTEN_AFFILIATE_ID);

    const url =
      "https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601?" +
      params.toString();

    console.log("Rakuten API requesting with accessKey:", !!RAKUTEN_ACCESS_KEY);

    // ★ Node.js fetch の referrer オプションで Referer ヘッダーを確実に送信
    const res = await fetch(url, {
      referrer: SITE_URL + "/",
      referrerPolicy: "unsafe-url",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    console.log("Rakuten API response status:", res.status);

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        "Rakuten API error:",
        res.status,
        errText.substring(0, 300)
      );
      return [];
    }

    const data = await res.json();
    const items = data.Items ?? [];
    console.log("Rakuten products found:", items.length);

    if (items.length > 0) {
      const firstItem = items[0]?.Item || items[0];
      console.log("First item name:", firstItem?.itemName?.substring(0, 40));
      console.log("First item affiliateUrl exists:", !!firstItem?.affiliateUrl);
    }

    return items.map((entry: any) => {
      const item = entry.Item || entry;
      return {
        name: item.itemName,
        url: RAKUTEN_AFFILIATE_ID ? item.affiliateUrl : item.itemUrl,
        price: item.itemPrice,
      };
    });
  } catch (e) {
    console.error("Rakuten search error:", e);
    return [];
  }
}

function insertAffiliateLinks(
  text: string,
  products: { name: string; url: string; price: number }[]
): string {
  let productIndex = 0;
  return text.replace(/【アフィリエイトリンク挿入予定：楽天】/g, () => {
    const product = products[productIndex];
    productIndex++;
    if (!product) return "【楽天で探す】";
    return (
      "\n\n👉 [" +
      product.name.substring(0, 50) +
      " (¥" +
      product.price.toLocaleString() +
      ") を楽天で見る](" +
      product.url +
      ")\n\n"
    );
  });
}

export async function POST(req: NextRequest) {
  try {
    const { keyword, siteTheme, afName } = await req.json();

    if (!keyword || !siteTheme) {
      return NextResponse.json(
        { error: "keyword is required" },
        { status: 400 }
      );
    }

    const prompt =
      "SEOに精通したアフィリエイトブログライターとして記事を作成してください。\n[テーマ] " +
      siteTheme +
      "\n[キーワード] " +
      keyword +
      "\n[アフィリエイト] " +
      afName +
      "\n[文字数] 1000字程度\n\n# [タイトル]\n## はじめに\n## おすすめ商品3選（各商品の後に【アフィリエイトリンク挿入予定：楽天】と記載）\n## まとめ\n\n※メタディスクリプション（120字以内）：";

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
      return NextResponse.json(
        { error: "article generation failed" },
        { status: 500 }
      );
    }

    const data = await res.json();
    let text = data.content?.[0]?.text ?? "failed";

    if (afName?.includes("楽天") && RAKUTEN_APP_ID) {
      console.log("Searching Rakuten for:", keyword);
      const products = await searchRakutenProducts(keyword);
      console.log("Rakuten search completed. Products:", products.length);
      if (products.length > 0) {
        text = insertAffiliateLinks(text, products);
        console.log("Affiliate links inserted successfully");
      } else {
        console.log("No Rakuten products found, skipping link insertion");
      }
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
