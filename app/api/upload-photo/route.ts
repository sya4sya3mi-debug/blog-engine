// ==========================================
// BlogEngine V2 - 写真アップロードAPI
// ユーザー撮影写真 → WordPress Media Library
// Node.js Runtime（Edge Runtimeの制限回避）
// ==========================================

// Node.js Runtime を使用（写真ファイルサイズ対応）
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { WordPressClient } from "@/lib/wordpress";

export async function POST(req: NextRequest) {
  const config = getConfig();

  try {
    const formData = await req.formData();
    const productName = formData.get("productName") as string || "商品";
    const files = formData.getAll("photos") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "写真が選択されていません" }, { status: 400 });
    }

    if (files.length > 5) {
      return NextResponse.json({ error: "写真は最大5枚までです" }, { status: 400 });
    }

    const wp = new WordPressClient(config.wpSiteUrl, config.wpUsername, config.wpAppPassword);
    const uploadedPhotos: { id: number; url: string; filename: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // ファイルサイズチェック（リサイズ後でも念のため5MB制限）
      if (file.size > 5 * 1024 * 1024) {
        continue; // スキップ
      }

      const buffer = await file.arrayBuffer();
      const ext = file.type === "image/png" ? "png" : "jpg";
      const filename = `review-${productName.replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, "")}-${i + 1}-${Date.now()}.${ext}`;
      const altText = `${productName} レビュー写真${i + 1}（筆者撮影）`;

      const media = await wp.uploadMediaFromBuffer(
        buffer,
        filename,
        altText,
        file.type || "image/jpeg",
      );

      uploadedPhotos.push({
        id: media.id,
        url: media.url,
        filename,
      });
    }

    return NextResponse.json({
      success: true,
      photos: uploadedPhotos,
      count: uploadedPhotos.length,
    });
  } catch (e: any) {
    console.error("[Upload Photo] Error:", e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
