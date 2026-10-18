import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {refreshPlatformAuth} from '#schema-platform';
export async function proxy(request:NextRequest){
 const response=await refreshPlatformAuth(request)??NextResponse.next();
 const customer=process.env.SCHEMA_CUSTOMER_HOST==='true';
 response.headers.set('X-Content-Type-Options','nosniff');
 response.headers.set('Referrer-Policy',customer?'no-referrer':'same-origin');
 response.headers.set('Permissions-Policy','camera=(), microphone=(self), geolocation=()');
 response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' "+(process.env.NODE_ENV==='development'?"'unsafe-eval' ":'')+"https://checkout.razorpay.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self' https://*.razorpay.com "+(process.env.NODE_ENV==='development'?'ws: wss: ':'')+"; frame-src https://*.razorpay.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors "+(customer?"'none'":"'self' https://chatgpt.com https://*.chatgpt.com"));
 if(request.nextUrl.pathname.startsWith('/api/')||request.nextUrl.pathname.startsWith('/auth/')||request.nextUrl.pathname==='/')response.headers.set('Cache-Control','private, no-store');
 return response;
}
export const config={matcher:['/((?!_next|art|favicon|assets).*)']};
