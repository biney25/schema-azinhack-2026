'use client';
import {useEffect,useRef,useState} from 'react';
import {Lock,ShieldCheck} from 'lucide-react';
import {vaultStatus,unlockVault,lockVault,changeVaultPassphrase,resetDeviceVault} from '@/lib/device-vault.mjs';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';

export function DeviceGate({owner,children,authMode='sites'}:{owner:string;children:React.ReactNode;authMode?:string}) {
    const [status,setStatus]=useState<any>(null),[passphrase,setPassphrase]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reset,setReset]=useState(false),[confirm,setConfirm]=useState(''),[veiled,setVeiled]=useState(false),[generation,setGeneration]=useState(0);
    const latest=useRef<any>(null),lastActivity=useRef(Date.now());
    const refresh=()=>vaultStatus(owner).then(s=>{latest.current=s;setStatus(s);});
    useEffect(()=>{
        document.documentElement.classList.toggle('schema-device-veiled',veiled);
        const keepFocus=(e:Event)=>{if(veiled)e.stopImmediatePropagation();};
        if(veiled)document.addEventListener('focusin',keepFocus,true);
        return()=>{document.documentElement.classList.remove('schema-device-veiled');document.removeEventListener('focusin',keepFocus,true);};
    },[veiled]);
    useEffect(()=>{
        refresh().catch(e=>setError(e.message));
        const activity=()=>lastActivity.current=Date.now();
        const lock=async(broadcast=true,force=false)=>{if(!force&&(!latest.current?.enabled||latest.current?.locked))return;setVeiled(true);setError('');try{await lockVault(owner,broadcast);await refresh();setPassphrase('');setVeiled(false);}catch(e:any){setError('The final draft could not be saved, so it is still held in this tab. Unlock to retry: '+e.message);}};
        const requested=()=>lock();
        const updated=(e:Event)=>{if((e as CustomEvent).detail.owner===owner)refresh().catch(e=>setError(e.message));};
        const channel='BroadcastChannel'in window?new BroadcastChannel('schema-vault'):null;
        if(channel)channel.onmessage=async e=>{if(e.data.owner===owner){await lock(false,true);await refresh();}};
        const timer=setInterval(()=>{if(Date.now()-lastActivity.current>(latest.current?.autoLockMinutes??5)*60000)lock();},15000);
        window.addEventListener('pointerdown',activity,{passive:true});window.addEventListener('keydown',activity);
        window.addEventListener('schema-request-lock',requested);window.addEventListener('schema-vault',updated);
        return()=>{clearInterval(timer);channel?.close();window.removeEventListener('pointerdown',activity);window.removeEventListener('keydown',activity);window.removeEventListener('schema-request-lock',requested);window.removeEventListener('schema-vault',updated);};
    },[owner]);
    const content=status&&(!status.locked||veiled)?<div key={generation} hidden={veiled} inert={veiled}>{children}</div>:null;
    if(status&&!status.locked&&!veiled)return content;
    return <>{content}<main className="lock-screen"><section className="lock-card"><span className="brand">schema ✳</span><Lock size={30}/><h1>{status?'Your journal, kept close.':'Opening your journal…'}</h1>
        {status&&<><p>Unlock this browser with your device passphrase.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await unlockVault(owner,passphrase);setPassphrase('');lastActivity.current=Date.now();await refresh();setVeiled(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}}}><label>Device passphrase<input type="password" autoComplete="off" value={passphrase} onChange={e=>setPassphrase(e.target.value)} minLength={12} maxLength={256} required autoFocus/></label><button className="primary full" disabled={busy}>{busy?'Unlocking…':'Open my journal'}</button></form><button className="text-button" onClick={()=>setReset(true)}>Forgot this device’s passphrase?</button><a className="text-button" href={authMode==='customer'?'/auth/logout':'/signout-with-chatgpt?return_to=%2F'} target="_top">Sign out</a></>}
        {error&&<p role="alert">{error}</p>}{!status&&error&&<button className="soft-button" onClick={()=>{setError('');refresh().catch(e=>setError(e.message));}}>Try again</button>}
        <p className="help-text">This lock protects this browser and its local drafts. Your online journal still uses your account’s sign-in protection.</p>
    </section><AlertDialog open={reset} onOpenChange={setReset}><AlertDialogContent><AlertDialogTitle>Reset this device lock?</AlertDialogTitle><AlertDialogDescription>All unfinished drafts, photos and recordings stored on this browser for this account will be discarded. Pages already saved online remain. Your device passphrase cannot be recovered.</AlertDialogDescription><label>Type DISCARD LOCAL DRAFTS<input value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="off"/></label><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep drafts</AlertDialogCancel><button className="primary danger-bg" disabled={busy||confirm!=='DISCARD LOCAL DRAFTS'} onClick={async()=>{setBusy(true);try{await resetDeviceVault(owner,confirm);setReset(false);setConfirm('');setGeneration(g=>g+1);setVeiled(false);await refresh();}catch(e:any){setError(e.message);}finally{setBusy(false);}}}>Discard local drafts</button></AlertDialogFooter></AlertDialogContent></AlertDialog></main></>;
}

export function DeviceLockSettings({owner}:{owner:string}) {
    const [status,setStatus]=useState<any>(null),[pass,setPass]=useState(''),[again,setAgain]=useState(''),[minutes,setMinutes]=useState('5'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[remove,setRemove]=useState(false);
    const refresh=()=>vaultStatus(owner).then(s=>{setStatus(s);setMinutes(String(s.autoLockMinutes));});
    useEffect(()=>{refresh().catch(e=>setMessage(e.message));},[owner]);
    async function change(value:string){setBusy(true);setMessage('');try{await changeVaultPassphrase(owner,value,Number(minutes));setPass('');setAgain('');setRemove(false);await refresh();setMessage(value?'Device lock saved. Your local drafts are protected by this passphrase.':'Device passphrase removed. Drafts still use browser-held encryption.');}catch(e:any){setMessage(e.message);}finally{setBusy(false);}}
    return <section className="device-lock-settings"><h3><ShieldCheck size={18}/>Keep this device private</h3><p>Draft text, photos and recordings are encrypted in this browser. Add a passphrase to lock the journal when you step away.</p><p className="help-text">This does not encrypt your online journal end to end. Without a passphrase, the browser holds the draft key. A compromised browser can access an unlocked journal.</p>
        <form onSubmit={e=>{e.preventDefault();if(pass!==again){setMessage('The passphrases do not match.');return;}change(pass);}}><label>{status?.enabled?'New device passphrase':'Device passphrase'}<input type="password" autoComplete="new-password" minLength={12} maxLength={256} value={pass} onChange={e=>setPass(e.target.value)} required/></label><label>Repeat passphrase<input type="password" autoComplete="new-password" value={again} onChange={e=>setAgain(e.target.value)} required/></label><label>Lock after inactivity<Select value={minutes} onValueChange={setMinutes}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['1','5','15'].map(m=><SelectItem key={m} value={m}>{m} minute{m==='1'?'':'s'}</SelectItem>)}</SelectContent></Select></label><p className="help-text">Use at least 12 characters. If you forget it, resetting this device lock discards local drafts. Saved online pages remain.</p><button className="primary" disabled={busy}>{busy?'Protecting drafts…':status?.enabled?'Update device lock':'Enable device lock'}</button></form>
        {status?.enabled&&<div className="billing-actions"><button className="soft-button" disabled={busy} onClick={()=>window.dispatchEvent(new Event('schema-request-lock'))}><Lock size={16}/>Lock now</button><button className="text-button danger" disabled={busy} onClick={()=>setRemove(true)}>Remove device passphrase</button></div>}{message&&<p role="status">{message}</p>}
        <AlertDialog open={remove} onOpenChange={setRemove}><AlertDialogContent><AlertDialogTitle>Remove this device’s passphrase?</AlertDialogTitle><AlertDialogDescription>Anyone using this signed-in browser can open the journal and its drafts. Online account security stays in place.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep lock</AlertDialogCancel><button className="primary" disabled={busy} onClick={()=>change('')}>Remove passphrase</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </section>;
}
