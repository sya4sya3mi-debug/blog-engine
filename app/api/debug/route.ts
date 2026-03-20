import { NextResponse } from 'next/server'
import https from 'https'

// 静的プリレンダリングを防止 + Node.jsランタイムを明示指定
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SITE_URL = 'https://blog-engine-phi.vercel.app'

export async function GET() {
  const results: Record<string, any> = {}

  // 1. 環境変数チェック
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
    RAKUTEN_APP_ID_LENGTH: rakutenAppId.length,
    RAKUTEN_ACCESS_KEY_SET: !!rakutenAccessKey,
    RAKUTEN_ACCESS_KEY_LENGTH: rakutenAccessKey.length,
    RAKUTEN_AFFILIATE_ID_SET: !!rakutenAffiliateId,
    RAKUTEN_AFFILIATE_ID_FIRST8: rakutenAffiliateId.substring(0, 8) + '...',
    RAKUTEN_AFFILIATE_ID_LENGTH: rakutenAffiliateId.length,
    ANTHROPIC_API_KEY_SET: !!anthropicApiKey,
    WP_URL: wpUrl,
    WP_USERNAME: wpUsername,
    WP_APP_PASSWORD_LENGTH: wpAppPassword.length,
    WP_APP_PASSWORD_FIRST4: wpAppPassword.substring(0, 4) + '...',
  }

  // 2. 楽天API接続テスト（undici で Referer を確実に送信）
  try {
    const testKeyword = 'ダイエット'
    const params = new URLSearchParams({
      applicationId: rakutenAppId,
      accessKey: rakutenAccessKey,
      keyword: testKeyword,
      hits: '3',
      format: 'json',
    })
    if (rakutenAffiliateId) params.set('affiliateId', rakutenAffiliateId)

    const rakutenUrl = `https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601?${params.toString()}`

    console.log('Debug: Testing Rakuten API with undici')

    const { statusCode, body } = await request(rakutenUrl, {
      method: 'GET',
      headers: {
        'referer': SITE_URL + '/',
        'origin': SITE_URL,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept': 'application/json',
      },
    })

    const rakutenText = await body.text()
    console.log('Debug: Rakuten API status:', statusCode)
    console.log('Debug: Rakuten response first 200:', rakutenText.substring(0, 200))

    let rakutenData: any = null
    try {
      rakutenData = JSON.parse(rakutenText)
    } catch {
      rakutenData = { raw: rakutenText.substring(0, 500) }
    }

    if (statusCode === 200 && rakutenData?.Items) {
      const firstEntry = rakutenData.Items[0]
      const firstItem = firstEntry?.Item || firstEntry

      results.rakuten = {
        status: statusCode,
        success: true,
        itemCount: rakutenData.Items.length,
        sampleItem: firstItem ? {
          itemName: firstItem.itemName?.substring(0, 50),
          itemPrice: firstItem.itemPrice,
          affiliateUrl: firstItem.affiliateUrl ? 'SET' : 'NOT SET',
          affiliateUrlFirst50: firstItem.affiliateUrl?.substring(0, 50),
        } : null,
      }
      console.log('Debug: Rakuten API SUCCESS - items:', rakutenData.Items.length)
    } else {
      results.rakuten = {
        status: statusCode,
        success: false,
        error: rakutenData?.error || rakutenData?.errors?.errorMessage || rakutenData?.error_description || 'Unknown error',
        errorDetail: typeof rakutenData === 'object' ? rakutenData : { raw: rakutenText.substring(0, 300) },
      }
      console.log('Debug: Rakuten API FAILED - status:', statusCode)
    }
  } catch (e: any) {
    results.rakuten = {
      status: 'FETCH_ERROR',
      success: false,
      error: e.message,
      stack: e.stack?.substring(0, 200),
    }
    console.log('Debug: Rakuten API ERROR:', e.message)
  }

  // 3. タイムスタンプ
  results.timestamp = new Date().toISOString()
  results.deploymentUrl = process.env.VERCEL_URL || 'unknown'

  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}
