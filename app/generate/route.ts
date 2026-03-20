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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【ファイル2】components/Dashboard.tsx の generateArticle関数だけ差し替え
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dashboard.tsx の中の generateArticle 関数（async function generateArticle() { ... }）を
以下にまるごと差し替えてください：

  async function generateArticle() {
    if (!keyword.trim()) return;
    setGenerating(true); setStreamText(""); setShowGenModal(true);
    const siteTheme = selectedSite.theme === "tech" ? "ガジェット・テクノロジー" : selectedSite.theme === "beauty" ? "美容・コスメ" : "旅行";
    const afName = AFFILIATES.find(a => a.id === affiliate)?.name ?? "";
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, siteTheme, afName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
      const text = data.text ?? "生成に失敗しました";
      let i = 0;
      const iv = setInterval(async () => {
        if (i <= text.length) { setStreamText(text.slice(0, i)); i += 12; if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight; }
        else {
          clearInterval(iv); setGenerating(false);
          const title = text.match(/^#\s+(.+)/m)?.[1] ?? keyword;
          const newItem = { id: Date.now(), site: selectedSite.name, siteColor: selectedSite.color, title, keyword, generatedAt: new Date().toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }), scheduledFor: `${scheduleDate} ${scheduleTime}`, status: "pending", content: text, comment: "" };
          setQueue(prev => [newItem, ...prev]); setStreamText(text);
          await sendNotification({ type: "pending", title, site: selectedSite.name, siteColor: selectedSite.color, keyword, scheduledFor: `${scheduleDate} ${scheduleTime}` });
        }
      }, 16);
    } catch (e: any) { setStreamText("エラー: " + e.message); setGenerating(false); }
  }
