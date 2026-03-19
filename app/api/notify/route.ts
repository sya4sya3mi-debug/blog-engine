import { Resend } from "resend";
import { NextRequest, NextResponse } from "next/server";

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_TO = "kopperian432432@gmail.com";
const FROM = "BlogEngine <onboarding@resend.dev>";

function buildEmailHtml({ type, title, site, siteColor, keyword, scheduledFor, revisionComment }: {
  type: "pending" | "approved" | "revision";
  title: string; site: string; siteColor: string;
  keyword: string; scheduledFor: string; revisionComment?: string;
}) {
  const configs = {
    pending:  { icon: "◈", bannerBg: "#FFB34714", bannerBorder: "#FFB347", bannerColor: "#7A5C00", bannerText: "新しい記事がレビュー待ちです。承認するまで投稿されません。", ctaText: "ダッシュボードでレビューする →" },
    approved: { icon: "✅", bannerBg: "#00C89614", bannerBorder: "#00C896", bannerColor: "#005C3D", bannerText: "記事が承認され、予約投稿が設定されました。", ctaText: "ダッシュボードで確認する →" },
    revision: { icon: "⚠️", bannerBg: "#FF6B6B14", bannerBorder: "#FF6B6B", bannerColor: "#7A0000", bannerText: "記事が差し戻されました。修正が必要です。", ctaText: "ダッシュボードで再レビューする →" },
  };
  const c = configs[type];
  const statusLabel = type === "pending" ? "レビュー待ち" : type === "approved" ? "承認済み・予約投稿" : "差し戻し";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://your-app.vercel.app";

  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f8;font-family:'Helvetica Neue',Arial,sans-serif;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0ea;">
  <div style="background:#0A0A0F;padding:22px 28px;">
    <span style="color:#00D4FF;font-size:18px;font-weight:800;">● BlogEngine</span>
    <span style="color:#555;font-size:12px;margin-left:10px;">レビュー通知</span>
  </div>
  <div style="background:${c.bannerBg};border-left:4px solid ${c.bannerBorder};padding:12px 28px;font-size:13px;color:${c.bannerColor};">
    ${c.icon} ${c.bannerText}
  </div>
  <div style="padding:24px 28px;">
    <div style="font-size:19px;font-weight:700;color:#0a0a0f;margin-bottom:20px;">${title}</div>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:8px 0;color:#888;width:120px;">サイト</td><td style="padding:8px 0;font-weight:600;color:${siteColor};">${site}</td></tr>
      <tr style="border-top:1px solid #f0f0f5;"><td style="padding:8px 0;color:#888;">キーワード</td><td style="padding:8px 0;">${keyword}</td></tr>
      <tr style="border-top:1px solid #f0f0f5;"><td style="padding:8px 0;color:#888;">投稿予定</td><td style="padding:8px 0;">${scheduledFor}</td></tr>
      <tr style="border-top:1px solid #f0f0f5;"><td style="padding:8px 0;color:#888;">ステータス</td><td style="padding:8px 0;font-weight:700;color:${type === "approved" ? "#00C896" : type === "revision" ? "#FF6B6B" : "#FFB347"};">${statusLabel}</td></tr>
      <tr style="border-top:1px solid #f0f0f5;"><td style="padding:8px 0;color:#888;">投稿期限</td><td style="padding:8px 0;color:#00C896;font-weight:600;">期限なし（承認するまで投稿されません）</td></tr>
      ${type === "revision" && revisionComment ? `<tr style="border-top:1px solid #f0f0f5;"><td style="padding:8px 0;color:#888;vertical-align:top;">フィードバック</td><td style="padding:8px 0;color:#CC3333;line-height:1.6;">${revisionComment}</td></tr>` : ""}
    </table>
  </div>
  <div style="padding:0 28px 28px;">
    <a href="${appUrl}/review" style="display:block;background:linear-gradient(135deg,#00D4FF,#00C896);color:#000;text-align:center;padding:14px;border-radius:10px;font-size:14px;font-weight:800;text-decoration:none;">
      ${c.ctaText}
    </a>
    <p style="font-size:11px;color:#bbb;text-align:center;margin:10px 0 0;">BlogEngine が自動送信しました</p>
  </div>
</div></body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, title, site, siteColor, keyword, scheduledFor, revisionComment } = body;

    if (!type || !title || !site || !keyword || !scheduledFor) {
      return NextResponse.json({ error: "必須パラメータが不足しています" }, { status: 400 });
    }

    const subjectPrefix = type === "pending" ? "【レビュー待ち】" : type === "approved" ? "【承認済み】" : "【差し戻し】";

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: NOTIFY_TO,
      subject: `${subjectPrefix}${title}`,
      html: buildEmailHtml({ type, title, site, siteColor: siteColor ?? "#00D4FF", keyword, scheduledFor, revisionComment }),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, emailId: data?.id });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
