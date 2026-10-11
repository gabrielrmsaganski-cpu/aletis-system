import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  let decodedPathname = pathname

  try {
    decodedPathname = decodeURIComponent(pathname)
  } catch {
    decodedPathname = pathname
  }

  if (decodedPathname === '/educação' || decodedPathname.startsWith('/educação/')) {
    const url = request.nextUrl.clone()
    url.pathname = decodedPathname.replace(/^\/educação/i, '/educacao')

    return NextResponse.redirect(url, 308)
  }

  return NextResponse.next()
}
