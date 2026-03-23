import { NextRequest, NextResponse } from "next/server";

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
      "SEOに精通したアフィリエイトブログライターとして記事を作成してください。\n※タイトルに「プロ」という言葉は事実に反する可能性があるため使用しないでください。\n[テーマ] " +
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
    const text = data.content?.[0]?.text ?? "failed";

    // 楽天のアフィリエイト情報をクライアントに返す（ブラウザ側でAPIを呼ぶため）
    const rakutenConfig =
      afName?.includes("楽天") && process.env.RAKUTEN_APP_ID
        ? {
            appId: process.env.RAKUTEN_APP_ID,
            accessKey: process.env.RAKUTEN_ACCESS_KEY ?? "",
            affiliateId: process.env.RAKUTEN_AFFILIATE_ID ?? "",
          }
        : null;

    return NextResponse.json({ text, rakutenConfig, keyword });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
