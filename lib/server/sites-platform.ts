import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function getRequestContext(_req:Request):Promise<any>{return {mode:'sites',user:await getChatGPTUser(),env:{...env,BILLING_ENABLED:'false'},finish:(r:Response)=>r};}
export async function getPlatformSession():Promise<any>{return {mode:'sites',user:await getChatGPTUser()};}

export async function refreshPlatformAuth(_req:Request){return undefined;}
