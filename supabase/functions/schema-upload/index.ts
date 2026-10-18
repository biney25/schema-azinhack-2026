import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
import {answer,bounded,fileType,hash,Fault,rpc} from '../_shared/http.mjs';
// Custom Auth supports the project's asymmetric JWTs. Both provider getUser and
// the database's live-session/active-account check run before privileged storage.
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=='POST')throw new Fault(405,'Use a journal upload.');
  const authorization=req.headers.get('authorization')??'';
  if(!authorization.startsWith('Bearer '))throw new Fault(401,'Sign in to upload.');
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
  const user=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const verified=await user.auth.getUser(authorization.slice(7));
  if(verified.error||!verified.data.user?.email_confirmed_at)throw new Fault(401,'Sign in to upload.');
  const bytes=await bounded(req,8*1024**2),type=(req.headers.get('content-type')??'').split(';')[0];
  if(bytes.length<12||!type||type!==fileType(bytes))throw new Fault(415,'The file content does not match its format.');
  const id=req.headers.get('x-asset-id')??'';
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new Fault(400,'Choose this file again.');
  const result=await rpc(user,'schema_api','media.reserve',{id,type,size:bytes.length,checksum:await hash(bytes),name:(req.headers.get('x-file-name')??'Memory').slice(0,100)});
  if(!result.existing){
   const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const {error}=await admin.storage.from('schema-media').upload(result.asset.key,bytes,{contentType:type,upsert:false});
   if(error)throw new Fault(503,'Upload interrupted. Your draft is kept. Pending files are cleaned up automatically.');
   await rpc(user,'schema_api','media.finalize',{id});
  }
  return answer({asset:{id,name:result.asset.name,type,size:bytes.length},id});
 }catch(error){return answer({error:error instanceof Fault?error.message:'Upload could not finish. Your draft is kept.'},error instanceof Fault?error.status:503);}
});
