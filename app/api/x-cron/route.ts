// ==========================================
// BlogEngine V2 - X投稿自動実行Cron
// 30分ごとに実行し、投稿時刻が来たツイートを自動投稿
// ==========================================

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { postToX, postArticleToX } from "@/lib/x-poster";

// TZ情報がないscheduledAtをJSTとして解釈（既存データの後方互換性）
function parseScheduledAtAsJST(scheduledAt: string): Date {
  if (/[Zz]$/.test(scheduledAt) || /[+-]\d{2}:\d{2}$/.test(scheduledAt)) {
    return new Date(scheduledAt);
  }
  return new Date(scheduledAt + "+09:00");
}

export async function GET(req: NextRequest) {
  // Vercel Cronからの呼び出しを検証
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const config = getConfig();

  if (!config.xApiKey || !config.xAccessToken) {
    return NextResponse.json({ error: "X API credentials not configured" }, { status: 400 });
  }

  const auth = btoa(`${config.wpUsername}:${config.wpAppPassword}`);
  const now = new Date();

  try {
    // スケジュールを取得
    const scheduleRes = await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/posts?slug=x-schedule-data&status=draft&context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!scheduleRes.ok) {
      return NextResponse.json({ error: "Failed to fetch schedule" }, { status: 500 });
    }
    const posts = await scheduleRes.json();
    if (posts.length === 0) {
      return NextResponse.json({ success: true, message: "No schedule found", posted: 0 });
    }

    const raw = posts[0].content?.raw || "";
    const rendered = posts[0].content?.rendered || "";
    const content = raw || rendered;
    const cleaned = content.replace(/<[^>]*>/g, "").trim();
    if (!cleaned || !cleaned.startsWith("[")) {
      return NextResponse.json({ success: true, message: "Schedule is empty", posted: 0 });
    }

    let schedule = JSON.parse(cleaned);
    const xCreds = {
      apiKey: config.xApiKey,
      apiSecret: config.xApiSecret,
      accessToken: config.xAccessToken,
      accessTokenSecret: config.xAccessTokenSecret,
    };

    let postedCount = 0;
    const results: any[] = [];

    for (const tweet of schedule) {
      if (tweet.status !== "pending") continue;

      const scheduledTime = parseScheduledAtAsJST(tweet.scheduledAt);
      // 投稿時刻を過ぎていて、かつ24時間以内のものを投稿（Hobby: 1日1回実行のため）
      const diffMs = now.getTime() - scheduledTime.getTime();
      if (diffMs < 0 || diffMs > 24 * 60 * 60 * 1000) continue;

      try {
        if (tweet.type === "thread" && tweet.threadTexts?.length > 0) {
          // スレッド投稿
          let lastTweetId: string | undefined;
          for (const threadText of tweet.threadTexts) {
            const result = await postToX(xCreds, threadText, lastTweetId);
            if (result.success && result.tweetId) {
              lastTweetId = result.tweetId;
            } else {
              throw new Error(result.error || "Thread post failed");
            }
            // レート制限対策で少し待つ
            await new Promise((r) => setTimeout(r, 2000));
          }
          tweet.status = "posted";
          tweet.postedAt = now.toISOString();
          postedCount++;
          results.push({ id: tweet.id, status: "posted", type: "thread" });
        } else {
          // 通常投稿
          const tweetText = tweet.blogUrl
            ? `${tweet.text}\n\n${tweet.blogUrl}`
            : tweet.text;
          const result = await postToX(xCreds, tweetText);
          if (result.success) {
            tweet.status = "posted";
            tweet.postedAt = now.toISOString();
            postedCount++;
            results.push({ id: tweet.id, status: "posted" });
          } else {
            tweet.status = "error";
            tweet.error = result.error;
            results.push({ id: tweet.id, status: "error", error: result.error });
          }
        }
      } catch (e: any) {
        tweet.status = "error";
        tweet.error = e.message;
        results.push({ id: tweet.id, status: "error", error: e.message });
      }
    }

    // スケジュールを更新
    if (postedCount > 0 || results.some((r) => r.status === "error")) {
      await fetch(`${config.wpSiteUrl}/wp-json/wp/v2/posts/${posts[0].id}`, {
        method: "PUT",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: JSON.stringify(schedule) }),
      });
    }

    return NextResponse.json({ success: true, posted: postedCount, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
