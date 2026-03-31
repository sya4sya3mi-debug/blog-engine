// ==========================================
// BlogEngine V2 - Login Endpoint (JWT対応)
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { createToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const correctPassword = process.env.APP_PASSWORD;
  const correctEmail = process.env.APP_EMAIL;

  if (!correctPassword) {
    return NextResponse.json({ error: "APP_PASSWORD が設定されていません" }, { status: 500 });
  }

  // メールアドレスが設定されている場合はチェック
  if (correctEmail && email !== correctEmail) {
    return NextResponse.json({ ok: false, error: "メールアドレスまたはパスワードが違います" }, { status: 401 });
  }

  if (password === correctPassword) {
    const token = await createToken();
    return NextResponse.json({ ok: true, token });
  }

  return NextResponse.json({ ok: false, error: "メールアドレスまたはパスワードが違います" }, { status: 401 });
}
