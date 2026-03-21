import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /api/debug は認証なしでアクセス可能にする
  if (pathname.startsWith('/api/debug')) {
    return NextResponse.next()
  }

  // /api/auth はログイン処理自体なのでスキップ（★修正: これがないとPOSTがブロックされる）
  if (pathname === '/api/auth') {
    return NextResponse.next()
  }

  // /login と静的ファイルはスキップ
  if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next()
  }

  // 認証チェック（★修正: auth-token → blog_session に変更）
  const authCookie = request.cookies.get('blog_session')
  if (!authCookie) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
