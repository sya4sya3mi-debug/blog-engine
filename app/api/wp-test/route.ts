// ==========================================
// BlogEngine V2 - WordPress Connection Test
// ==========================================

import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

export async function GET() {
  try {
    const config = getConfig();
    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const result = await wp.testConnection();
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
