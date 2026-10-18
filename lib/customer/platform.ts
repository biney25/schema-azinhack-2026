import {NextResponse} from 'next/server';
import {headers} from 'next/headers';
import {requestAuth} from './auth.mjs';
export async function getRequestContext(req:Request):Promise<any>{
 const auth=requestAuth(req,process.env);
 return {mode:'customer',client:auth.client,auth,env:process.env,finish:auth.finish};
}
export async function getPlatformSession():Promise<any>{
 const origin=process.env.APP_ORIGIN??'http://localhost:3000';
 const auth=requestAuth(new Request(origin,{headers:await headers()}),process.env);
 const {data,error}=await auth.client.auth.getUser();
 return {mode:'customer',user:!error&&data?.user?.email_confirmed_at?{userId:data.user.id,email:data.user.email,fullName:''}:null};
}

export async function refreshPlatformAuth(req:Request){
 const auth=requestAuth(req,process.env);await auth.client.auth.getUser();
 const forwarded=new Headers(req.headers);forwarded.set('cookie',auth.cookieHeader());
 return auth.finish(NextResponse.next({request:{headers:forwarded}}));
}
