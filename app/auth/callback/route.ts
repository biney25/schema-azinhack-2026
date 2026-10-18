import {getRequestContext} from '#schema-platform';
import {authCallback} from '@/lib/customer/auth.mjs';
export const dynamic='force-dynamic';
export async function GET(req:Request){let ctx;try{ctx=await getRequestContext(req);}catch{return new Response('Account service is not configured.',{status:503});}if(ctx.mode!=='customer')return new Response('Customer accounts are not enabled here.',{status:404});return authCallback(req,ctx.env,ctx.auth);}
