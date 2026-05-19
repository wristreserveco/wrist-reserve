import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  // /.well-known/* — no session work; keep response minimal.
  if (pathname.startsWith("/.well-known/")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (!user) {
      const redirect = NextResponse.redirect(new URL("/admin/login", request.url));
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirect.cookies.set(c.name, c.value);
      });
      return redirect;
    }
  }

  if (pathname === "/admin/login" && user) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Product + checkout HTML must not be cached aggressively — Safari especially
  // can keep an old document that still references stale checkout JS chunks.
  if (
    pathname === "/" ||
    pathname === "/cart" ||
    pathname.startsWith("/products/") ||
    pathname === "/shop" ||
    pathname.startsWith("/checkout/")
  ) {
    supabaseResponse.headers.set(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
