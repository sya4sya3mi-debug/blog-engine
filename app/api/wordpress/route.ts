import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { title, content, status = "draft" } = await req.json();

    const wpUrl = process.env.WP_URL;
    const wpUsername = process.env.WP_USERNAME;
    const wpAppPassword = process.env.WP_APP_PASSWORD;

    if (!wpUrl || !wpUsername || !wpAppPassword) {
      return NextResponse.json({ error: "WordPress の環境変数が設定されていません" }, { status: 500 });
    }

    const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");

    const res = await fetch(`${wpUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${credentials}`,
      },
      body: JSON.stringify({
        title,
        content,
        status, // "draft" or "publish"
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      console.error("WordPress API error:", err);
      return NextResponse.json({ error: "WordPress への投稿に失敗しました", detail: err }, { status: 500 });
    }

    const data = await res.json();
    return NextResponse.json({
      ok: true,
      postId: data.id,
      postUrl: data.link,
      editUrl: `${wpUrl}/wp-admin/post.php?post=${data.id}&action=edit`,
    });
  } catch (err) {
    console.error("WordPress route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
