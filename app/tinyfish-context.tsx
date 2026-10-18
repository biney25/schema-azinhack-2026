'use client';
import {useEffect,useState} from 'react';
import {Fish, ExternalLink, Sparkles, CheckCircle2, LoaderCircle} from 'lucide-react';

type Facts={title:string;date:string;venue:string;lineup:string[];description:string;evidence:string;sourceUrl:string};
type Field='title'|'date'|'venue'|'lineup'|'description';
const labels:Record<Field,string>={title:'Event title',date:'Date',venue:'Venue',lineup:'Lineup or program',description:'What the event was about'};
const fields:Field[]=['title','date','venue','lineup','description'];

/** Hackathon addon: facts are PUBLIC and untrusted until the user explicitly checks them. */
export function TinyFishContext({onCreate}:{onCreate:(p:{title:string;date:string;place:string;body:string;tags:string[]})=>void}){
 const [url,setUrl]=useState('');const [consent,setConsent]=useState(false);const [busy,setBusy]=useState(false);
 const [token,setToken]=useState('');const [facts,setFacts]=useState<Facts|null>(null);
 const [selected,setSelected]=useState<Field[]>([]);const [error,setError]=useState('');
 useEffect(()=>{if(!token)return;
  let closed=false;let timer:ReturnType<typeof setTimeout>|undefined;let pending=false;let attempts=0;
  const check=async()=>{if(closed||pending)return;pending=true;
   try{
    const res=await fetch('/api/tinyfish?token='+encodeURIComponent(token),{cache:'no-store'});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not check research');
    if(closed)return;
    if(data.status==='COMPLETED'){setFacts(data.facts);setToken('');setBusy(false);return;}
    if(['FAILED','CANCELLED'].includes(data.status))throw new Error(data.error||'Research did not finish');
    if(++attempts>=80)throw new Error('Research is still taking time. Try again later.');
    timer=setTimeout(check,2000);
   }catch(e:any){if(!closed){setError(e?.message||'Unable to read event page');setToken('');setBusy(false);}}
   finally{pending=false;}
  };check();return()=>{closed=true;if(timer)clearTimeout(timer);};
 },[token]);
 const start=async()=>{setError('');setFacts(null);setSelected([]);
  if(!consent){setError('Confirm that this link is public first.');return;}
  setBusy(true);
  try{const res=await fetch('/api/tinyfish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});const data=await res.json();if(!res.ok)throw new Error(data.error||'TinyFish is not available');setToken(data.token);}
  catch(e:any){setError(e?.message||'Could not start research');setBusy(false);}
 };
 const chosen=fields.filter(f=>selected.includes(f)&&facts&&(f==='lineup'?facts.lineup.length:!!facts[f]));
 const add=()=>{if(!facts||!chosen.length)return;
  const lines=chosen.map(f=>`${labels[f]}: ${f==='lineup'?facts.lineup.join(', '):facts[f]}`);
  const verifiedDate=selected.includes('date')&&/^\d{4}-\d{2}-\d{2}$/.test(facts.date)?facts.date:[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-');
  onCreate({title:selected.includes('title')&&facts.title?facts.title:'A day worth keeping',date:verifiedDate,place:selected.includes('venue')?facts.venue:'',tags:['event'],body:'MY MEMORY\n\n(Write what this day meant to you.)\n\nPUBLIC EVENT CONTEXT — reviewed and selected by me\n'+lines.join('\n')+'\nSource: '+facts.sourceUrl+'\nFetched with TinyFish. Public information; not a personal memory.'});
 };
 return <section className="tinyfish-card" aria-label="Add public event context with TinyFish">
  <div className="tinyfish-title"><span className="tinyfish-mark"><Fish size={19}/></span><div><span className="eyebrow">AZINHACK × TINYFISH</span><h2>A little context for your memory.</h2></div></div>
  <p>Have a public event page for somewhere you went? TinyFish can read the event details—including interactive schedules. You decide which facts belong on your scrapbook page. It never sees your private notes or photos.</p>
  <label className="tinyfish-input-label" htmlFor="public-event-url">Public event link</label>
  <div className="tinyfish-input-row"><input id="public-event-url" type="url" value={url} onChange={e=>{setUrl(e.target.value);setError('');}} placeholder="https://example.org/event" maxLength={2048} disabled={busy}/><button className="primary" onClick={start} disabled={busy||!url.trim()||!consent}>{busy?<><LoaderCircle size={16} className="animate-spin"/> Researching…</>:<><Sparkles size={16}/> Find event facts</>}</button></div>
  <label className="tinyfish-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>I confirm this is a public page and I want TinyFish to read it.</label>
  {error&&<p role="alert" className="tinyfish-error">{error}</p>}
  {busy&&<p role="status" className="tinyfish-progress">TinyFish is browsing this public page. Your private journal stays untouched.</p>}
  {facts&&<div className="tinyfish-results"><div className="tinyfish-results-head"><h3>Review before saving</h3><a href={facts.sourceUrl} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={14}/></a></div>
   <p>Nothing is copied until you select facts and open a new draft. Verify these against the original page.</p>
   {fields.filter(f=>f==='lineup'?facts.lineup.length:!!facts[f]).map(f=><label className="tinyfish-fact" key={f}><input type="checkbox" checked={selected.includes(f)} onChange={e=>setSelected(v=>e.target.checked?[...v,f]:v.filter(x=>x!==f))}/><span><strong>{labels[f]}</strong><small>{f==='lineup'?facts.lineup.join(' · '):facts[f]}</small></span></label>)}
   {facts.evidence&&<blockquote className="tinyfish-evidence">Source excerpt: “{facts.evidence}”</blockquote>}
   <button className="primary" disabled={!chosen.length} onClick={add}><CheckCircle2 size={17}/> Create a draft from {chosen.length} reviewed {chosen.length===1?'fact':'facts'}</button>
  </div>}
 </section>;
}
