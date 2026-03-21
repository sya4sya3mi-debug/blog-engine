// ==========================================
// BlogEngine V2 - Login Endpoint
// ==========================================

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correct = process.env.APP_PASSWORD;

  if (!correct) {
    return NextResponse.json({ error: "APP_PASSWORD が設定されていません" }, { status: 500 });
  }

  if (password === correct) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "パスワードが違います" }, { status: 401 });
}
