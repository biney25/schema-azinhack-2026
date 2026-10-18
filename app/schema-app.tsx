'use client';
import { useEffect, useRef, useState } from 'react';
import { BookOpen, Feather, Plus, Search, Heart, ImagePlus, ArrowUpRight, ArrowLeft, ArrowRight, CalendarDays, Users, Sparkles, Settings, Lock, Check, Camera, Mic, Trash2, Download, Share2, MapPin, Flower2, Smile, Star, ChevronRight, Cloud, CloudOff, Menu, X, Send, FolderHeart, Loader2, Undo2, LogOut, ShieldCheck, Music, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Toaster, toast } from 'sonner';
import { api, saveDraft, removeDraft, listDrafts, clearDrafts, prepareImage, entryPayload } from '@/lib/client';
import {PrivacyChoices} from './privacy-panel';
import {DeviceLockSettings} from './device-lock';
import {WelcomeGuide} from './welcome-guide';
import {AccountSecurity} from './auth/security';
import {ErasureProgress} from './erasure-progress';
import { ExportPanel } from './export-panel';
import { StoragePanel, BillingManager, DraftsButton, DangerAction } from './account-tools';
import { CalendarView, Collections, WeeklyRecap, MemoryInbox } from './archive-extras';
import {TinyFishContext} from './tinyfish-context';
const moods = [['happy', 'sunny'], ['peaceful', 'soft'], ['tired', 'slow'], ['sad', 'blue'], ['mixed', 'a little of everything'], ['proud', 'proud']] as const;
const icons: any = { today: BookOpen, life: CalendarDays, friends: Users, ask: Sparkles, settings: Settings };
const titles: any = { today: 'My journal', life: 'My life', friends: 'Close to me', ask: 'A little reflection', settings: 'My corner' };
const promptList = ['What is one tiny thing you want to remember?', 'What felt a little lighter today?', 'Who made your day feel like yours?', 'What are you quietly proud of?', 'What would you tell your future self?'];
const dateNow = () => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
const dateLabel = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (date: string) => new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const fail = (e: any) => toast.error(e.message ?? 'Something went wrong');
type Session = {
    id: string;
    name: string;
    email: string;
} | null;
export default function SchemaApp({ session,authMode='sites' }: {
    session: Session;authMode?:string;
}) {
    const [view, setView] = useState('today'), [data, setData] = useState<any>(null), [loading, setLoading] = useState(!!session), [error, setError] = useState(''), [entries, setEntries] = useState<any[]>([]), [query, setQuery] = useState(''), [year, setYear] = useState('all'), [favorites, setFavorites] = useState(false), [hasMore, setHasMore] = useState(false), [editor, setEditor] = useState<any>(null), [reader, setReader] = useState<any>(null), [share, setShare] = useState<any>(null), [deletePage, setDeletePage] = useState<any>(null), [online, setOnline] = useState(true), [onboarding, setOnboarding] = useState(false);
    const signin = () => { location.href = authMode==='customer'?'/auth/login':'/signin-with-chatgpt?return_to=%2F'; };
    const refresh = async () => { if (!session)
        return; try {
        const r = await api('bootstrap');
        setData(r);
        setEntries(r.entries);
        setHasMore(r.hasMore);
        setError('');
        setOnboarding(!r.profile.onboarded || r.profile.onboarding_step!=='done');
    }
    catch (e: any) {
        if(e.status===410){setData({profile:{status:'deleted'}});setError('');}else setError(e.message);
    }
    finally {
        setLoading(false);
    } };
    useEffect(() => { refresh(); const on = () => setOnline(navigator.onLine); on(); window.addEventListener('online', on); window.addEventListener('offline', on); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', on); }; }, []);
    const navigate = (v: string) => { setView(v); setQuery(''); setYear('all'); setFavorites(false); if (v === 'today' || v === 'life')
        refresh(); };
    const create = async (chosenTheme?: unknown) => { if (!session)
        return signin(); try {
        const draft = undefined;
        setEditor(draft ?? { id: crypto.randomUUID(), title: '', body: '', date: dateNow(), theme: typeof chosenTheme==='string'?chosenTheme:data?.profile.theme ?? 'rose', layout: 'collage', mood: '', tags: [], people: [], place: '', assets: [], blocks: [], pending: [], favorite: false, aiAllowed: false });
    }
    catch {
        toast.error('Your browser could not open local drafts. Enable site storage to create a page.');
    } };
    const search = async (q = query, y = year, f = favorites, append = false) => { try {
        const last = entries.at(-1);
        const r = await api('entries?' + new URLSearchParams({ q, year: y === 'all' ? '' : y, favorite: f ? '1' : '0', ...(append && last ? { before: last.date, last: last.id } : {}) }));
        setEntries(append ? [...entries, ...r.entries] : r.entries);
        setHasMore(r.hasMore);
    }
    catch (e) {
        fail(e);
    } };
    const openEntry = async (id: string) => { try {
        const r = await api('entries/' + id);
        setReader(r.entry);
    }
    catch (e) {
        fail(e);
    } };
    const favorite = async (e: any) => { try {
        const r = await api('entries', { method: 'PATCH', body: JSON.stringify({ ...entryPayload(e), favorite: !e.favorite }) });
        setEntries(entries.map(x => x.id === e.id ? r.entry : x));
        if (reader?.id === e.id)
            setReader(r.entry);
    }
    catch (e) {
        fail(e);
    } };
    if(session&&['deleting','deleted'].includes(data?.profile?.status))return <ErasureProgress owner={session.id} authMode={authMode}/>;
    const empty = <div className="empty-page"><BookOpen /><h3>The beginning of something lovely.</h3><p>One photo. A few words. A little piece of your life.</p><button className="primary" onClick={create}><Plus size={17}/>Make your first page</button></div>;
    return <SidebarProvider style={{ '--sidebar-width': '238px' } as any}><Toaster position="bottom-right" richColors/><div className={'schema-shell theme-' + (data?.profile.theme ?? 'rose') + (data?.profile.quiet ? ' quiet' : '')+(data?.profile.text_size==='large'?' large-text':'')}>
 <Sidebar className="journal-sidebar" collapsible="offcanvas"><SidebarHeader><button className="brand" onClick={() => navigate('today')}>schema<span>✳</span></button><span className="brand-sub">the little things, kept.</span></SidebarHeader><SidebarContent><div className="sidebar-label">YOUR LITTLE WORLD</div><SidebarMenu>{['today', 'life', 'friends', 'ask'].map(v => { const Icon = icons[v]; return <SidebarMenuItem key={v}><SidebarMenuButton isActive={view === v} onClick={() => navigate(v)} className="nav-item"><Icon size={19}/><span>{titles[v]}</span>{v === 'ask' && <span className="tiny-new">AI</span>}</SidebarMenuButton></SidebarMenuItem>; })}</SidebarMenu><button className="new-page-sidebar" onClick={create}><Plus size={18}/> A new page</button><div className="sidebar-note"><Flower2 size={25}/><p>You don’t have to make<br />every day extraordinary.<br /><em>Just make it yours.</em></p></div></SidebarContent><SidebarFooter><button className="account-button" onClick={() => navigate('settings')}><span className="avatar">{(data?.profile.name || session?.name || 'S').slice(0, 1)}</span><span><strong>{data?.profile.name || 'Your little corner'}</strong><small>{session ? 'Private journal' : 'Welcome to Schema'}</small></span><Settings size={17}/></button></SidebarFooter></Sidebar>
 <main className="main-shell"><header className="topbar"><div className="topbar-left"><SidebarTrigger className="mobile-menu"/><span>{titles[view]}</span><span className="slash">/</span><span className="muted">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span></div><div className="topbar-right">{session && <>{authMode!=='customer'&&<MemoryInbox onFriends={() => navigate('friends')}/>}<DraftsButton owner={session.id} onOpen={setEditor}/></>}<button className="privacy text-button" onClick={()=>navigate('settings')} title="Journal privacy and device lock settings"><Lock size={13}/>Just for you</button>{!online && <span className="offline"><CloudOff size={15}/> Offline</span>}<button className="round" aria-label="Search memories" onClick={() => { navigate('life'); setTimeout(() => document.getElementById('memory-search')?.focus(), 50); }}><Search size={19}/></button></div></header>
 <div className="workspace">{error && <div role="alert" className="error-banner">{error}<button onClick={refresh}>Try again</button></div>}
 {view === 'today' && <><div className="page-heading"><div><span className="eyebrow">A PLACE TO BE YOURSELF</span><h1>A little piece of <em>today.</em></h1><p>Collect the moments. Keep the feeling.</p></div><button className="primary" onClick={create}><Plus size={18}/>Make a page</button></div>
 <div className="book-wrap"><div className="book-tabs"><span className="active">today</span><button onClick={() => navigate('life')}>memories</button><button onClick={() => navigate('friends')}>our people</button></div><div className="open-book"><section className="book-left"><div className="book-date"><CalendarDays size={15}/>{dateLabel(dateNow())}</div><span className="handwritten tiny-script">dear life,</span><h2>Let’s keep<br />something <em>small.</em></h2><p>A passing thought. Your favourite person.<br />That ordinary moment you’ll miss someday.</p><button className="photo-add" onClick={create}><ImagePlus size={25}/><span>Add a photo or a thought</span><small>your page starts here</small></button><div className="book-bottom"><Lock size={12}/> Always private until you choose to share <span>01</span></div></section><section className="book-right"><div className="tape"/><img className="journal-art" src="/art/journal.png" alt="A handmade notebook, pressed flowers, and blank photo frames"/><p className="handwritten art-caption">a life made of little things</p><div className="prompt-note" hidden={data?.profile.question_mode==='off'}><span className="eyebrow"><Sparkles size={14}/> A LITTLE NUDGE</span><p>{promptList[new Date().getDate() % promptList.length]}</p><button onClick={create}>Save a thought <ArrowUpRight size={16}/></button></div></section></div></div>
 <div className="section-heading"><div><h2>Your recent pages <span className="count">{data?.stats.pages ?? 0}</span></h2><p>Bits and pieces of a life only you could live.</p></div><button className="text-button" onClick={() => navigate('life')}>Open my life <ArrowRight size={16}/></button></div>{loading ? <CardsSkeleton /> : entries.length ? <div className="memory-grid">{entries.slice(0, 3).map(e => <MemoryCard key={e.id} entry={e} onOpen={() => setReader(e)} onFavorite={() => favorite(e)}/>)}</div> : empty}
 {session && <WeeklyRecap date={dateNow()} onOpen={openEntry}/>}<div className="private-foot"><ShieldCheck size={16}/><span>Your pages belong to you. Export them whenever you like.</span></div></>}
 {view === 'life' && <><div className="page-heading"><div><span className="eyebrow">EVERY VERSION OF YOU</span><h1>The years you <em>keep.</em></h1><p>Old places. Familiar faces. The threads that connect it all.</p></div><button className="primary" onClick={create}><Plus size={18}/>Add a memory</button></div>{session && <TinyFishContext onCreate={p=>setEditor({id:crypto.randomUUID(),title:p.title,body:p.body,date:p.date,theme:data?.profile.theme??'rose',layout:'letter',mood:'',tags:p.tags,people:[],place:p.place,assets:[],blocks:[],pending:[],favorite:false,aiAllowed:false})}/>}<form className="search-row" onSubmit={e => { e.preventDefault(); search(); }}><Search size={19}/><input id="memory-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a person, place, word, or feeling…"/><button className="soft-button" type="submit">Search</button></form><div className="filter-row"><Select value={year} onValueChange={y => { setYear(y); search(query, y); }}><SelectTrigger className="year-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Every year</SelectItem>{data?.years?.map((y: any) => <SelectItem key={y.year} value={y.year}>{y.year} · {y.count} pages</SelectItem>)}</SelectContent></Select><button className={'filter-chip ' + (favorites ? 'selected' : '')} onClick={() => { setFavorites(!favorites); search(query, year, !favorites); }}><Heart size={15}/>Favourites</button><span className="muted">{data?.stats.days ?? 0} days kept</span></div><Tabs defaultValue="pages" className="life-tabs"><TabsList><TabsTrigger value="pages">Pages</TabsTrigger><TabsTrigger value="years">Years</TabsTrigger><TabsTrigger value="calendar">Calendar</TabsTrigger><TabsTrigger value="people">People & places</TabsTrigger></TabsList><TabsContent value="pages">{entries.length ? <><div className="memory-grid">{entries.map(e => <MemoryCard key={e.id} entry={e} onOpen={() => setReader(e)} onFavorite={() => favorite(e)}/>)}</div>{hasMore && <button className="soft-button load-more" onClick={() => search(query, year, favorites, true)}>More memories</button>}</> : query ? <div className="empty-page"><Search /><h3>No page found just yet.</h3><p>Try a different word, person, or year.</p></div> : empty}</TabsContent><TabsContent value="years"><div className="year-grid">{data?.years?.map((y: any, i: number) => <button className={'year-book cover-' + i % 3} key={y.year} onClick={() => { setYear(y.year); search('', y.year); }}><span>MY LITTLE LIFE</span><strong>{y.year}</strong>{data?.profile.birthday && Number(y.year) >= Number(data.profile.birthday.slice(0, 4)) && <small>about age {Number(y.year) - Number(data.profile.birthday.slice(0, 4))}</small>}<Flower2 /><small>{y.count} pages to return to</small></button>)}</div>{year !== 'all' && <div className="memory-grid">{entries.map(e => <MemoryCard key={e.id} entry={e} onOpen={() => setReader(e)} onFavorite={() => favorite(e)}/>)}</div>}{!data?.years?.length && empty}</TabsContent><TabsContent value="calendar">{session ? <CalendarView onOpen={setReader}/> : empty}</TabsContent><TabsContent value="people">{session && <Collections onSearch={(n: string) => { setQuery(n); search(n); }}/>}<div className="collection-grid" style={{ display: "none" }}>{Array.from(new Set(entries.flatMap(e => [...(e.people ?? []), e.place].filter(Boolean)))).map((n: any) => <button key={n} className="collection" onClick={() => { setQuery(n); search(n); }}><FolderHeart /><h3>{n}</h3><span>Find connected pages <ArrowUpRight size={15}/></span></button>)}</div><p className="help-text">People and places are labels you add to pages. Switch to Pages after choosing a label to see its memories.</p></TabsContent></Tabs></>}
 {view === 'friends' && (authMode==='customer'?<div className="empty-page"><Users/><h2>For your close people.</h2><p>Private postcards and circles open in a later phase. Your diary stays just for you.</p></div>:<Friends session={session} onSignIn={signin} onOpen={setReader}/>)}
 {view === 'ask' && <Companion data={data} session={session} onSettings={() => navigate('settings')} onOpen={openEntry}/>}
 {view === 'settings' && <Account authMode={authMode} data={data} session={session} refresh={refresh} onSignIn={signin}/>}
 </div><nav className="mobile-bottom">{['today', 'life', 'make', 'friends', 'ask'].map(v => { const I = v === 'make' ? Plus : icons[v]; return <button key={v} className={v === view ? 'active' : ''} onClick={() => v === 'make' ? create() : navigate(v)} aria-label={v}><I size={21}/><span>{v === 'make' ? 'Make' : v === 'today' ? 'Today' : v === 'life' ? 'Life' : v === 'friends' ? 'Friends' : 'Ask'}</span></button>; })}</nav></main></div>
 <Dialog open={!!editor} onOpenChange={o => !o && setEditor(null)}><DialogContent className="editor-dialog"><DialogTitle className="sr-only">Create a scrapbook page</DialogTitle><DialogDescription className="sr-only">A private page with photos, thoughts, and decorations.</DialogDescription>{editor && <Editor maxUploadBytes={data?.capabilities.maxUploadBytes??8*1024**2} initial={editor} session={session!} aiConsent={!!data?.profile.ai_consent} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setReader(null); refresh(); toast.success('A little piece of life, kept.'); }}/>}</DialogContent></Dialog>
 <Dialog open={!!reader} onOpenChange={o => !o && setReader(null)}><DialogContent className="reader-dialog"><DialogTitle className="sr-only">{reader?.title ?? 'Memory'}</DialogTitle><DialogDescription className="sr-only">Your saved journal page.</DialogDescription>{reader && <><PagePreview entry={reader}/><div className="reader-actions">{!reader.shared && <><button className="soft-button" onClick={async () => { const draft = (await listDrafts(session!.id)).find(d=>d.id===reader.id); setEditor(draft ?? reader); setReader(null); }}><Feather size={16}/>Edit</button><button className="soft-button" disabled={authMode==='customer'} title={authMode==='customer'?'Sharing opens in a later phase':undefined} onClick={() => setShare(reader)}><Share2 size={16}/>Share postcard</button><button className="icon-button danger" aria-label="Delete page" onClick={() => setDeletePage(reader)}><Trash2 size={18}/></button></>}<button className="text-button" onClick={() => window.print()}><Download size={16}/>Print page</button></div></>}</DialogContent></Dialog>
 <Dialog open={!!share} onOpenChange={o => !o && setShare(null)}><DialogContent className="share-dialog"><DialogTitle>A little piece, shared.</DialogTitle><DialogDescription>Only the selected postcard is shared. Your diary stays private.</DialogDescription>{share && <ShareForm entry={share} onDone={() => { setShare(null); toast.success('Postcard shared with your chosen audience.'); }}/>}</DialogContent></Dialog>
 <AlertDialog open={!!deletePage} onOpenChange={o => !o && setDeletePage(null)}><AlertDialogContent><AlertDialogTitle>Delete this page?</AlertDialogTitle><AlertDialogDescription>This removes the page and revokes its shared postcards. Uploaded media remains in your storage until you remove it.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={async () => { try {
        await api('entries/' + deletePage.id, { method: 'DELETE' });
        setDeletePage(null);
        setReader(null);
        refresh();
    }
    catch (e) {
        fail(e);
    } }}>Delete page</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Dialog open={onboarding} onOpenChange={setOnboarding}><DialogContent className="onboarding-dialog"><DialogTitle>Your story starts with you.</DialogTitle><DialogDescription>A private place for your photos and the thoughts around them.</DialogDescription><WelcomeGuide profile={data?.profile} onDone={async(startPage:boolean,theme:string) => { setOnboarding(false); await refresh(); if(startPage)create(theme); }}/></DialogContent></Dialog>
 </SidebarProvider>;
}
function CardsSkeleton() { return <div className="memory-grid">{[1, 2, 3].map(x => <Skeleton key={x} className="h-64 rounded-xl"/>)}</div>; }
function MemoryCard({ entry: e, onOpen, onFavorite }: any) { return <article className={'memory-card theme-' + e.theme}><button className="memory-open" onClick={onOpen}><div className="memory-cover">{e.assets[0] ? <SavedMedia id={e.assets[0]} cover alt={e.title}/> : <div className="text-cover"><Feather size={26}/><p>{e.body.slice(0, 100) || 'A day worth keeping.'}</p></div>}<div className="small-tape"/></div><div className="memory-meta"><span>{shortDate(e.date)}</span>{e.mood && <span>{moods.find(m => m[0] === e.mood)?.[1]}</span>}</div><h3>{e.title}</h3>{e.place && <p className="place"><MapPin size={12}/>{e.place}</p>}</button><button className={'favorite ' + (e.favorite ? 'is-favorite' : '')} aria-label={e.favorite ? 'Remove favourite' : 'Save as favourite'} onClick={onFavorite}><Heart size={17} fill={e.favorite ? 'currentColor' : 'none'}/></button></article>; }
function SavedMedia({ id, cover = false, alt = 'Memory' }: {
    id: string;
    cover?: boolean;
    alt?: string;
}) { const [type, setType] = useState(''), [error, setError] = useState(false); useEffect(() => { api('assets/' + id + '/meta').then(r => setType(r.type)).catch(() => setError(true)); }, [id]); if (error)
    return <span className="media-unavailable">Media unavailable</span>; if (!type)
    return <Skeleton className="h-32 w-full"/>; if (type.startsWith('audio'))
    return cover ? <div className="voice-cover"><Mic size={28}/><span>A voice worth keeping</span></div> : <audio controls preload="metadata" src={'/api/assets/' + id}/>; return <img src={'/api/assets/' + id} alt={alt} loading="lazy"/>; }
function PagePreview({ entry: e, pending = [], interactive = false, onMove }: any) { return <div className={'page-preview theme-' + e.theme + ' layout-' + e.layout}><span className="entry-date">{dateLabel(e.date)}</span><h2>{e.title || 'A little piece of today'}</h2><div className="page-media">{[...e.assets, ...pending.map((p: any) => p.id)].map((id: string) => { const staged = pending.find((p: any) => p.id === id); const src = staged?.url ?? '/api/assets/' + id; if (!staged)
    return <SavedMedia id={id} key={id} alt="A photo in this memory"/>; return staged?.type?.startsWith('audio') ? <audio controls src={src} key={id}/> : <img key={id} src={src} alt="A photo in this memory" onError={ev => { const img = ev.currentTarget; if (!img.dataset.audio) {
    img.dataset.audio = 'true';
    img.style.display = 'none';
} }}/>; })}</div><p className="entry-body">{e.body || 'What would you like to remember?'}</p>{e.place && <span className="page-location"><MapPin size={14}/>{e.place}</span>}<div className="page-tags">{e.people?.map((x: string) => <span key={x}>with {x}</span>)}{e.tags?.map((x: string) => <span key={x}>#{x}</span>)}</div>{e.blocks?.map((b: any) => <button key={b.id} className="sticker" style={{ left: b.x + '%', top: b.y + '%', transform: `rotate(${b.rotation}deg)` }} tabIndex={interactive ? 0 : -1} aria-label={'Decoration ' + b.text + '; use arrow keys to move'} onKeyDown={ev => { if (interactive && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
    ev.preventDefault();
    onMove(b.id, Math.max(0, Math.min(90, b.x + (ev.key === 'ArrowRight' ? 2 : ev.key === 'ArrowLeft' ? -2 : 0))), Math.max(0, Math.min(90, b.y + (ev.key === 'ArrowDown' ? 2 : ev.key === 'ArrowUp' ? -2 : 0))));
} }} onPointerDown={ev => { if (!interactive)
    return; const t = ev.currentTarget; const parent = t.parentElement!.getBoundingClientRect(); t.setPointerCapture(ev.pointerId); const move = (e: PointerEvent) => onMove(b.id, Math.max(0, Math.min(90, (e.clientX - parent.left) / parent.width * 100)), Math.max(0, Math.min(90, (e.clientY - parent.top) / parent.height * 100))); t.addEventListener('pointermove', move); t.addEventListener('pointerup', () => t.removeEventListener('pointermove', move), { once: true }); }}>{b.text}</button>)}</div>; }
function Editor({ initial, session, aiConsent, onClose, onSaved,maxUploadBytes=8*1024**2 }: any) {
    const [conflict,setConflict] = useState(false);
    const [e, setE] = useState(initial), [pending, setPending] = useState<any[]>([]), [busy, setBusy] = useState(false), [localStatus, setLocalStatus] = useState(''), [recording, setRecording] = useState(false), [draftReady, setDraftReady] = useState(false);
    const snapshot=useRef<any>(initial),active=useRef(true),work=useRef<Promise<unknown>|null>(null),recorded=useRef<Promise<void>|null>(null);
    snapshot.current=draftReady?{...e,pending:pending.map(({url,...p})=>p)}:initial;
    const recorder = useRef<MediaRecorder | null>(null), stream = useRef<MediaStream | null>(null), pendingRef = useRef<any[]>([]), undo = useRef<any[]>([]), file = useRef<HTMLInputElement>(null);
    useEffect(() => { active.current=true;const ps = (initial.pending ?? []).map((p: any) => ({ ...p, url: URL.createObjectURL(p.blob) })); setPending(ps); setDraftReady(true); return () => { active.current=false; pendingRef.current.forEach(p => URL.revokeObjectURL(p.url)); stream.current?.getTracks().forEach(t => t.stop()); }; }, []);
    useEffect(() => { pendingRef.current = pending; if (!draftReady)
        return; saveDraft(session.id, { ...e, pending: pending.map(({ url, ...p }) => p) }).then(() => setLocalStatus('Draft saved on this device')).catch(() => setLocalStatus('Draft storage unavailable — keep this page open')); }, [e, pending, draftReady]);
    useEffect(()=>{
        const beforeLock=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.owner!==session.id)return;detail.waitUntil((async()=>{
            await work.current;
            if(recorder.current?.state==='recording')recorder.current.stop();
            await recorded.current;
            if(active.current)await saveDraft(session.id,snapshot.current);
        })());};
        window.addEventListener('schema-before-lock',beforeLock);
        return()=>window.removeEventListener('schema-before-lock',beforeLock);
    },[session.id]);
    const change = (key: string, value: any) => { undo.current.push(e); if (undo.current.length > 30)
        undo.current.shift(); setE((old: any) => ({ ...old, [key]: value })); };
    const addFiles = async (files: FileList | null) => { if (!files)
        return; setBusy(true); try {
        const next: any[] = [];
        for (const f of Array.from(files).slice(0, 12 - e.assets.length - pending.length)) {
            const blob = await prepareImage(f);if(blob.size>maxUploadBytes)throw new Error('Choose a smaller photo. This journal accepts files up to '+(maxUploadBytes/1024**2)+' MB.');
            next.push({ id: crypto.randomUUID(), name: f.name, blob, type: blob.type, url: URL.createObjectURL(blob) });
        }
        snapshot.current={...snapshot.current,pending:[...snapshot.current.pending,...next.map(({url,...p})=>p)]};
        setPending(p => [...p, ...next]);
    }
    catch (error) {
        fail(error);
    }
    finally {
        setBusy(false);
    } };
    const voice = async () => { if (recording) {
        recorder.current?.stop();
        return;
    } try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const r = new MediaRecorder(stream.current, { mimeType: mime });
        recorder.current = r;
        const chunks: BlobPart[] = [];
        r.ondataavailable = ev => chunks.push(ev.data);
        recorded.current=new Promise<void>(resolve=>{r.onstop = () => {
            const blob = new Blob(chunks, { type: mime });
            if(blob.size&&blob.size<=maxUploadBytes&&active.current){
                const attachment={id:crypto.randomUUID(),name:'Voice memory',blob,type:mime};
                snapshot.current={...snapshot.current,pending:[...snapshot.current.pending,attachment]};
                setPending(p=>[...p,{...attachment,url:URL.createObjectURL(blob)}]);
            }else if(blob.size>maxUploadBytes)toast.error('This recording is too large. Make a shorter one.');
            stream.current?.getTracks().forEach(t=>t.stop());setRecording(false);resolve();
        };});
        r.start();
        setRecording(true);
        setTimeout(() => { if (r.state === 'recording')
            r.stop(); }, 120000);
    }
    catch (error) {
        fail(error);
    } };
    const save = async () => { if (!e.title.trim())
        return toast.error('Give this page a little title'); let savingEntry=false; setBusy(true); try {
        for (const asset of pending)
            await api('assets', { method: 'POST', headers: { 'Content-Type': asset.type, 'x-asset-id': asset.id, 'x-file-name': asset.name.replace(/[^a-zA-Z0-9 ._-]/g, '') }, body: asset.blob });
        const payload = { ...entryPayload(e), assets: [...new Set([...e.assets, ...pending.map(p => p.id)])] };
        savingEntry=true;
        await api('entries', { method: e.version ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
        await removeDraft(session.id, e.id);
        active.current=false;
        onSaved();
    }
    catch (error: any) {
        if(savingEntry && error.status===409) setConflict(true);
        setLocalStatus('Not synced — your draft stays on this device');
        fail(error);
    }
    finally {
        setBusy(false);
    } };
    return <div className="editor"><div className="editor-top"><div><span className="eyebrow">YOUR PAGE, YOUR WAY</span><h2>A day worth keeping.</h2></div><div className="editor-top-actions"><button className="icon-button" aria-label="Undo" onClick={() => { const old = undo.current.pop(); if (old)
        setE(old); }}><Undo2 size={18}/></button><button className="primary" onClick={()=>{work.current=save();}} disabled={busy || recording}>{busy ? <Loader2 className="spin" size={16}/> : <Check size={16}/>}Save page</button></div></div>{conflict && <div className="conflict-banner" role="alert"><strong>This page changed on another device.</strong><p>Your draft is safe here. Save it as a separate page to keep both versions.</p><button className="soft-button" disabled={busy} onClick={async()=>{try{const copy={...e,id:crypto.randomUUID(),version:undefined,title:(e.title+' (recovered copy)').slice(0,140),pending:pending.map(({url,...p})=>p)};await saveDraft(session.id,copy);await removeDraft(session.id,e.id);setE(copy);setConflict(false);toast.success('Ready to save as a separate page');}catch(error){fail(error);}}}>Keep both versions</button></div>}<div className="editor-grid" inert={busy}><div className="editor-fields"><label>Give it a title<input value={e.title} maxLength={140} onChange={v => change('title', v.target.value)} placeholder="The little things I loved…"/></label><label>Date<input type="date" value={e.date} onChange={v => change('date', v.target.value)}/></label><label>Your thoughts<textarea rows={5} value={e.body} maxLength={20000} onChange={v => change('body', v.target.value)} placeholder="It doesn’t have to be a big story."/></label><div className="mood-label">Today felt…</div><div className="mood-options">{moods.map(([value, name]) => <button key={value} className={e.mood === value ? 'selected' : ''} onClick={() => change('mood', e.mood === value ? '' : value)}>{name}</button>)}</div><label>With whom?<input defaultValue={e.people.join(', ')} onBlur={v => change('people', v.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="Names, separated by commas"/></label><label>A place<input value={e.place} onChange={v => change('place', v.target.value)} placeholder="Grandma’s garden"/></label><label>Threads and tags<input defaultValue={e.tags.join(', ')} onBlur={v => change('tags', v.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder="college, little wins, home"/></label><div className="switch-row"><label htmlFor="entry-ai">Let my companion use this page<small>Only if you also enable AI in Privacy.</small></label><Switch id="entry-ai" checked={e.aiAllowed} onCheckedChange={v => change('aiAllowed', v)} disabled={!aiConsent}/></div></div><div className="editor-canvas"><div className="editor-toolbar"><button className="soft-button" onClick={() => file.current?.click()} disabled={busy}><ImagePlus size={16}/>Photo</button><button className={'soft-button ' + (recording ? 'recording' : '')} onClick={()=>{work.current=voice();}} disabled={e.assets.length + pending.length >= 12}><Mic size={16}/>{recording ? 'Stop' : 'Voice'}</button><Select value={e.layout} onValueChange={v => change('layout', v)}><SelectTrigger className="layout-select"><SelectValue /></SelectTrigger><SelectContent>{['collage', 'letter', 'filmstrip'].map(v => <SelectItem value={v} key={v}>{v}</SelectItem>)}</SelectContent></Select><input ref={file} hidden type="file" accept="image/*" multiple onChange={v => {work.current=addFiles(v.target.files);}}/></div><PagePreview entry={e} pending={pending} interactive onMove={(id: string, x: number, y: number) => setE((old: any) => ({ ...old, blocks: old.blocks.map((b: any) => b.id === id ? { ...b, x, y } : b) }))}/><div className="sticker-tray"><span>A little decoration</span>{['✿', '♡', '★', 'good things', 'little joys'].map(s => <button key={s} onClick={() => change('blocks', [...e.blocks, { id: crypto.randomUUID(), text: s, x: 65, y: 70, rotation: -6 }])} disabled={e.blocks.length >= 20}>{s}</button>)}<button aria-label="Remove decorations" onClick={() => change('blocks', [])}><Trash2 size={14}/></button></div><div className="theme-tray">{['rose', 'lavender', 'vintage'].map(t => <button className={'theme-dot ' + t + (e.theme === t ? ' chosen' : '')} aria-label={t + ' theme'} key={t} onClick={() => change('theme', t)}/>)}</div>{(e.assets.length > 0 || pending.length > 0) && <div className="media-list">{[...e.assets, ...pending.map(p => p.id)].map((id: string, i: number) => <button key={id} className="filter-chip" onClick={() => { if (pending.some(p => p.id === id)) {
        setPending(p => p.filter(a => a.id !== id));
    }
    else
        change('assets', e.assets.filter((a: string) => a !== id)); }}>Media {i + 1}<X size={13}/></button>)}</div>}<div className="draft-status"><Cloud size={14}/>{localStatus || 'Saving draft…'}<span>Photos are optimized for your journal.</span></div></div></div></div>;
}
function ShareForm({ entry, onDone }: any) { const [email, setEmail] = useState(''), [circles, setCircles] = useState<any[]>([]), [circle, setCircle] = useState('none'), [text, setText] = useState(false), [place, setPlace] = useState(false), [days, setDays] = useState('7'), [busy, setBusy] = useState(false); useEffect(() => { api('circles').then(r => setCircles(r.circles.filter((c: any) => c.state !== 'pending'))).catch(fail); }, []); return <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); try {
    await api('shares', { method: 'POST', body: JSON.stringify({ entryId: entry.id, ...(circle === 'none' ? { email } : { circleId: circle }), includeText: text, includePlace: place, days: Number(days) }) });
    onDone();
}
catch (error) {
    fail(error);
}
finally {
    setBusy(false);
} }}><div className="postcard-preview"><strong>{entry.title}</strong><span>{dateLabel(entry.date)} · {entry.assets.length} media files</span>{text && <p>{entry.body.slice(0, 220)}</p>}{place && <small>{entry.place}</small>}</div><label>To a close person<input required={circle === 'none'} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Their sign-in email" disabled={circle !== 'none'}/></label><label>Or a circle<Select value={circle} onValueChange={setCircle}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">One person</SelectItem>{circles.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></label><div className="switch-row"><label>Include my written thoughts</label><Switch checked={text} onCheckedChange={setText}/></div><div className="switch-row"><label>Include the place</label><Switch checked={place} onCheckedChange={setPlace}/></div><label>Available for<Select value={days} onValueChange={setDays}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1">1 day</SelectItem><SelectItem value="7">7 days</SelectItem><SelectItem value="30">30 days</SelectItem></SelectContent></Select></label><p className="help-text">Named recipients must sign in and accept the invitation. Accepted circle members can open the postcard immediately. Revoking access cannot undo screenshots or downloads. Decorations, people tags, and other pages are excluded.</p><button className="primary full" disabled={busy}>Share this postcard <ArrowUpRight size={16}/></button></form>; }
function Friends({ session, onSignIn, onOpen }: any) {
    const [circles, setCircles] = useState<any[]>([]), [shares, setShares] = useState<any>({ received: [], sent: [], invitations:[] }), [name, setName] = useState(''), [active, setActive] = useState<any>(null), [email, setEmail] = useState(''), [report, setReport] = useState<any>(null), [reason, setReason] = useState('');
    const load = () => { if (session)
        Promise.all([api('circles'), api('shares')]).then(([a, b]) => { setCircles(a.circles); setShares(b); }).catch(fail); };
    useEffect(load, []);
    return <><div className="page-heading"><div><span className="eyebrow">A SMALLER, SWEETER INTERNET</span><h1>Life is better <em>together.</em></h1><p>A few close people. The bits of life you choose to share.</p></div><Users className="heading-flower"/></div>{!session ? <button className="primary" onClick={onSignIn}>Sign in to share a little</button> : <><div className="friends-layout"><section className="paper-panel"><h2>Your circles</h2><form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try {
        await api('circles', { method: 'POST', body: JSON.stringify({ name }) });
        setName('');
        load();
    }
    catch (error) {
        fail(error);
    } }}><input value={name} onChange={e => setName(e.target.value)} required maxLength={60} placeholder="Our people, college days…"/><button className="round plum" aria-label="Create circle"><Plus size={20}/></button></form>{circles.map(c => <div className="circle-row" key={c.id}><span className="circle-icon"><Users size={20}/></span><div><strong>{c.name}</strong><small>{c.state === 'pending' ? 'An invitation for you' : 'A private little circle'}</small></div>{c.state === 'pending' ? <button className="soft-button" onClick={async () => { await api('circles/' + c.id + '/accept', { method: 'POST' }); load(); }}>Join</button> : <button className="icon-button" aria-label={'Open ' + c.name} onClick={async () => { const r = await api('circles/' + c.id); setActive(r); }}><ChevronRight size={18}/></button>}</div>)}{!circles.length && <p className="help-text">Create a circle, invite someone by their sign-in email, then choose it when sharing a page.</p>}</section><section className="paper-panel lavender-panel"><Flower2 size={35}/><h2>Sharing can be gentle.</h2><p>Your pages start private. Open any page and choose “Share postcard” to send just that moment.</p><p className="help-text">Invitations appear inside Schema. We don’t email your contacts.</p></section></div>{shares.invitations?.map((invite:any)=><div className="sent-row" key={invite.id}><span>A postcard from {invite.sender_name||'a friend'}<small>The page stays hidden until you accept.</small></span><button className="soft-button" onClick={async()=>{try{await api('shares/'+invite.id+'/accept',{method:'POST'});load();}catch(error){fail(error);}}}>Accept postcard</button><button className="text-button" onClick={async()=>{try{await api('shares/'+invite.id+'/decline',{method:'POST'});load();}catch(error){fail(error);}}}>Decline</button></div>)}<div className="section-heading"><h2>Postcards for you</h2><span className="muted">Only from your people</span></div>{shares.received.length ? <div className="memory-grid">{shares.received.map((s: any) => <article className="received" key={s.id}><MemoryCard entry={{ ...s.snapshot, favorite: false }} onOpen={() => onOpen({ ...s.snapshot, shared: true })} onFavorite={() => onOpen({ ...s.snapshot, shared: true })}/><span>From {s.sender_name || 'a friend'}</span><button className="text-button" onClick={() => setReport(s)}>Report or block</button></article>)}</div> : <div className="empty-page small-empty"><FolderHeart /><h3>A little space for your people.</h3><p>Shared postcards will arrive here.</p></div>}<div className="section-heading"><h2>What you’ve shared</h2></div>{shares.sent.map((s: any) => <div className="sent-row" key={s.id}><Share2 size={17}/><span>{s.email || circles.find(c => c.id === s.circle_id)?.name || 'A circle'}<small>{s.state==='pending'?'Awaiting acceptance · ':''}Expires {new Date(s.expires_at).toLocaleDateString()}</small></span><button className="text-button danger" onClick={async () => { try {
        await api('shares/' + s.id, { method: 'DELETE' });
        load();
        toast.success('Access revoked');
    }
    catch (e) {
        fail(e);
    } }}>Revoke</button></div>)}</>}
 <Dialog open={!!active} onOpenChange={o => !o && setActive(null)}><DialogContent><DialogTitle>{active?.circle.name}</DialogTitle><DialogDescription>People in this private circle.</DialogDescription>{active?.members.map((m: any) => <div className="sent-row" key={m.email}><span>{m.email}<small>{m.state}</small></span>{active.circle.owner_id===session?.id&&<button className="text-button danger" onClick={async()=>{try{await api('circles/'+active.circle.id+'/remove',{method:'POST',body:JSON.stringify({email:m.email})});setActive(await api('circles/'+active.circle.id));toast.success('Member removed and their circle postcards revoked');}catch(error){fail(error);}}}>Remove</button>}</div>)}{active?.circle.owner_id === session?.id && <form className="inline-form" onSubmit={async (e) => { e.preventDefault(); try {
        await api('circles/' + active.circle.id + '/invite', { method: 'POST', body: JSON.stringify({ email }) });
        const r = await api('circles/' + active.circle.id);
        setActive(r);
        setEmail('');
    }
    catch (error) {
        fail(error);
    } }}><input type="email" required placeholder="Their sign-in email" value={email} onChange={e => setEmail(e.target.value)}/><button className="primary">Invite</button></form>}<button className="text-button danger" onClick={async () => { try {
        await api('circles/' + active.circle.id, { method: 'DELETE' });
        setActive(null);
        load();
    }
    catch (e) {
        fail(e);
    } }}>{active?.circle.owner_id === session?.id ? 'Delete circle and revoke its postcards' : 'Leave circle'}</button></DialogContent></Dialog>
 <Dialog open={!!report} onOpenChange={o => !o && setReport(null)}><DialogContent><DialogTitle>Report this postcard</DialogTitle><DialogDescription>This also blocks the sender from sharing with you.</DialogDescription><textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="What happened?"/><button className="primary" onClick={async () => { try {
        await api('report', { method: 'POST', body: JSON.stringify({ shareId: report.id, reason, block: true }) });
        setReport(null);
        load();
        toast.success('Report saved and sender blocked');
    }
    catch (e) {
        fail(e);
    } }}>Report and block</button></DialogContent></Dialog></>;
}
function Companion({ data, session, onSettings, onOpen }: any) { const [q, setQ] = useState(''), [mode, setMode] = useState('archive'), [messages, setMessages] = useState<any[]>([]), [busy, setBusy] = useState(false); const send = async (text = q) => { if (!text.trim())
    return; setBusy(true); setQ(''); setMessages(m => [...m, { role: 'you', text }]); try {
    const r = await api('ask', { method: 'POST', body: JSON.stringify({ question: text, mode }) });
    setMessages(m => [...m, { role: 'schema', text: r.answer, sources: r.sources }]);
}
catch (e: any) {
    setMessages(m => [...m, { role: 'schema', text: e.message, error: true }]);
}
finally {
    setBusy(false);
} }; return <><div className="page-heading"><div><span className="eyebrow">A MOMENT WITH YOURSELF</span><h1>Let’s find the <em>threads.</em></h1><p>A thoughtful companion, grounded in the memories you choose.</p></div><Sparkles className="heading-flower"/></div><div className="companion"><div className="companion-top"><Tabs value={mode} onValueChange={setMode}><TabsList><TabsTrigger value="archive">Find a memory</TabsTrigger><TabsTrigger value="reflect">Talk it through</TabsTrigger></TabsList></Tabs><span><Lock size={13}/>Private conversation</span></div>{!data?.profile.ai_consent && <div className="connection-note"><ShieldCheck /><p>Your companion needs your permission before reading pages.</p><button className="text-button" onClick={onSettings}>Open Privacy <ArrowUpRight size={14}/></button></div>}{data?.profile.ai_consent && !data?.capabilities.ai && <div className="connection-note"><Cloud /><p>The AI connection isn’t activated yet. Your saved pages remain searchable in My life.</p></div>}<div className="chat-messages">{!messages.length && <div className="chat-empty"><span className="companion-symbol">✳</span><h2>There’s a story in the little things.</h2><p>What would you like to return to?</p><div className="suggested">{['What have I been quietly proud of?', 'Find my favourite college memories', 'What have I written about home?'].map(s => <button key={s} onClick={() => setQ(s)}>{s}<ArrowUpRight size={15}/></button>)}</div></div>}{messages.map((m, i) => <div className={'message ' + m.role} key={i}><span>{m.role === 'you' ? 'YOU' : 'SCHEMA'}</span><p>{m.text}</p>{m.sources?.map((s: any) => <button className="source-chip" onClick={() => onOpen(s.id)} key={s.id}>[{s.number}] {s.title} · {shortDate(s.date)}</button>)}</div>)}{busy && <div className="message schema"><Loader2 className="spin" size={18}/>Looking through your memories…</div>}</div><form className="chat-input" onSubmit={e => { e.preventDefault(); send(); }}><input value={q} onChange={e => setQ(e.target.value)} placeholder="What’s on your mind?" maxLength={1000} disabled={!session}/><button className="round plum" disabled={busy || !q.trim() || !data?.profile.ai_consent || !data?.capabilities.ai} aria-label="Send"><ArrowUpRight size={20}/></button></form><p className="help-text centered">AI can make mistakes. Open the linked pages to check a memory. Conversations here are temporary.</p></div></>; }
function Account({ data, session, refresh, onSignIn,authMode }: any) {
    const [form, setForm] = useState<any>(null), [media, setMedia] = useState<any[]>([]), [deleting, setDeleting] = useState(false), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [period, setPeriod] = useState('yearly');
    useEffect(() => { if (data?.profile.status === 'deleting') {
        setDeleting(true);
        setConfirm('DELETE');
    } if (data)
        setForm({ name: data.profile.name, theme: data.profile.theme, birthday: data.profile.birthday ?? '', aiConsent: !!data.profile.ai_consent, quiet: !!data.profile.quiet, onboarded: !!data.profile.onboarded,preferencesVersion:data.profile.preferences_version,textSize:data.profile.text_size,questionMode:data.profile.question_mode }); }, [data]);
    const save = async () => { try {
        await api('profile', { method: 'PATCH', body: JSON.stringify(form) });
        refresh();
        toast.success('Your preferences are saved');
    }
    catch (e) {
        fail(e);
    } };
    const checkout = async () => { setBusy(true); try {
        const r = await api('billing/checkout', { method: 'POST', body: JSON.stringify({ period }) });
        if (!(window as any).Razorpay)
            await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js'; script.onload = resolve; script.onerror = reject; document.body.appendChild(script); });
        new (window as any).Razorpay({ key: r.key, subscription_id: r.subscriptionId, name: 'Schema', description: 'Your life, kept close', prefill: { email: r.email }, handler: () => { toast.success('Payment received. Your plan updates after verification.'); refresh(); }, theme: { color: '#694454' } }).open();
    }
    catch (e) {
        fail(e);
    }
    finally {
        setBusy(false);
    } };
    if (!session)
        return <div className="empty-page"><Lock /><h1>Your own little corner.</h1><p>Sign in to keep your journal safe across devices.</p><button className="primary" onClick={onSignIn}>Sign in with ChatGPT <ArrowUpRight size={16}/></button></div>;
    if (!form)
        return <CardsSkeleton />;
    return <><div className="page-heading"><div><span className="eyebrow">MADE TO FEEL LIKE YOU</span><h1>Your little <em>corner.</em></h1><p>Make yourself at home. Keep control of your story.</p></div></div><Tabs defaultValue="journal"><TabsList className="account-tabs"><TabsTrigger value="journal">Journal</TabsTrigger><TabsTrigger value="privacy">Privacy</TabsTrigger><TabsTrigger value="storage">Storage</TabsTrigger><TabsTrigger value="plan">My plan</TabsTrigger><TabsTrigger value="help">Help</TabsTrigger></TabsList><TabsContent value="journal"><div className="settings-panel"><h2>The personal bits</h2><label>Your name<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} maxLength={80}/></label><label>Birthday <span className="muted">optional</span><input type="date" value={form.birthday} onChange={e => setForm({ ...form, birthday: e.target.value })}/></label><label>Journal theme<Select value={form.theme} onValueChange={v => setForm({ ...form, theme: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="rose">Rose Notebook</SelectItem><SelectItem value="lavender">Lavender Night</SelectItem><SelectItem value="vintage">Vintage Postcards</SelectItem></SelectContent></Select></label><div className="switch-row"><label>Quiet mode<small>Less decoration and motion.</small></label><Switch checked={form.quiet} onCheckedChange={v => setForm({ ...form, quiet: v })}/></div><label>Text size<Select value={form.textSize} onValueChange={v=>setForm({...form,textSize:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="standard">Standard</SelectItem><SelectItem value="large">Larger text</SelectItem></SelectContent></Select></label><div className="switch-row"><label htmlFor="gentle-questions">Gentle questions<small>Show an optional nudge on Today.</small></label><Switch id="gentle-questions" checked={form.questionMode!=='off'} onCheckedChange={v=>setForm({...form,questionMode:v?'gentle':'off'})}/></div><button className="primary" onClick={save}>Save preferences <Check size={16}/></button></div></TabsContent><TabsContent value="privacy"><div className="settings-panel"><h2>Your story belongs to you.</h2><p>Pages are private by default. Sharing creates a separate postcard for your chosen audience.</p><PrivacyChoices refresh={refresh}/><hr/>{authMode==='customer'&&<AccountSecurity/>}<DeviceLockSettings owner={session.id}/><hr /><ExportPanel key={session.id}/><hr /><h3>Drafts on this device</h3><p>Drafts are encrypted in this browser. Add a device passphrase above for a separate lock, or clear drafts before sharing this device.</p><DangerAction title="Clear unfinished pages from this device?" description="Unsaved text, photos, and recordings will be removed from this browser. Pages already saved to your journal are kept." confirmLabel="Clear drafts" onConfirm={async()=>{await clearDrafts(session.id);toast.success('Local drafts cleared');}}>Clear local drafts</DangerAction><hr/><h3>Close this journal</h3><p>Delete all your pages, media, and sharing access. This cannot be undone. Provider backups follow their retention policy.</p><button className="text-button danger" onClick={() => setDeleting(true)}>Delete my account</button></div></TabsContent><TabsContent value="storage"><StoragePanel data={data} refresh={refresh}/></TabsContent><TabsContent value="plan"><div className="plans"><div className="plan-card"><span className="eyebrow">YOUR CURRENT PLAN</span><h2>{data.profile.plan === 'free' ? 'Schema Free' : 'Schema Plus'}</h2><strong>{data.profile.plan==='free'?'₹0':'Plus'} <small>{data.profile.plan==='free'?'/ free plan':'/ paid access'}</small></strong><p>{data.allowance.bytes/1024**3} GB media · Unlimited text pages<br />{data.capabilities.ai?data.allowance.ai+' AI questions per month':'AI opens in a later phase'}<br />{authMode==='customer'?'Sharing opens in a later phase':data.allowance.circles+' private '+(data.allowance.circles===1?'circle':'circles')}</p><span className="status-label"><Check size={15}/>Your journal is open</span></div><div className="plan-card plus-plan"><span className="eyebrow">A LITTLE MORE ROOM</span><h2>Schema Plus</h2><strong>{period === 'yearly' ? '₹799' : '₹99'} <small>/{period === 'yearly' ? 'year' : 'month'}</small></strong><p>25 GB media · 150 AI questions monthly<br />Five circles · All journal themes<br />Your entire archive stays yours</p><Tabs value={period} onValueChange={setPeriod}><TabsList><TabsTrigger value="yearly">Yearly</TabsTrigger><TabsTrigger value="monthly">Monthly</TabsTrigger></TabsList></Tabs><button className="primary full" onClick={checkout} disabled={!data.capabilities.billing || busy}>{data.capabilities.billing ? 'Continue to checkout' : 'Subscriptions opening soon'}<ArrowUpRight size={17}/></button><p className="help-text">Annual billing is prepaid. Pricing and entitlements are subject to launch validation.</p></div></div>{authMode!=='customer'&&<BillingManager refresh={refresh}/>}</TabsContent><TabsContent value="help"><div className="settings-panel"><h2>A few things to know</h2><h3>Who can see my diary?</h3><p>Only your signed-in account. A shared postcard is available to the named person after they accept, or to accepted circle members until you revoke it or it expires.</p><h3>Where are my drafts?</h3><p>Unfinished work is kept temporarily on this device. Keep the tab open while recording. Press Save page again when your connection returns.</p><h3>What does the companion remember?</h3><p>It searches permitted pages for each question. It does not know things you haven’t documented, and conversations are not permanently saved.</p><h3>Is this a finished public service?</h3><p>This private release is undergoing launch validation. Payment, AI, consumer sign-in, support operations, and scale certification must be activated and verified before commercial launch.</p><h3>Need urgent support?</h3><p>Schema is a journal, not a crisis service. If you are in immediate danger, contact local emergency services or a trusted person.</p><a className="text-button" href={authMode==='customer'?'/auth/logout':'/signout-with-chatgpt?return_to=%2F'} target="_top"><LogOut size={16}/>Sign out</a></div></TabsContent></Tabs>
 <AlertDialog open={deleting} onOpenChange={setDeleting}><AlertDialogContent><AlertDialogTitle>Permanently delete your journal?</AlertDialogTitle><AlertDialogDescription>All pages, uploaded media, and shared access will be removed. Export your memories first. Type DELETE to continue.</AlertDialogDescription><input value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="DELETE"/><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep my journal</AlertDialogCancel><button className="primary danger-bg" disabled={confirm !== 'DELETE' || busy} onClick={async () => { setBusy(true); try {
        const r = await api('account', { method: 'DELETE', body: JSON.stringify({ confirm }) });
        await clearDrafts(session.id);
        if(r.remaining){setDeleting(false);await refresh();}else location.href=authMode==='customer'?'/auth/logout':'/signout-with-chatgpt?return_to=%2F';
    }
    catch (e) {
        fail(e);setDeleting(false);await refresh();
    } finally {setBusy(false);} }}>{busy ? 'Deleting…' : 'Delete everything'}</button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
