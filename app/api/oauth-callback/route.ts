// ==========================================
// OAuth 2.0 コールバック - 認証コードをトークンに交換
// リフレッシュトークンを画面に表示（Vercel環境変数に保存用）
// ==========================================

export const runtime = "edge";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0f;color:#e8e8f0;">
        <h1 style="color:#ff6b6b;">認証エラー</h1>
        <p>${error}</p>
        <a href="/" style="color:#00d4ff;">ダッシュボードに戻る</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  if (!code) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0f;color:#e8e8f0;">
        <h1 style="color:#ff6b6b;">認証コードがありません</h1>
        <a href="/api/oauth-start" style="color:#00d4ff;">再度認証する</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
  const redirectUri = "https://blog-engine-phi.vercel.app/api/oauth-callback";

  try {
    // 認証コードをトークンに交換
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new Response(
        `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0f;color:#e8e8f0;">
          <h1 style="color:#ff6b6b;">トークン取得エラー</h1>
          <p>${tokenData.error}: ${tokenData.error_description || ""}</p>
          <a href="/api/oauth-start" style="color:#00d4ff;">再度認証する</a>
        </body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const refreshToken = tokenData.refresh_token || "（リフレッシュトークンが返されませんでした）";

    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0f;color:#e8e8f0;max-width:700px;margin:0 auto;">
        <h1 style="color:#00c896;">✅ 認証成功！</h1>
        <p>以下のリフレッシュトークンをVercelの環境変数に追加してください：</p>

        <div style="margin:20px 0;">
          <label style="font-size:14px;color:#888;">環境変数名:</label>
          <div style="background:#14141f;padding:12px 16px;border-radius:8px;margin-top:4px;">
            <code style="color:#00d4ff;font-size:16px;font-weight:bold;">GOOGLE_REFRESH_TOKEN</code>
          </div>
        </div>

        <div style="margin:20px 0;">
          <label style="font-size:14px;color:#888;">値（下のテキストを全てコピー）:</label>
          <textarea id="token" readonly style="width:100%;height:80px;background:#14141f;color:#ff6b9d;border:1px solid #2a2a3c;border-radius:8px;padding:12px;font-size:14px;font-family:monospace;resize:none;">${refreshToken}</textarea>
          <button onclick="document.getElementById('token').select();document.execCommand('copy');this.textContent='コピーしました！';"
            style="margin-top:8px;padding:10px 24px;background:linear-gradient(135deg,#ff6b9d,#00d4ff);color:#fff;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:14px;">
            コピー
          </button>
        </div>

        <div style="background:#14141f;padding:16px;border-radius:8px;margin-top:24px;border-left:4px solid #ff9f43;">
          <h3 style="color:#ff9f43;margin:0 0 8px;">次のステップ</h3>
          <ol style="margin:0;padding-left:20px;line-height:2;">
            <li>上のリフレッシュトークンをコピー</li>
            <li>Vercelダッシュボード → Settings → Environment Variables</li>
            <li><code>GOOGLE_REFRESH_TOKEN</code> として追加</li>
            <li>再デプロイ</li>
          </ol>
        </div>

        <a href="/" style="display:inline-block;margin-top:24px;color:#00d4ff;text-decoration:none;">← ダッシュボードに戻る</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    return new Response(
      `<html><body style="font-family:sans-serif;padding:40px;background:#0a0a0f;color:#e8e8f0;">
        <h1 style="color:#ff6b6b;">エラー</h1>
        <p>${err instanceof Error ? err.message : "Unknown error"}</p>
        <a href="/api/oauth-start" style="color:#00d4ff;">再度認証する</a>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
