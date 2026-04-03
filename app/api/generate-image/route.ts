// ==========================================
// BlogEngine V2 - Image Generation Endpoint
// X投稿文確定後に画像だけ生成する
// ==========================================

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { generateEyecatchImage, generateProductEyecatchImage } from "@/lib/image-generator";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const config = getConfig();

  if (!config.openaiApiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY未設定" }, { status: 400 });
  }

  const { title, keyword, themeLabel, productNames } = await req.json();

  try {
    const eyecatch = productNames && productNames.length > 0
      ? await generateProductEyecatchImage(config.openaiApiKey, productNames, title)
      : await generateEyecatchImage(config.openaiApiKey, title, keyword || "", themeLabel || "");

    return NextResponse.json({
      success: true,
      imageUrl: eyecatch.imageUrl,
      altText: eyecatch.altText,
    });
  } catch (e: any) {
    return NextResponse.json({ error: `画像生成エラー: ${e.message}` }, { status: 500 });
  }
}
