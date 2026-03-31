// ==========================================
// BlogEngine V2 - X投稿スケジュール管理API
// WordPress投稿メタをストレージとして利用
// ==========================================

export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";

interface ScheduledTweet {
  id: string;
  text: string;
  scheduledAt: string; // ISO 8601
  status: "pending" | "posted" | "error";
  type: "normal" | "thread" | "long";
  threadTexts?: string[]; // スレッドの場合は複数ツイート
  imageUrl?: string;
  blogUrl?: string; // 紐付けるブログ記事URL
  postedAt?: string;
  error?: string;
}

// WordPress draft投稿をストレージとして使用
async function getSchedule(wpUrl: string, auth: string): Promise<ScheduledTweet[]> {
  return getScheduleFromPosts(wpUrl, auth);
}

// WordPressの特定投稿のメタデータをストレージとして使用
async function getScheduleFromPosts(wpUrl: string, auth: string): Promise<ScheduledTweet[]> {
  try {
    // context=editでrawコンテンツを取得（HTMLラップ回避）
    const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts?slug=x-schedule-data&status=draft&context=edit`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!res.ok) return [];
    const posts = await res.json();
    if (posts.length === 0) return [];
    // rawを優先、renderedはフォールバック
    const raw = posts[0].content?.raw || "";
    const rendered = posts[0].content?.rendered || "";
    const content = raw || rendered;
    // HTMLタグを除去してJSONを取得
    const cleaned = content.replace(/<[^>]*>/g, "").trim();
    if (!cleaned || !cleaned.startsWith("[")) return [];
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[X Schedule] Failed to parse schedule:", e);
    return [];
  }
}

async function saveSchedule(wpUrl: string, auth: string, schedule: ScheduledTweet[]): Promise<void> {
  const json = JSON.stringify(schedule);

  // まず既存のschedule投稿を探す
  const searchRes = await fetch(`${wpUrl}/wp-json/wp/v2/posts?slug=x-schedule-data&status=draft`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const posts = await searchRes.json();

  if (posts.length > 0) {
    // 既存の投稿を更新
    await fetch(`${wpUrl}/wp-json/wp/v2/posts/${posts[0].id}`, {
      method: "PUT",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: json }),
    });
  } else {
    // 新規作成（非公開の下書き）
    await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "X Schedule Data (Do Not Delete)",
        content: json,
        slug: "x-schedule-data",
        status: "draft",
      }),
    });
  }
}

function getAuth(config: ReturnType<typeof getConfig>): string {
  // Edge Runtime用のbtoa
  return btoa(`${config.wpUsername}:${config.wpAppPassword}`);
}

// GET: スケジュール一覧取得
export async function GET(req: NextRequest) {
  const config = getConfig();
  const auth = getAuth(config);
  const schedule = await getSchedule(config.wpSiteUrl, auth);

  return NextResponse.json({
    success: true,
    schedule: schedule.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
  });
}

// POST: スケジュール追加・更新・削除
export async function POST(req: NextRequest) {
  const config = getConfig();
  const auth = getAuth(config);
  const body = await req.json();
  const { action } = body;

  let schedule = await getSchedule(config.wpSiteUrl, auth);

  if (action === "add") {
    // 単一投稿追加
    const tweet: ScheduledTweet = {
      id: `xt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: body.text,
      scheduledAt: body.scheduledAt,
      status: "pending",
      type: body.type || "normal",
      threadTexts: body.threadTexts,
      imageUrl: body.imageUrl,
      blogUrl: body.blogUrl,
    };
    schedule.push(tweet);
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true, tweet });
  }

  if (action === "addBulk") {
    // 一括追加（1週間分など）
    const tweets: ScheduledTweet[] = (body.tweets || []).map((t: any) => ({
      id: `xt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text: t.text,
      scheduledAt: t.scheduledAt,
      status: "pending",
      type: t.type || "normal",
      threadTexts: t.threadTexts,
      imageUrl: t.imageUrl,
      blogUrl: t.blogUrl,
    }));
    schedule.push(...tweets);
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true, added: tweets.length });
  }

  if (action === "delete") {
    schedule = schedule.filter((t) => t.id !== body.id);
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true });
  }

  if (action === "update") {
    schedule = schedule.map((t) =>
      t.id === body.id ? { ...t, ...body.updates } : t
    );
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true });
  }

  if (action === "markPosted") {
    schedule = schedule.map((t) =>
      t.id === body.id ? { ...t, status: "posted" as const, postedAt: new Date().toISOString() } : t
    );
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true });
  }

  if (action === "markError") {
    schedule = schedule.map((t) =>
      t.id === body.id ? { ...t, status: "error" as const, error: body.error } : t
    );
    await saveSchedule(config.wpSiteUrl, auth, schedule);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
