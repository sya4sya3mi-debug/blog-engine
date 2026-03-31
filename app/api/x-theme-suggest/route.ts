// ==========================================
// AI三者会議テーマ提案API
// 美容プロ・アフィリエイトプロ・Xプロの3人が
// 会議で最もブックマーク・拡散されやすい10テーマを提案
// ==========================================

export const runtime = "edge";

import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

export async function POST(req: NextRequest) {
  const config = getConfig();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        // 既存記事を取得（重複回避用）
        const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
        let existingTitles: string[] = [];
        try {
          const posts = await wp.getRecentPosts(30);
          existingTitles = posts.map((p: any) =>
            typeof p.title === "string" ? p.title : p.title?.rendered || ""
          );
        } catch {}

        // Google Suggestで今のトレンドワードを取得
        const trendSeeds = ["スキンケア", "美容液", "日焼け止め", "毛穴", "コスメ 新作"];
        const suggestions: string[] = [];
        for (const seed of trendSeeds.slice(0, 3)) {
          try {
            const suggestUrl = `https://suggestqueries.google.com/complete/search?q=${encodeURIComponent(seed)}&client=firefox&hl=ja&gl=jp`;
            const res = await fetch(suggestUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data) && Array.isArray(data[1])) {
                suggestions.push(...data[1].slice(0, 3));
              }
            }
          } catch {}
        }

        // 現在の月・季節を取得
        const now = new Date();
        const month = now.getMonth() + 1;
        const seasonMap: Record<number, string> = {
          1: "冬（乾燥対策）", 2: "冬→春（花粉・揺らぎ肌）", 3: "春（花粉・新生活）",
          4: "春（UV対策開始）", 5: "初夏（UV・毛穴）", 6: "梅雨（湿気・崩れ防止）",
          7: "夏（UV・汗対策）", 8: "夏（美白・日焼けケア）", 9: "秋（肌回復・保湿）",
          10: "秋（乾燥対策開始）", 11: "冬（保湿・エイジング）", 12: "冬（年末ベスコス）",
        };
        const season = seasonMap[month] || "通年";

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: config.anthropicApiKey });

        const prompt = `あなたは美容ブログ「みおのミハダノート」のX投稿テーマを選定するための会議を開催するファシリテーターです。

以下の3人の専門家が参加しています：

🧴 **みさき（美容のプロ）**
- 成分・処方に詳しい美容研究家
- 最新の美容トレンド、季節ケア、肌悩み別の知識が豊富
- 「今、本当に知るべき美容情報」を見極める力がある

💰 **りょうた（アフィリエイトプロ）**
- 美容系アフィリエイトで月100万円の実績
- 検索ボリューム、CVR、購買意欲の高いキーワードを熟知
- 「これを投稿すればプロフからブログに飛んでくれる」テーマを知っている

🔥 **ゆうな（Xのプロ）**
- フォロワー10万人の美容系インフルエンサー
- ブックマーク率・RT率を最大化するフォーマットを熟知
- 「保存される投稿」の法則を知り尽くしている

---

## 会議の目的
美容ブログ「みおのミハダノート」（筆者みお/30代女性）のXアカウントで、
**ブックマーク数・保存数を最大化する**投稿テーマを10個選定する。

## 現在の状況
- 時期: ${month}月（${season}）
- Google検索トレンド: ${suggestions.slice(0, 8).join("、") || "（取得なし）"}
- 既存記事テーマ（重複避ける）: ${existingTitles.slice(0, 15).join("、") || "（なし）"}

## 会議の進行

### Round 1: 各プロが5テーマずつ提案（計15案）
- みさき: 美容的に今知るべきテーマ5つ
- りょうた: 収益・検索需要が高いテーマ5つ
- ゆうな: Xでバズる・保存されるテーマ5つ

### Round 2: 議論・評価
3人で各テーマを評価。以下の基準で点数をつける：
- beauty（美容価値）: 1-10
- affiliate（収益性・検索需要）: 1-10
- x_viral（X拡散力・保存率）: 1-10

### Round 3: 最終選定
合計スコアが高い順に10テーマを選定。
各テーマに最適な投稿スタイルと文字数も決定。

---

## 禁止事項
- 「使ってみた」「試した」「実際に使って」→ みおは調査者視点
- 「よく聞かれる」「DMから質問」→ 事実に反する
- 既存記事と同じテーマは避ける

## 出力形式
JSON配列のみ出力してください（他のテキスト不要）：

[{
  "rank": 1,
  "topic": "テーマ名",
  "reason": "このテーマが伸びる理由（3人の意見を要約・50文字以内）",
  "style": "save-list",
  "length": "long",
  "hashtags": ["#タグ1", "#タグ2"],
  "scores": { "beauty": 9, "affiliate": 7, "x_viral": 9 },
  "expert_comments": {
    "misaki": "みさきの一言コメント（20文字以内）",
    "ryota": "りょうたの一言コメント（20文字以内）",
    "yuna": "ゆうなの一言コメント（20文字以内）"
  }
}]

style は以下のいずれか: "save-list", "must-know", "conclusion", "compare", "checklist", "surprise", "seasonal", "empathy"
length は "short"（280字以内） または "long"（300-500字のPremium長文）`;

        let text = "";
        const aiStream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const event of aiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
          }
        }

        // JSON抽出
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          clearInterval(heartbeat);
          controller.enqueue(encoder.encode(JSON.stringify({ error: "AIの応答をパースできませんでした", raw: text.slice(0, 300) })));
          controller.close();
          return;
        }

        let themes;
        try {
          themes = JSON.parse(jsonMatch[0]);
        } catch {
          const repaired = jsonMatch[0].replace(/,\s*$/, "").replace(/,\s*\]/, "]");
          try {
            themes = JSON.parse(repaired);
          } catch {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ error: "JSON解析に失敗しました" })));
            controller.close();
            return;
          }
        }

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({ success: true, themes, season })));
        controller.close();
      } catch (e: any) {
        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({ error: e.message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
