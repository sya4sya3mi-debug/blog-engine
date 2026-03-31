// ==========================================
// AI三者会議 - ブログ記事テーマ提案API
// 美容プロ・アフィリエイトプロ・Xプロの3人が
// SEO上位表示＋収益化できる記事テーマを10個提案
// ==========================================

export const runtime = "edge";

import { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

const THEME_IDS = [
  "bihaku-shimi", "keana-nikibi", "aging-care",
  "datsumo", "biyou-clinic", "hair-care",
];

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
          "スキンケア 2026", "美容液 おすすめ", "毛穴 ケア",
          "医療脱毛", "美容クリニック", "エイジングケア",
          "ヘアケア おすすめ", "シミ 美白",
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

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: config.anthropicApiKey });

        const prompt = `あなたは美容ブログ「みおのミハダノート」の次に書くべき記事テーマを選定する戦略会議のファシリテーターです。

以下の3人の専門家が参加しています：

🧴 **みさき（美容のプロ）**
- 成分・処方に詳しい美容研究家
- 最新の美容トレンド、季節ケア、肌悩み別の知識が豊富
- 「今、読者が本当に知りたい美容情報」を見極める力がある
- ブログ記事として深掘りできるテーマを重視

💰 **りょうた（アフィリエイトプロ）**
- 美容系アフィリエイトで月100万円の実績
- ロングテールキーワード × 購買意欲の高い検索意図を熟知
- 「新規ブログでも上位表示しやすく、かつCVRが高い」キーワードを知っている
- SEO難易度と収益性のバランスを見極める

🔥 **ゆうな（Xのプロ）**
- フォロワー10万人の美容系インフルエンサー
- SNSでバズっているテーマ、読者の反応が高いテーマを知っている
- 「記事化すればSNSからも流入が見込める」旬のテーマを提案
- ブログとSNSの相乗効果を最大化する視点

---

## 会議の目的
美容ブログ「みおのミハダノート」（筆者みお/30代女性）で、
**SEO上位表示 × 収益化 × SNS流入**を同時に狙える記事テーマを10個選定する。

## 現在の状況
- 時期: ${month}月（${season}）
- Google検索トレンド: ${suggestions.slice(0, 12).join("、") || "（取得なし）"}
- 既存記事（重複避ける）: ${existingTitles.slice(0, 20).join("、") || "（なし）"}

## ブログの既存テーマカテゴリ
- bihaku-shimi: シミ・美白ケア
- keana-nikibi: 毛穴・ニキビ悩み
- aging-care: エイジングケア
- datsumo: 医療脱毛
- biyou-clinic: 美容クリニック施術
- hair-care: ヘアケア・頭皮ケア

## 会議の進行

### Round 1: 各プロが5テーマずつ提案（計15案）
- みさき: 美容的に今深掘りすべきテーマ5つ（成分解説・季節ケア・肌悩み等）
- りょうた: SEO上位表示しやすく収益性が高いテーマ5つ（ロングテールKW重視）
- ゆうな: SNSで今話題・記事化すれば流入が見込めるテーマ5つ

### Round 2: 議論・評価
3人で各テーマを評価。以下の基準で点数をつける：
- beauty（美容的価値・情報の深さ）: 1-10
- affiliate（収益性・CVR・検索需要）: 1-10
- seo（上位表示の狙いやすさ・ロングテール性）: 1-10

### Round 3: 最終選定
合計スコアが高い順に10テーマを選定。
各テーマに最適なキーワード・記事タイプ・対象年齢も決定。

---

## キーワード設計の指針
- **4語以上のロングテール**を狙う（例: "30代 シミ 急に増えた 原因"）
- 新規ブログでも戦えるニッチなKW
- 検索意図が明確（悩み解決 or 比較検討 or 手順）
- 「○○ おすすめ」単体は避ける（競合が強すぎる）

## 記事タイプ
以下から最適なものを選択:
- problem-solving: 悩み解決（共感→原因→対策→商品提案）
- comparison: 商品比較（比較軸明示→表→おすすめ）
- ranking: ランキング（選定基準→順位→比較表）
- review: レビュー（特徴→メリット→デメリット→こんな人に）
- howto: ハウツー（ステップ形式の手順解説）
- guide: 総合ガイド（全体像→種類→選び方→FAQ）
- qa: Q&A（PREP法で回答→根拠→注意点）
- trend: トレンド解説（背景→内容→メリット→注意点）

## 禁止事項
- 「使ってみた」「試した」「実際に使って」→ みおは調査者視点なので「調べてみた」
- 「よく聞かれる」「DMから質問」→ 事実に反する
- 既存記事と同じテーマ・キーワードは避ける
- 「○○ おすすめ」のみのビッグKWは避ける

## 出力形式
JSON配列のみ出力してください（他のテキスト不要）：

[{
  "rank": 1,
  "topic": "記事テーマ名（30文字以内）",
  "keyword": "ロングテール検索キーワード（4語以上推奨）",
  "reason": "このテーマが伸びる理由（3人の意見要約・50文字以内）",
  "themeId": "bihaku-shimi",
  "articleType": "problem-solving",
  "targetAge": "30s",
  "scores": { "beauty": 9, "affiliate": 8, "seo": 7 },
  "expert_comments": {
    "misaki": "みさきの一言（20文字以内）",
    "ryota": "りょうたの一言（20文字以内）",
    "yuna": "ゆうなの一言（20文字以内）"
  }
}]

themeId は既存カテゴリ: ${THEME_IDS.join(", ")}
articleType: "problem-solving", "comparison", "ranking", "review", "howto", "guide", "qa", "trend"
targetAge: "20s", "30s", "40s"`;

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
