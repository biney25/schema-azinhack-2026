'use client';
import {useEffect,useState} from 'react';
import {api,clearDrafts} from '@/lib/client';
import {Lock,Loader2} from 'lucide-react';
export function ErasureProgress({owner,authMode='sites'}:{owner:string;authMode?:string}) {
    const [state,setState]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
    const refresh=()=>api('account/status').then(setState);
    useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
    async function finish(){await clearDrafts(owner);location.href=authMode==='customer'?'/auth/logout':'/signout-with-chatgpt?return_to=%2F';}
    async function resume(){setBusy(true);setError('');try{
        const result=await api('account',{method:'DELETE',body:JSON.stringify({confirm:'DELETE'})});setState(result);
        if(!result.remaining)await finish();
    }catch(e:any){setError(e.message);await refresh().catch(()=>{});}finally{setBusy(false);}}
    return <main className="lock-screen"><section className="lock-card"><span className="brand">schema ✳</span><Lock size={30}/><h1>Your journal is closed.</h1><p>Pages, media and postcards cannot be opened while your deletion is in progress.</p>
        {state&&<p role="status">{state.job?.state==='succeeded'?'Your online journal has been deleted.':`${state.remainingFiles} files remaining · ${state.job?.state??'Checking'}`}</p>}
        <p className="help-text">{authMode==='customer'?'Deletion continues securely in the background. You can return here to check progress.':'In this private release, each continuation removes up to 50 files. Return here if interrupted. Automatic background deletion is not connected yet.'}</p>
        {authMode==='customer'?<button className="primary full" disabled={busy} onClick={()=>finish().catch(e=>setError(e.message))}>Clear this device and sign out</button>:state?.job?.state==='failed'?<p role="alert">Automatic retries are exhausted. The operator must restore storage availability and resume this deletion job. Your journal stays closed.</p>:<button className="primary full" disabled={busy||!state} onClick={()=>state.job?.state==='succeeded'?finish().catch(e=>setError(e.message)):resume()}>{busy?<><Loader2 className="spin" size={16}/>Deleting a batch…</>:state?.job?.state==='succeeded'?'Clear this device and sign out':'Continue deleting'}</button>}
        {state?.job?.state==='pending'&&state.job.attempts>0&&<p>Retry after {state.job.available_at?new Date(state.job.available_at).toLocaleTimeString():'a short pause'}.</p>}
        {error&&<p role="alert">{error}</p>}<a className="text-button" href={authMode==='customer'?'/auth/logout':'/signout-with-chatgpt?return_to=%2F'} target="_top">Sign out</a>
        <p className="help-text">Backups follow the hosting provider’s retention policy. Unsaved drafts on other devices need to be cleared there.</p>
    </section></main>;
}
