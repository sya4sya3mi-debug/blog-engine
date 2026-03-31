// ==========================================
// BlogEngine V2 - JWT Authentication
// Edge Runtime対応のトークン認証
// ==========================================

import { SignJWT, jwtVerify } from "jose";

const SECRET_KEY = new TextEncoder().encode(
  process.env.APP_PASSWORD || "fallback-secret-key-change-me"
);

const ISSUER = "blogengine";
const AUDIENCE = "blogengine-api";
const EXPIRY = "7d";

/**
 * JWTトークンを生成する（ログイン成功時に呼ばれる）
 */
export async function createToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET_KEY);
}

/**
 * JWTトークンを検証する（API呼び出し時に呼ばれる）
 */
export async function verifyToken(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, SECRET_KEY, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * リクエストヘッダーからトークンを検証するヘルパー
 * Authorizationヘッダー: "Bearer <token>"
 */
export async function authenticateRequest(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  return verifyToken(token);
}
