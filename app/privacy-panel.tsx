'use client';
import {useEffect,useState} from 'react';
import {Switch} from '@/components/ui/switch';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {api} from '@/lib/client';
export function PrivacyChoices({refresh}:{refresh:()=>void}) {
    const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[change,setChange]=useState<any>(null),[history,setHistory]=useState(false);
    const load=()=>api('privacy').then(setData).catch(e=>setError(e.message));
    useEffect(()=>{load();},[]);
    async function save(){setBusy(true);setError('');try{await api('privacy',{method:'PATCH',body:JSON.stringify({purpose:change.purpose,enabled:change.enabled,noticeVersion:data.noticeVersion})});setChange(null);await load();refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}}
    return <section><h3>Choose what your journal can do</h3><p>Each optional choice is separate. Nothing is shared or sent to AI just because you save a page.</p>{data?.choices.map((c:any)=><div className="switch-row" key={c.purpose}><label htmlFor={'choice-'+c.purpose}>{c.title}<small>{c.description}{!c.recorded&&c.purpose==='sharing'?' Choose an audience each time you share.':''}</small></label>{c.purpose==='storage'?<span className="status-label">{c.enabled?'Active':'Not started'}</span>:<Switch id={'choice-'+c.purpose} checked={c.enabled} disabled={busy||!c.available} onCheckedChange={enabled=>setChange({...c,enabled})}/>}</div>)}
        {error&&<p role="alert">{error}<button className="text-button" onClick={load}>Reload choices</button></p>}
        <button className="text-button" onClick={()=>setHistory(!history)}>{history?'Hide':'View'} recent privacy choices</button>{history&&<div className="privacy-history">{data?.history.length?data.history.map((e:any)=><p key={e.id}>{e.purpose} · {e.enabled?'Allowed':'Off'}<small>{new Date(e.created_at).toLocaleString()} · Notice {e.notice_version}</small></p>):<p>No choices recorded yet.</p>}</div>}
        <AlertDialog open={!!change} onOpenChange={open=>!busy&&!open&&setChange(null)}><AlertDialogContent><AlertDialogTitle>{change?.enabled?'Allow':'Turn off'} {change?.title?.toLowerCase()}?</AlertDialogTitle><AlertDialogDescription>{change?.description}{change?.purpose==='sharing'&&!change?.enabled?' Existing postcards you sent will be revoked. Saved copies held by recipients cannot be recalled.':''}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep current choice</AlertDialogCancel><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save this choice'}</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>;
}
