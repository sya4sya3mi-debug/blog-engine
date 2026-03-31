// ==========================================
// OAuth 2.0 認証開始 - Googleログイン画面にリダイレクト
// ==========================================

export const runtime = "edge";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return Response.json({ error: "GOOGLE_CLIENT_ID not configured" }, { status: 500 });
  }

  const redirectUri = "https://blog-engine-phi.vercel.app/api/oauth-callback";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.force-ssl",
    access_type: "offline",
    prompt: "consent", // リフレッシュトークンを必ず取得
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

  return Response.redirect(authUrl);
}
