import {z} from 'zod';
import {customerAsk,availableAI} from './ai.mjs';
import {entrySchema,AppError,json,checkOrigin,limits} from '../server/service.mjs';
import {PURPOSES,NOTICE_VERSION} from '../server/privacy.mjs';
import {bounded} from '../../supabase/functions/_shared/http.mjs';
const uuid=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Choose a valid date.');
const parse=(schema,input)=>{const r=schema.safeParse(input);if(!r.success)throw new AppError(400,r.error.issues[0].message);return r.data;};
const body=async req=>{try{return JSON.parse(new TextDecoder().decode(await bounded(req,256*1024)));}catch(e){if(e.status)throw new AppError(e.status,e.message);throw new AppError(400,'Check the supplied details.');}};
export async function customerRpc(client,action,payload={}){
 const {data,error}=await client.rpc('schema_api',{action,payload});
 if(error){const status=/^PT[4-5]\d\d$/.test(error.code)?Number(error.code.slice(2)):['22P02','22007','22008','23514','23502'].includes(error.code)?400:error.code==='23505'?409:503;throw new AppError(status,status===503?'Your journal is temporarily unavailable.':status===400?'Check the supplied details.':status===409&&error.code==='23505'?'This record changed. Keep your draft and retry with a separate copy.':error.message);}
 return data;
}
export async function handleCustomer(req,path,client,env,{request=fetch}={}){
 const route=path.join('/'),url=new URL(req.url),get=req.method==='GET';
 checkOrigin(req);if(url.origin!==env.APP_ORIGIN)throw new AppError(403,'Open your journal on the configured website.');
 const {data,error}=await client.auth.getUser();if(error||!data?.user?.email_confirmed_at)throw new AppError(401,'Sign in to open your journal.');
 const call=(action,payload={})=>customerRpc(client,action,payload);
 const exportRevision=url.searchParams.get('exportRevision');
 const revision=exportRevision===null?{}:{exportRevision};
 if(route==='health'&&get){await call('security.sessions');return json({status:'ok',service:'schema',backend:'postgres'});}
 if(route==='bootstrap'&&get){const r=await call('bootstrap');return json({...r,allowance:{...(limits[r.profile.plan]??limits.free),bytes:r.profile.storage_limit},capabilities:{ai:availableAI(env,data.user.email),billing:false,googlePhotos:false,sharing:false,maxUploadBytes:4*1024**2},user:{email:data.user.email,name:r.profile.name}});}
 if(route==='profile'&&req.method==='PATCH')return json(await call('profile.save',parse(z.object({name:z.string().trim().max(80),theme:z.enum(['rose','lavender','vintage']),birthday:z.union([day,z.literal('')]).default(''),quiet:z.boolean(),onboarded:z.literal(true),preferencesVersion:z.number().int().min(1),adultConfirmed:z.boolean().optional(),storageAcknowledged:z.boolean().optional(),textSize:z.enum(['standard','large']).default('standard'),questionMode:z.enum(['gentle','off']).default('gentle')}),await body(req))));
 if(route==='onboarding/complete'&&req.method==='POST')return json(await call('onboarding.complete'));
 if(route==='privacy'&&get){const r=await call('privacy.get');return json({...r,choices:Object.entries(PURPOSES).map(([purpose,notice])=>{const c=r.choices.find(x=>x.purpose===purpose);return {purpose,...notice,enabled:!!c?.enabled,recorded:!!c,updatedAt:c?.updated_at??null,available:['storage','ai'].includes(purpose)};})});}
 if(route==='privacy'&&req.method==='PATCH')return json(await call('privacy.set',parse(z.object({purpose:z.enum(['ai','sharing','imports','notifications']),enabled:z.boolean(),noticeVersion:z.literal(NOTICE_VERSION)}),await body(req))));
 if(route==='security/sessions'&&get)return json(await call('security.sessions'));
 if(route==='account/status'&&get)return json(await call('account.status'));
 if(route==='account'&&req.method==='DELETE'){await call('account.close',parse(z.object({confirm:z.literal('DELETE')}),await body(req)));const r=await call('account.status');return json({...r,remaining:r.status==='deleting'});}
 if(route==='entries'&&get){const payload=parse(z.object({q:z.string().max(100),year:z.union([z.string().regex(/^\d{4}$/),z.literal('')]),before:z.union([day,z.literal('')]),last:z.union([uuid,z.literal('')]),favorite:z.boolean()}),{q:(url.searchParams.get('q')??'').slice(0,100),year:url.searchParams.get('year')??'',before:url.searchParams.get('before')??'',last:url.searchParams.get('last')??'',favorite:url.searchParams.get('favorite')==='1'});if(!!payload.before!==!!payload.last)throw new AppError(400,'Reload this chapter.');const r=await call('entries.list',payload);return json({entries:r.entries.slice(0,60),hasMore:r.entries.length>60});}
 if(route==='entries'&&['POST','PATCH'].includes(req.method)){const value=parse(entrySchema,await body(req));if(req.method==='PATCH'&&!value.version)throw new AppError(400,'Reload the page version before saving.');if(req.method==='POST'&&value.version)throw new AppError(400,'Save this as a new copy.');return json(await call('entries.save',value));}
 if(path[0]==='entries'&&path.length===2){const id=parse(uuid,path[1]);if(get)return json(await call('entries.get',{id}));if(req.method==='DELETE')return json(await call('entries.delete',{id}));}
 if(route==='calendar'&&get){const r=await call('calendar',{month:parse(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),url.searchParams.get('month'))});if(r.entries.length>1000)throw new AppError(413,'This month has too many pages for Calendar. Open them in My life.');return json(r);}
 if(route==='collections'&&get)return json(await call('collections'));
 if(route==='recap'&&get)return json(await call('recap',{date:parse(day,url.searchParams.get('date'))}));
 if(route==='assets'&&req.method==='POST'){
  const bytes=await bounded(req,4*1024**2).catch(e=>{throw new AppError(e.status??400,e.message);});
  // getSession is used only to transport the token, after verified getUser above.
  const session=await client.auth.getSession();if(!session.data.session?.access_token)throw new AppError(401,'Sign in again.');
  let r;try{r=await request(env.SUPABASE_URL+'/functions/v1/schema-upload',{method:'POST',headers:{Authorization:'Bearer '+session.data.session.access_token,apikey:env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':req.headers.get('content-type')??'','x-asset-id':parse(uuid,req.headers.get('x-asset-id')),'x-file-name':(req.headers.get('x-file-name')??'Memory').slice(0,100)},body:bytes,signal:AbortSignal.timeout(55000)});}catch{throw new AppError(503,'Upload interrupted. Your local draft is kept. Retry shortly.');}
  let result;try{result=await r.json();}catch{throw new AppError(503,'Upload did not finish. Your local draft is kept.');}if(!r.ok)throw new AppError(r.status,result.error??'Upload did not finish.');return json(result);
 }
 if(path[0]==='assets'&&path[1]){const id=parse(uuid,path[1]);if(req.method==='DELETE'&&path.length===2)return json(await call('media.delete',{id}));if(get&&path.length<=3){const {asset}=await call('media.get',{id,...revision});if(path[2]==='meta')return json({id:asset.id,name:asset.name,type:asset.type,size:asset.size});if(path.length!==2)throw new AppError(404,'This file action is unavailable.');const {data:blob,error}=await client.storage.from('schema-media').download(asset.key);if(error||!blob)throw new AppError(503,'This saved file is temporarily unavailable.');if(blob.size!==asset.size)throw new AppError(503,'This file is incomplete. Download paused.');return new Response(blob,{headers:{'Content-Type':asset.type,'Content-Length':String(asset.size),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Content-Disposition':'inline'}});}}
 if((route==='media'||route==='export/media')&&get){const after=parse(z.union([uuid,z.literal('')]),url.searchParams.get('after')??'');const r=await call('media.list',{after,unused:url.searchParams.get('unused')==='1',...revision});return json({assets:r.assets.slice(0,100),next:r.assets.length>100?r.assets[99].id:null});}
 if(route==='export/summary'&&get)return json(await call('export.summary',revision));
 if(route==='export'&&get){const r=await call('export.entries',{after:parse(z.union([uuid,z.literal('')]),url.searchParams.get('after')??''),...revision});return json({entries:r.entries.slice(0,100),next:r.entries.length>100?r.entries[99].id:null});}
 if(['shares','circles','notifications','report'].includes(path[0]))throw new AppError(503,'Close-friend sharing opens in a later phase.');
 if(path[0]==='billing')throw new AppError(503,'Subscriptions open after launch validation.');
 if(route==='ask'&&req.method==='POST')return await customerAsk(client,env,data.user,await body(req),{request});
 if(path[0]==='ask')throw new AppError(405,'Use the companion question form.');
 throw new AppError(404,'This journal action is unavailable.');
}
