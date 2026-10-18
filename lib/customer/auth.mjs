import {createServerClient,parseCookieHeader,serializeCookieHeader} from '@supabase/ssr';
import {z} from 'zod';
import {AppError,json,checkOrigin} from '../server/service.mjs';
const password=z.string().min(12,'Use at least 12 characters.').max(256);
const email=z.string().trim().email().max(254);
export function customerConfig(env){
 if(env.SCHEMA_CUSTOMER_HOST!=='true'||!env.SUPABASE_URL||!env.SUPABASE_PUBLISHABLE_KEY||!env.APP_ORIGIN)throw new AppError(503,'Customer accounts are not configured on this host.');
 const origin=new URL(env.APP_ORIGIN);
 if(origin.origin!==env.APP_ORIGIN||(!['https:'].includes(origin.protocol)&&env.NODE_ENV!=='development'))throw new AppError(503,'The account origin is not configured correctly.');
 return {origin:origin.origin,url:env.SUPABASE_URL,key:env.SUPABASE_PUBLISHABLE_KEY};
}
export function requestAuth(req,env,{factory=createServerClient}={}){
 const config=customerConfig(env),responseHeaders=new Headers({'Cache-Control':'private, no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer'});
 const jar=new Map(parseCookieHeader(req.headers.get('cookie')??'').map(c=>[c.name,c.value]));
 const client=factory(config.url,config.key,{
  cookieOptions:{path:'/',sameSite:'lax',secure:config.origin.startsWith('https:'),httpOnly:true},
  cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:(cookies,cacheHeaders={})=>{for(const {name,value,options}of cookies){jar.set(name,value);responseHeaders.append('Set-Cookie',serializeCookieHeader(name,value,{...options,path:'/',httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'lax'}));}for(const [name,value]of Object.entries(cacheHeaders))responseHeaders.set(name,value);}}
 });
 return {client,config,cookieHeader:()=>[...jar].map(([name,value])=>name+'='+encodeURIComponent(value)).join('; '),finish(response){for(const [name,value]of responseHeaders){if(name.toLowerCase()!=='set-cookie')response.headers.set(name,value);}for(const cookie of responseHeaders.getSetCookie())response.headers.append('Set-Cookie',cookie);return response;}};
}
async function input(req){
 if(Number(req.headers.get('content-length'))>8192)throw new AppError(413,'This request is too large.');
 const reader=req.body?.getReader();let size=0;const chunks=[];if(reader){while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>8192){await reader.cancel();throw new AppError(413,'This request is too large.');}chunks.push(r.value);}}
 const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError(400,'Enter the account details again.');}
}
function parse(schema,value){const r=schema.safeParse(value);if(!r.success)throw new AppError(400,r.error.issues[0].message);return r.data;}
export function safeAuthNext(value){return value==='/auth/reset'?'/auth/reset':'/';}
export async function authCallback(req,env,context=requestAuth(req,env)){
 try{
  const url=new URL(req.url),code=url.searchParams.get('code');if(!code||code.length>2048)throw new AppError(400,'This account link is invalid or expired.');
  const {error}=await context.client.auth.exchangeCodeForSession(code);if(error)throw new AppError(400,'This account link is invalid, expired, or already used. Request another link on this browser.');
  return context.finish(new Response(null,{status:303,headers:{Location:context.config.origin+safeAuthNext(url.searchParams.get('next'))}}));
 }catch{return context.finish(new Response(null,{status:303,headers:{Location:context.config.origin+'/auth/login?link=expired'}}));}
}
async function verifiedUser(client){const {data,error}=await client.auth.getUser();if(error||!data?.user||!data.user.email_confirmed_at)throw new AppError(401,'Sign in again to continue.');return data.user;}
async function reauthenticate(client,currentPassword){
 const user=await verifiedUser(client);parse(z.string().min(1).max(256),currentPassword);
 const {error}=await client.auth.signInWithPassword({email:user.email,password:currentPassword});if(error)throw new AppError(403,'Your current password could not be verified.');return user;
}
export async function authAction(req,action,env,context=requestAuth(req,env)){
 try{
  if(req.method!=='POST')throw new AppError(405,'Use the account form to continue.');
  checkOrigin(req);if(new URL(req.url).origin!==context.config.origin)throw new AppError(403,'Open the account form on the configured website.');
  const v=await input(req),client=context.client;let result={ok:true};
  if(action==='login'){
   const values=parse(z.object({email,password:z.string().min(1).max(256)}),v);
   const {data,error}=await client.auth.signInWithPassword(values);
   if(error||!data?.user?.email_confirmed_at)throw new AppError(error?.status===429?429:401,error?.status===429?'Too many attempts. Please wait and try again.':'Check your email and password, and verify your email before signing in.');
  }else if(action==='signup'){
   const values=parse(z.object({email,password}),v);
   const {error}=await client.auth.signUp({...values,options:{emailRedirectTo:context.config.origin+'/auth/callback'}});
   if(error&&error.status!==422)throw new AppError(error.status===429?429:503,error.status===429?'Please wait before requesting another email.':'Account email delivery is temporarily unavailable. Try again later.');
   result={ok:true,message:'If this address can be registered, a verification email will arrive. Open it in this browser. If you already have an account, sign in or reset your password.'};
  }else if(action==='forgot'||action==='resend'){
   const values=parse(z.object({email}),v);
   const {error}=action==='forgot'?await client.auth.resetPasswordForEmail(values.email,{redirectTo:context.config.origin+'/auth/callback?next=/auth/reset'}):await client.auth.resend({type:'signup',email:values.email,options:{emailRedirectTo:context.config.origin+'/auth/callback'}});
   if(error)throw new AppError(error.status===429?429:503,error.status===429?'Please wait before requesting another email.':'Account email delivery is temporarily unavailable. Try again later.');
   result={ok:true,message:'If an eligible account uses that address, an email will arrive. Open it in this browser.'};
  }else if(action==='logout'){
   const {error}=await client.auth.signOut({scope:'local'});if(error&&error.status!==401)throw new AppError(503,'Sign-out did not finish. Please retry.');
  }else if(action==='reauthenticate'){
   await reauthenticate(client,v.currentPassword);
  }else if(action==='revoke-others'){
   await reauthenticate(client,v.currentPassword);const {error}=await client.auth.signOut({scope:'others'});if(error)throw new AppError(503,'Other sessions could not be revoked. Please retry.');
  }else if(action==='password'||action==='reset'){
   parse(password,v.password);if(action==='password')await reauthenticate(client,v.currentPassword);else {await verifiedUser(client);const recent=await client.rpc('schema_api',{action:'security.recent',payload:{}});if(recent.error)throw new AppError(403,'Open a fresh recovery link or confirm your account password first.');}
   const {error}=await client.auth.updateUser({password:v.password});if(error)throw new AppError(400,'The password could not be updated. Request a fresh recovery link or sign in again.');
   const revoked=await client.auth.signOut({scope:'others'});if(revoked.error)throw new AppError(503,'Your password changed, but other-session sign-out needs a retry in Security.');
  }else if(action==='email'){
   parse(email,v.email);await reauthenticate(client,v.currentPassword);const {error}=await client.auth.updateUser({email:v.email},{emailRedirectTo:context.config.origin+'/auth/callback'});if(error)throw new AppError(400,'The email change could not be started. Try again later.');result={ok:true,message:'Follow the confirmation messages sent by the account service. Your existing email remains until confirmation.'};
  }else throw new AppError(404,'This account action is unavailable.');
  return context.finish(json(result));
 }catch(error){return context.finish(json({error:error instanceof AppError?error.message:'The account service is temporarily unavailable. Please retry.'},error instanceof AppError?error.status:503));}
}
