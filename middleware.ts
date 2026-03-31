// ==========================================
// BlogEngine V2 - API Authentication Middleware
// 全APIルートをJWT認証で保護
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET_KEY = new TextEncoder().encode(
  process.env.APP_PASSWORD || "fallback-secret-key-change-me"
);

// 認証不要のパス
const PUBLIC_PATHS = [
  "/api/login",
  "/api/wp-test",
  "/api/oauth-callback",
  "/api/oauth-start",
  "/api/cron",        // Vercel Cronは独自認証
  "/api/x-cron",      // X自動投稿Cron
  "/api/cron-trends",  // トレンド自動収集Cron
  "/api/suggest",     // Google Suggest（公開データのみ）
];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // APIルート以外はスルー
  if (!path.startsWith("/api/")) {
    return NextResponse.next();
  }

  // 公開パスはスルー
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // Vercel Cronからのリクエスト（CRON_SECRETヘッダー）はスルー
  const cronSecret = req.headers.get("authorization");
  if (cronSecret === `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.next();
  }

  // JWTトークン検証
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  try {
    await jwtVerify(token, SECRET_KEY, {
      issuer: "blogengine",
      audience: "blogengine-api",
    });
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

export const config = {
  matcher: "/api/:path*",
};
