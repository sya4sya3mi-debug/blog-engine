import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, any> = {}

  const rakutenAppId = process.env.RAKUTEN_APP_ID || ''
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY || ''
  const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID || ''
  const wpUrl = process.env.WP_URL || ''
  const wpUsername = process.env.WP_USERNAME || ''
  const wpAppPassword = process.env.WP_APP_PASSWORD || ''
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || ''

  results.env = {
    RAKUTEN_APP_ID_SET: !!rakutenAppId,
    RAKUTEN_APP_ID_FIRST8: rakutenAppId.substring(0, 8) + '...',
    RAKUTEN_ACCESS_KEY_SET: !!rakutenAccessKey,
    RAKUTEN_ACCESS_KEY_LENGTH: rakutenAccessKey.length,
    RAKUTEN_AFFILIATE_ID_SET: !!rakutenAffiliateId,
    ANTHROPIC_API_KEY_SET: !!anthropicApiKey,
    WP_URL: wpUrl,
    WP_USERNAME: wpUsername,
    WP_APP_PASSWORD_LENGTH: wpAppPassword.length,
  }

  results.note = 'Rakuten API is called client-side (browser) to send correct Referer header'
  results.timestamp = new Date().toISOString()

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
