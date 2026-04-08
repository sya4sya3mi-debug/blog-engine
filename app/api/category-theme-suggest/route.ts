// ==========================================
// AI三者会議 - カテゴリー記事テーマ提案API
// 美容プロ・アフィリエイトプロ・Xプロの3人が
// SEO × 収益化 × SNS流入を狙えるカテゴリー記事テーマを5個提案
// ==========================================

export const runtime = "edge";

import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

const CATEGORY_MAP = {
  "clinic-comparison": {
    label: "クリニック比較", icon: "🏥", multiSelect: true,
    subThemes: [
      { id: "clinic-datsumo", label: "医療脱毛クリニック" },
      { id: "clinic-shimi", label: "シミ取りレーザー" },
      { id: "clinic-hifu", label: "ハイフ・たるみ治療" },
      { id: "clinic-dermapen", label: "ダーマペン・毛穴治療" },
      { id: "clinic-botox", label: "ボトックス・小顔施術" },
      { id: "clinic-peeling", label: "ピーリング・光治療" },
    ],
  },
  "cosmetics": {
    label: "コスメ", icon: "💄", multiSelect: true,
    subThemes: [
      { id: "cosme-bihaku", label: "美白・シミ対策コスメ" },
      { id: "cosme-aging", label: "エイジングケア" },
      { id: "cosme-keana", label: "毛穴ケア・クレンジング" },
      { id: "cosme-uv", label: "日焼け止め・UV対策" },
      { id: "cosme-nikibi", label: "ニキビ・肌荒れケア" },
      { id: "cosme-allinone", label: "オールインワン・時短" },
    ],
  },
  "basics-howto": {
    label: "基礎知識・使い方", icon: "📖", multiSelect: false,
    subThemes: [
      { id: "basics-routine", label: "スキンケアの正しい順番" },
      { id: "basics-ingredients", label: "成分の読み方・選び方" },
      { id: "basics-skintype", label: "肌タイプ別ケア方法" },
      { id: "basics-seasonal", label: "季節別スキンケア" },
      { id: "basics-cleansing", label: "メイク落とし・洗顔の基本" },
      { id: "basics-medical-intro", label: "美容医療の基礎知識" },
    ],
  },
  "medical-beauty": {
    label: "美容医療", icon: "💉", multiSelect: false,
    subThemes: [
      { id: "medical-types", label: "施術の種類と選び方" },
      { id: "medical-downtime", label: "ダウンタイム・リスク解説" },
      { id: "medical-cost", label: "費用相場・保険適用" },
      { id: "medical-counseling", label: "カウンセリングの受け方" },
      { id: "medical-aftercare", label: "施術前後の注意点" },
      { id: "medical-vs-esthe", label: "美容皮膚科 vs エステ" },
    ],
  },
} as const;

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
          const posts = await wp.getRecentPosts(50);
          existingTitles = posts.map((p: any) =>
            typeof p.title === "string" ? p.title : p.title?.rendered || ""
          );
        } catch {}

        // Google Suggestでトレンドワードを取得
        const trendSeeds = [
          "美容クリニック 選び方", "スキンケア 順番 正しい",
          "医療脱毛 おすすめ クリニック", "シミ 美白 ケア 30代",
          "エイジングケア コスメ おすすめ", "日焼け止め 選び方 肌に優しい",
          "ハイフ 効果 持続期間", "美容医療 初めて 怖い",
        ];
        const suggestions: string[] = [];
        for (const seed of trendSeeds.slice(0, 5)) {
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

        // 現在の月・季節
        const now = new Date();
        const month = now.getMonth() + 1;
        const seasonMap: Record<number, string> = {
          1: "冬（乾燥対策・保湿強化）", 2: "冬→春（花粉・揺らぎ肌）", 3: "春（花粉・新生活・UV対策準備）",
          4: "春（UV対策本格化・新コスメ）", 5: "初夏（UV・毛穴・汗対策）", 6: "梅雨（湿気・崩れ防止・ニキビ）",
          7: "夏（UV最盛期・美白・汗対策）", 8: "夏（日焼けケア・美白集中）", 9: "秋（肌回復・保湿切替）",
          10: "秋（乾燥対策・エイジング）", 11: "冬（保湿・クリスマスコフレ）", 12: "冬（年末ベスコス・乾燥対策）",
        };
        const season = seasonMap[month] || "通年";

        // カテゴリーマップをテキスト化（プロンプト用）
        const catEntries = Object.entries(CATEGORY_MAP) as [string, { label: string; icon: string; multiSelect: boolean; subThemes: readonly { id: string; label: string }[] }][];
        const categoryMapText = catEntries.map(([catId, cat]) => {
          const subList = cat.subThemes.map((s) => "    - " + s.id + ": " + s.label).join("\n");
          const multiNote = cat.multiSelect ? " ※複数選択で比較記事になる" : "";
          return "  [" + catId + "] " + cat.icon + " " + cat.label + multiNote + "\n" + subList;
        }).join("\n\n");

                  const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: config.anthropicApiKey });

        const prompt = `あなたは美容ブログ「みおのミハダノート」のカテゴリー記事（ピラーページ）のテーマを選定する戦略会議のファシリテーターです。

カテゴリー記事とは「まとめ・教科書」として機能する重要ページです。内部リンクの核となるピラーページです。

以下の3人の専門家が参加しています：

🧴 **みさき（美容のプロ）**
- 今の季節に読者が本当に困っている悩みの教科書ページになるテーマを重視
- 深く包括的に書けるカテゴリー記事向きのテーマを見極める

💰 **りょうた（アフィリエイトプロ）**
- ピラーページ経由でサテライト記事（商品紹介）への送客を最大化するテーマを選ぶ
- 「このカテゴリー記事を読んだあと、どの商品紹介記事に流せるか」を考える

🔥 **ゆうな（Xのプロ）**
- 「保存したくなる・シェアしたくなる」まとめページテーマを知っている
- SNSシェア × SEO × 内部リンクの相乗効果を最大化する視点

---

## 現在の状況
- 時期: ${month}月（${season}）
- Google検索トレンド: ${suggestions.slice(0, 12).join("、") || "（取得なし）"}
- 既存記事（重複避ける）: ${existingTitles.slice(0, 20).join("、") || "（なし）"}

## 使用できるカテゴリー × サブテーマ
${categoryMapText}

## カテゴリー記事の2種類
1. **単独サブテーマ（isMulti: false）**: 1テーマを深掘り。basics-howto / medical-beauty はこちらのみ
2. **比較ガイド（isMulti: true）**: 2〜3テーマを比較。clinic-comparison / cosmetics のみ可能

## 会議の進行
3人それぞれが候補を出し合い、季節性・収益性・SEO難易度・内部リンク展開力を議論して5件に絞る。

## 出力形式
JSON配列のみ出力（5件、コードブロックなし）：

[{
  "rank": 1,
  "topic": "カテゴリー記事テーマ名（30文字以内）",
  "categoryId": "cosmetics",
  "subThemeIds": ["cosme-bihaku", "cosme-aging"],
  "suggestTopic": "30代 美白 シミ予防 毎日のケア方法",
  "keyword": "30代 美白コスメ シミ予防 選び方",
  "reason": "このテーマが今伸びる理由（50文字以内）",
  "isMulti": true,
  "scores": { "beauty": 9, "affiliate": 8, "seo": 7 },
  "expert_comments": {
    "misaki": "みさきの一言（20文字以内）",
    "ryota": "りょうたの一言（20文字以内）",
    "yuna": "ゆうなの一言（20文字以内）"
  }
}]

categoryId は必ず: clinic-comparison, cosmetics, basics-howto, medical-beauty のいずれか
subThemeIds は上記マップ内の有効なIDのみ使用
isMulti=true は clinic-comparison か cosmetics のみ（subThemeIds 2〜3個）`;

                let text = "";
        const aiStream = client.messages.stream({
          model: "claude-sonnet-4-6",
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
        controller.enqueue(encoder.encode(JSON.stringify({ success: true, themes, season, month })));
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
