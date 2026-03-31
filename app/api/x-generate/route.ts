// ==========================================
// BlogEngine V2 - X投稿・スレッド自動生成API
// Claude AIで1週間分のX投稿を自動生成
// ==========================================

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

// 投稿時間のプリセット（JST）
const POST_TIMES = {
  morning: "09:00",
  evening: "20:00",
  thread_wed: "12:00",
  thread_sat: "12:00",
};

export async function POST(req: NextRequest) {
  const config = getConfig();
  const body = await req.json();
  const { mode, days } = body as { mode: "week" | "thread" | "single"; days?: number };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // ハートビートでVercel Edge Runtimeのタイムアウトを回避
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(" ")); } catch {}
      }, 3000);

      try {
        // WordPress既存記事を取得
        const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
        let existingPosts: { title: string; link: string; slug: string }[] = [];
        try {
          const posts = await wp.getRecentPosts(20);
          existingPosts = posts.map((p: any) => ({
            title: typeof p.title === "string" ? p.title : p.title?.rendered || "",
            link: p.link,
            slug: p.slug,
          }));
        } catch {}

        const postList = existingPosts.length > 0
          ? existingPosts.map((p, i) => `${i + 1}. 「${p.title}」 ${p.link}`).join("\n")
          : "（まだ記事がありません）";

        const Anthropic = (await import("@anthropic-ai/sdk")).default;
        const client = new Anthropic({ apiKey: config.anthropicApiKey });

        const numDays = days || 7;
        const startDate = new Date();
        const scheduleDates: { date: string; dayOfWeek: number; morning: string; evening: string }[] = [];
        for (let i = 0; i < numDays; i++) {
          const d = new Date(startDate);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().split("T")[0];
          const dow = d.getDay();
          scheduleDates.push({
            date: dateStr, dayOfWeek: dow,
            morning: `${dateStr}T${POST_TIMES.morning}:00+09:00`,
            evening: `${dateStr}T${POST_TIMES.evening}:00+09:00`,
          });
        }

        const prompt = mode === "thread"
          ? buildThreadPrompt(postList)
          : buildWeeklyPrompt(numDays, scheduleDates, postList);

        // Claude APIストリーミング
        let text = "";
        const aiStream = client.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          messages: [{ role: "user", content: prompt }],
        });
        for await (const event of aiStream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
          }
        }

        // JSONを抽出
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          clearInterval(heartbeat);
          controller.enqueue(encoder.encode(JSON.stringify({ error: "AIからの応答をパースできませんでした", raw: text.slice(0, 200) })));
          controller.close();
          return;
        }

        let tweets;
        try {
          tweets = JSON.parse(jsonMatch[0]);
        } catch {
          const repaired = jsonMatch[0].replace(/,\s*$/, "").replace(/,\s*\]/, "]") + "]";
          try {
            tweets = JSON.parse(repaired);
          } catch {
            clearInterval(heartbeat);
            controller.enqueue(encoder.encode(JSON.stringify({ error: "JSON解析に失敗しました" })));
            controller.close();
            return;
          }
        }

        clearInterval(heartbeat);
        controller.enqueue(encoder.encode(JSON.stringify({ success: true, tweets })));
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

function buildWeeklyPrompt(days: number, dates: any[], postList: string): string {
  // 既存記事リストは最大10件に制限（トークン節約）
  const shortPostList = postList.split("\n").slice(0, 10).join("\n");

  const dateList = dates.map((d) => `${d.date}（${["日","月","火","水","木","金","土"][d.dayOfWeek]}）朝:${d.morning} 夜:${d.evening}`).join("\n");

  return `美容ブログ「みおのミハダノート」のX投稿を${days}日分作成。

キャラ：みお/30代/親しみやすい/美容オタク/調査するのが好き

記事一覧：
${shortPostList}

【最重要】ブックマーク率を上げることを最優先にする。
「あとで見返したくなる」有益な情報を必ず含める。

ルール：
- 1日2回（朝9時・夜20時）の投稿を生成
- 通常投稿(type:"normal"): 280文字以内
- 長文投稿(type:"long"): 300-500文字（X Premium対応）
  → ${days}日分のうち少なくとも1回は長文を含める
  → 長文は成分解説/スキンケアルーティン/口コミまとめ等の「ミニ記事」形式
- ハッシュタグ2個（#スキンケア #美容 等）
- 本文にURLを入れない。「プロフのリンクから👆」と誘導
- blogUrlに関連記事URLを設定（nullでもOK）
- 「使ってみた」「試した」「実際に使って」禁止→「調べてみた」「口コミを見て」を使う
- 「読者さんからよく聞かれる」「DMから質問」は禁止（事実に反するため）

【ブックマーク誘導テクニック】
- 数字・リスト・チェックマーク（✅）を積極活用
- 🔖マークで保存を促す投稿を2日に1回は入れる
- パターン例：「【保存版】」「知らないと損」「✅チェックリスト」「結論→詳細はブログで」
- 種類バランス：保存系豆知識40%/悩み共感20%/記事紹介20%/質問形式20%

日時：
${dateList}

JSON配列のみ出力（他の文章不要）：
[{"text":"投稿文","scheduledAt":"${dates[0]?.morning}","type":"normal","blogUrl":null}]
※ type は "normal" または "long" のいずれか`;
}

function buildThreadPrompt(postList: string): string {
  const shortPostList = postList.split("\n").slice(0, 10).join("\n");
  return `美容ブログ「みおのミハダノート」のXスレッドを1本作成。

キャラ：みお/30代/美容オタク/調査するのが好き
記事：${shortPostList}

ルール：
- 5ツイートで1スレッド、各280文字以内
- 構成：1/5 フック（🔖保存推奨を入れる）→ 2-4/5 有益情報（数字・リスト・✅活用）→ 5/5 まとめ+ブックマーク促進
- ハッシュタグ2個（最後のみ）
- 「使ってみた」「試した」禁止→「調べてみた」を使う
- 「読者さんからよく聞かれる」「DMから質問」は禁止
- 本文にURL入れない
- ブックマークされることを意識して、あとで見返したくなる有益情報を含める

JSON配列のみ出力：
[{"text":"1ツイート目","type":"thread","threadTexts":["1/5","2/5","3/5","4/5","5/5"],"blogUrl":null}]`;
}
