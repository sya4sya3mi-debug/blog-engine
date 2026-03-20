import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { keyword, siteTheme, afName } = await req.json();

    if (!keyword || !siteTheme) {
      return NextResponse.json({ error: "キーワードが必要です" }, { status: 400 });
    }

    const prompt = `SEOに精通したアフィリエイトブログライターとして記事を作成してください。
【テーマ】${siteTheme}
【キーワード】${keyword}
【アフィリエイト】${afName}
【文字数】1000字程度

# [タイトル]
## はじめに
## おすすめ商品3選（各商品の後に【アフィリエイトリンク挿入予定】と記載）
## まとめ
---
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
    const text = data.content?.[0]?.text ?? "生成に失敗しました";
    return NextResponse.json({ text });
  } catch (err) {
    console.error("Generate API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
