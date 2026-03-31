// ==========================================
// AI生成ブックマーク向けツイート文API
// 記事内容からブックマークされやすい投稿文を生成
// ==========================================

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { generateAiTweetText, type TweetStyle, type TweetLength } from "@/lib/x-poster";

export async function POST(req: NextRequest) {
  try {
    const config = getConfig();
    const { title, content, style, length } = await req.json() as {
      title: string;
      content: string;
      style?: TweetStyle;
      length?: TweetLength;
    };

    if (!title) {
      return NextResponse.json({ error: "タイトルが必要です" }, { status: 400 });
    }

    const text = await generateAiTweetText(
      config.anthropicApiKey,
      title,
      content || "",
      { style, length },
    );

    return NextResponse.json({ success: true, text });
  } catch (e: any) {
    console.error("[X AI Tweet] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
