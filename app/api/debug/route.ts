import { NextResponse } from 'next/server'

// 静的プリレンダリングを防止（これが重要！）
export const dynamic = 'force-dynamic'

export async function GET() {
  const results: Record<string, any> = {}

  // 1. 環境変数チェック
  const rakutenAppId = process.env.RAKUTEN_APP_ID || ''
  const rakutenAffiliateId = process.env.RAKUTEN_AFFILIATE_ID || ''
  const wpUrl = process.env.WP_URL || ''
  const wpUsername = process.env.WP_USERNAME || ''
  const wpAppPassword = process.env.WP_APP_PASSWORD || ''
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY || ''

  results.env = {
    RAKUTEN_APP_ID_SET: !!rakutenAppId,
    RAKUTEN_APP_ID_FIRST8: rakutenAppId.substring(0, 8) + '...',
    RAKUTEN_APP_ID_LENGTH: rakutenAppId.length,
    RAKUTEN_AFFILIATE_ID_SET: !!rakutenAffiliateId,
    RAKUTEN_AFFILIATE_ID_FIRST8: rakutenAffiliateId.substring(0, 8) + '...',
    RAKUTEN_AFFILIATE_ID_LENGTH: rakutenAffiliateId.length,
    ANTHROPIC_API_KEY_SET: !!anthropicApiKey,
    WP_URL: wpUrl,
    WP_USERNAME: wpUsername,
    WP_APP_PASSWORD_LENGTH: wpAppPassword.length,
    WP_APP_PASSWORD_FIRST4: wpAppPassword.substring(0, 4) + '...',
  }

  // 2. 楽天API接続テスト
  try {
    const testKeyword = 'ダイエット'
    const rakutenUrl = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?applicationId=${rakutenAppId}&affiliateId=${rakutenAffiliateId}&keyword=${encodeURIComponent(testKeyword)}&hits=3&formatVersion=2`

    console.log('Debug: Testing Rakuten API with keyword:', testKeyword)
    console.log('Debug: Rakuten URL (without IDs):', `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20170706?applicationId=***&affiliateId=***&keyword=${encodeURIComponent(testKeyword)}&hits=3&formatVersion=2`)

    const rakutenRes = await fetch(rakutenUrl, {
      headers: {
        'Referer': 'https://blog-engine-phi.vercel.app',
      },
    })

    const rakutenStatus = rakutenRes.status
    const rakutenText = await rakutenRes.text()
    console.log('Debug: Rakuten API status:', rakutenStatus)
    console.log('Debug: Rakuten response length:', rakutenText.length)

    let rakutenData: any = null
    try {
      rakutenData = JSON.parse(rakutenText)
    } catch {
      rakutenData = { raw: rakutenText.substring(0, 500) }
    }

    if (rakutenStatus === 200 && rakutenData?.Items) {
      results.rakuten = {
        status: rakutenStatus,
        success: true,
        itemCount: rakutenData.Items.length,
        sampleItem: rakutenData.Items[0] ? {
          itemName: rakutenData.Items[0].itemName?.substring(0, 50),
          itemPrice: rakutenData.Items[0].itemPrice,
          affiliateUrl: rakutenData.Items[0].affiliateUrl ? 'SET' : 'NOT SET',
          affiliateUrlFirst50: rakutenData.Items[0].affiliateUrl?.substring(0, 50),
        } : null,
      }
      console.log('Debug: Rakuten API SUCCESS - items:', rakutenData.Items.length)
    } else {
      results.rakuten = {
        status: rakutenStatus,
        success: false,
        error: rakutenData?.error || rakutenData?.error_description || 'Unknown error',
        errorDetail: typeof rakutenData === 'object' ? rakutenData : { raw: rakutenText.substring(0, 300) },
      }
      console.log('Debug: Rakuten API FAILED - status:', rakutenStatus, 'error:', JSON.stringify(results.rakuten.error))
    }
  } catch (e: any) {
    results.rakuten = {
      status: 'FETCH_ERROR',
      success: false,
      error: e.message,
    }
    console.log('Debug: Rakuten API FETCH ERROR:', e.message)
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
