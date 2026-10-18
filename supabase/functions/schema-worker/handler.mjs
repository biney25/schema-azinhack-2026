import {answer,bounded,Fault,rpc} from '../_shared/http.mjs';
export async function runWorker(req,admin){
 let runId,processed=0,failed=0;
 try{
  if(req.method!=='POST')throw new Fault(405,'Method unavailable.');
  let body;try{body=JSON.parse(new TextDecoder().decode(await bounded(req,1024)));}catch(e){if(e instanceof Fault)throw e;throw new Fault(400,'Invalid dispatch.');}
  ({runId}=await rpc(admin,'schema_worker','authorize',{token:body?.token}));
  const deadline=Date.now()+40000;
  while(processed<5&&Date.now()<deadline){
   const job=await rpc(admin,'schema_worker','claim');if(!job)break;
   const lease={jobId:job.id,leaseToken:job.lease_token};
   try{
    const batch=await rpc(admin,'schema_worker','batch',lease);
    if(batch.deferred){processed++;continue;}
    if(batch.assets.length){
     const {error}=await admin.storage.from('schema-media').remove(batch.assets.map(a=>a.key));if(error)throw error;
     await rpc(admin,'schema_worker','ack',{...lease,ids:batch.assets.map(a=>a.id)});
    }else{
     if(batch.kind==='account_erasure'){
      const {ownerId}=await rpc(admin,'schema_worker','prepare_auth_delete',lease);
      const {error}=await admin.auth.admin.deleteUser(ownerId);
      if(error&&error.status!==404&&error.code!=='user_not_found')throw error;
     }
     await rpc(admin,'schema_worker','complete',lease);
    }
   }catch{failed++;await rpc(admin,'schema_worker','fail',lease).catch(()=>{});}
   processed++;
  }
  await rpc(admin,'schema_worker','run.finish',{runId,processed,failed});
  return answer({ok:true,processed,failed});
 }catch(e){return answer({error:e instanceof Fault?e.message:'Worker unavailable.'},e instanceof Fault?e.status:503);}
}
