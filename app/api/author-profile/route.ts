import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

export async function GET() {
  try {
    const config = getConfig();
    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const profile = await wp.getAuthorProfile();
    return NextResponse.json(profile);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
