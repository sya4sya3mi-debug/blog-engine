import { NextResponse } from "next/server";
export async function GET() {
    const ak = process.env.RAKUTEN_ACCESS_KEY ?? "";
    const appId = process.env.RAKUTEN_APP_ID ?? "";
    let rakutenResult = "not tested";
    try {
          const params = new URLSearchParams({ applicationId: appId, accessKey: ak, keyword: "cosme", hits: "1" });
          const res = await fetch("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601?" + params.toString());
          const text = await res.text();
          rakutenResult = "status:" + res.status + " body:" + text.substring(0, 300);
    } catch(e: any) { rakutenResult = "error: " + e.message; }
    return NextResponse.json({
          RAKUTEN_APP_ID_FIRST8: appId.substring(0, 8),
          RAKUTEN_ACCESS_KEY_FIRST8: ak.substring(0, 8),
          RAKUTEN_ACCESS_KEY_LAST4: ak.slice(-4),
          RAKUTEN_ACCESS_KEY_LENGTH: ak.length,
          rakutenApiTest: rakutenResult,
    });
}
