import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /api/debug は認証なしでアクセス可能にする
  if (pathname.startsWith('/api/debug')) {
    return NextResponse.next()
  }

  // /login と静的ファイルはスキップ
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // 認証チェック
  const authCookie = request.cookies.get('auth-token')
  if (!authCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
