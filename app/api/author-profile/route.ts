import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { createHash } from "crypto";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getConfig();

    const baseUrl = config.wpSiteUrl.replace(/\/+$/, "");
    const authHeader = "Basic " + Buffer.from(`${config.wpUsername}:${config.wpAppPassword}`).toString("base64");

    const res = await fetch(`${baseUrl}/wp-json/wp/v2/users/me?context=edit`, {
      headers: { Authorization: authHeader },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WordPress API error (${res.status}): ${body}`);
    }

    const user = (await res.json()) as {
      name?: string;
      email?: string;
      avatar_urls?: Record<string, string>;
    };

    const name = user.name || "";
    const email = (user.email || "").trim().toLowerCase();

    const computedGravatarUrl = email
      ? `https://secure.gravatar.com/avatar/${createHash("md5").update(email).digest("hex")}?s=96&d=mp&r=pg`
      : "";

    const wpAvatarUrl = user.avatar_urls?.["96"] || user.avatar_urls?.["48"] || "";
    const avatarUrl = (computedGravatarUrl || wpAvatarUrl || "").replace(/^http:\/\//i, "https://");

    return NextResponse.json({ name, avatarUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
