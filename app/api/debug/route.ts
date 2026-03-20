import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    WP_URL: process.env.WP_URL,
    WP_USERNAME: process.env.WP_USERNAME,
    WP_APP_PASSWORD_LENGTH: process.env.WP_APP_PASSWORD?.length,
    WP_APP_PASSWORD_FIRST4: process.env.WP_APP_PASSWORD?.substring(0, 4),
  });
}
