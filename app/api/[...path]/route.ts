import {getRequestContext} from '#schema-platform';
import {handleCustomer} from '@/lib/customer/service.mjs';
import {authAction} from '@/lib/customer/auth.mjs';
import { handle, AppError, json } from '@/lib/server/service.mjs';
export const dynamic='force-dynamic';
async function route(req:Request,context:{params:Promise<{path:string[]}>}){
 let ctx:any;
 try {const {path}=await context.params;ctx=await getRequestContext(req);if(ctx.mode==='customer')return path[0]==='auth'?await authAction(req,path[1],ctx.env,ctx.auth):ctx.finish(await handleCustomer(req,path,ctx.client,ctx.env));if(path[0]==='billing'&&!(req.method==='GET'&&path[1]==='status'))return json({error:'Billing is not available in this private release.'},503);return await handle(req,path,ctx.user,ctx.env);}
 catch(e:any){if(e instanceof AppError)return ctx?ctx.finish(json({error:e.message},e.status)):json({error:e.message},e.status);const reason=String(e?.message??'');if(reason.includes('sharing_not_allowed'))return json({error:'Sharing is paused. Enable it in Privacy before sending a postcard or invitation.'},403);if(reason.includes('entry_media_unavailable'))return json({error:'One of these files changed while saving. Your draft is kept; remove the unavailable file and retry.'},409);if(reason.includes('account_unavailable'))return json({error:'This journal is being closed. New changes cannot be saved.'},409);const incident=crypto.randomUUID();console.error('schema_error',{incident,kind:e?.name});return json({error:'Something went wrong. Your local draft is kept. Please try again.',incident},500);}
}
export {route as GET,route as POST,route as PATCH,route as DELETE};
