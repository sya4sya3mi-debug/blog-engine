// ==========================================
// X即時投稿API
// ==========================================

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { postToX } from "@/lib/x-poster";

export async function POST(req: NextRequest) {
  const config = getConfig();

  if (!config.xApiKey || !config.xAccessToken) {
    return NextResponse.json({ error: "X API credentials not configured" }, { status: 400 });
  }

  const { text, type, threadTexts, blogUrl } = await req.json();

  const xCreds = {
    apiKey: config.xApiKey,
    apiSecret: config.xApiSecret,
    accessToken: config.xAccessToken,
    accessTokenSecret: config.xAccessTokenSecret,
  };

  // URLを本文から除去（直リンク回避）
  const cleanText = text.replace(/https?:\/\/[^\s]+/g, "").trim();
  // blogUrlからURL抽出（リプライ用）
  const replyUrl = blogUrl || (text.match(/https?:\/\/[^\s]+/) || [])[0] || null;

  try {
    if (type === "thread" && threadTexts?.length > 0) {
      // スレッド投稿（連続リプライ）
      let lastTweetId: string | undefined;

      // 1ツイート目（本文・URLなし）
      const firstResult = await postToX(xCreds, cleanText);
      if (!firstResult.success) {
        return NextResponse.json({ success: false, error: firstResult.error });
      }
      lastTweetId = firstResult.tweetId;

      // 2ツイート目以降（リプライチェーン）
      for (const threadText of threadTexts) {
        if (!threadText.trim()) continue;
        await new Promise((r) => setTimeout(r, 2000)); // レート制限対策
        const result = await postToX(xCreds, threadText, lastTweetId);
        if (result.success && result.tweetId) {
          lastTweetId = result.tweetId;
        } else {
          return NextResponse.json({ success: false, error: `Thread failed at tweet: ${result.error}` });
        }
      }

      // スレッド最後にリプライでURL投稿
      if (replyUrl && lastTweetId) {
        await new Promise((r) => setTimeout(r, 2000));
        await postToX(xCreds, `📖 記事はこちら👇\n${replyUrl}`, lastTweetId);
      }

      return NextResponse.json({ success: true, tweetId: firstResult.tweetId, type: "thread", count: threadTexts.length + 1 });
    } else {
      // 通常投稿（URLなし）
      const result = await postToX(xCreds, cleanText);

      // リプライでURL投稿
      if (result.success && result.tweetId && replyUrl) {
        try {
          await new Promise((r) => setTimeout(r, 2000));
          await postToX(xCreds, `📖 記事はこちら👇\n${replyUrl}`, result.tweetId);
        } catch {}
      }

      return NextResponse.json(result);
    }
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
