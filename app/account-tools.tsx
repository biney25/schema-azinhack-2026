'use client';
import { useEffect, useState } from 'react';
import { Download, Loader2, Music, RefreshCw, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { api, listDrafts, removeDraft } from '@/lib/client';
import { toast } from 'sonner';

export function DangerAction({ children, title, description, confirmLabel, onConfirm }: { children: React.ReactNode; title: string; description: string; confirmLabel: string; onConfirm: () => Promise<unknown> }) {
    const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
    return <><button className="text-button danger" onClick={() => setOpen(true)}>{children}</button><AlertDialog open={open} onOpenChange={value => !busy && setOpen(value)}><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel><button className="primary danger-bg" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); setOpen(false); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } }}>{busy ? 'Please wait…' : confirmLabel}</button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}

export function DraftsButton({ owner, onOpen }: { owner: string; onOpen: (draft: any) => void }) {
    const [open, setOpen] = useState(false), [drafts, setDrafts] = useState<any[]>([]);
    useEffect(() => { if (open) listDrafts(owner).then(setDrafts).catch(e => toast.error(e.message)); }, [open, owner]);
    return <><button className="soft-button" onClick={() => setOpen(true)}>Unfinished pages</button>
        <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Your unfinished pages</DialogTitle><DialogDescription>Drafts on this device. They are saved separately from your journal.</DialogDescription>
            {drafts.length ? drafts.map(d => <div className="sent-row" key={d.id}><button className="text-button" onClick={() => { setOpen(false); onOpen(d); }}>{d.title || 'Untitled page'}<small>{d.date}</small></button><span className="muted">{d.pending?.length ?? 0} waiting uploads</span></div>) : <p>No unfinished pages on this device.</p>}
        </DialogContent></Dialog></>;
}

export function StoragePanel({ data, refresh }: any) {
    const [files, setFiles] = useState<any[]>([]), [next, setNext] = useState<string | null>(null), [unused, setUnused] = useState(false), [busy, setBusy] = useState(false), [selected, setSelected] = useState<any>(null), [error, setError] = useState('');
    async function load(after = '') {
        setBusy(true); setError('');
        try { const result = await api('media?' + new URLSearchParams({ after, unused: unused ? '1' : '0' })); setFiles(old => after ? [...old, ...result.assets] : result.assets); setNext(result.next); }
        catch (e: any) { setError(e.message); }
        finally { setBusy(false); }
    }
    useEffect(() => { load(); }, [unused]);
    return <div className="settings-panel"><h2>Space for the little things</h2><p>{((data.profile.storage_bytes ?? 0) / 1024 ** 2).toFixed(1)} MB used of {data.allowance.bytes / 1024 ** 3} GB</p><Progress value={Math.min(100, data.profile.storage_bytes / data.allowance.bytes * 100)} />
        <p className="help-text">Photos are optimized on upload. Removing a page keeps its photos here until you choose to delete them.</p>
        <div className="switch-row"><label htmlFor="unused-media">Show files without a page</label><Switch id="unused-media" checked={unused} onCheckedChange={setUnused} /></div>
        {error && <p role="alert">{error} <button className="text-button" onClick={() => load()}>Try again</button></p>}
        {files.map(a => <div className="storage-item" key={a.id}>
            {a.state === 'ready' && a.type.startsWith('image') ? <img src={'/api/assets/' + a.id} alt="" loading="lazy" /> : <Music size={25} />}
            <span>{a.name}<small>{(a.size / 1024 ** 2).toFixed(2)} MB · {a.state !== 'ready' ? a.state : a.page_count ? `${a.page_count} linked pages` : 'No linked pages'}</small></span>
            {a.state === 'ready' && <a className="icon-button" href={'/api/assets/' + a.id} download={a.name} aria-label={'Download ' + a.name}><Download size={17} /></a>}
            <button className="icon-button" disabled={!!a.page_count || busy} aria-label={'Delete ' + a.name} onClick={() => setSelected(a)}><Trash2 size={17} /></button>
        </div>)}
        {!busy && !files.length && !error && <p>No {unused ? 'unused ' : ''}files here.</p>}
        {busy && <p role="status">Loading storage…</p>}
        {next && <button className="soft-button" disabled={busy} onClick={() => load(next)}>More files</button>}
        <p className="help-text">Remove files from their linked pages before deleting them. Interrupted uploads can be cleared after 15 minutes.</p>
        <AlertDialog open={!!selected} onOpenChange={open => !busy && !open && setSelected(null)}><AlertDialogContent><AlertDialogTitle>Delete this file?</AlertDialogTitle><AlertDialogDescription>This permanently removes {selected?.name} and revokes any postcards containing it. A local draft may still refer to this file.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep file</AlertDialogCancel><button className="primary danger-bg" disabled={busy} onClick={async () => {
            setBusy(true);
            try { await api('assets/' + selected.id, { method: 'DELETE' }); setFiles(old => old.filter(f => f.id !== selected.id)); setSelected(null); refresh(); toast.success('File deleted'); }
            catch (e: any) { toast.error(e.message); }
            finally { setBusy(false); }
        }}>Delete file</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>;
}

export function BillingManager({ refresh }: { refresh: () => void }) {
    const [data, setData] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [cancel, setCancel] = useState<any>(null), [invoices, setInvoices] = useState<any>(null);
    const load = () => api('billing/status').then(result => { setData(result); setError(''); }).catch(e => setError(e.message));
    useEffect(() => { load(); }, []);
    async function act(action: string, id: string, confirm?: string) {
        setBusy(true);
        try { await api('billing/' + action, { method: 'POST', body: JSON.stringify({ id, confirm }) }); await load(); refresh(); return true; }
        catch (e: any) { toast.error(e.message); return false; }
        finally { setBusy(false); }
    }
    async function receipts(id: string, skip = 0) {
        setBusy(true);
        try { const result = await api('billing/invoices', { method: 'POST', body: JSON.stringify({ id, skip }) }); setInvoices((old: any) => ({ ...result, id, skip, invoices: skip ? [...old.invoices, ...result.invoices] : result.invoices })); }
        catch (e: any) { toast.error(e.message); }
        finally { setBusy(false); }
    }
    return <section className="settings-panel"><h2>Manage billing</h2>{error && <p role="alert">{error} <button className="text-button" onClick={load}>Try again</button></p>}
        {data?.needsReconciliation && <p role="status">A checkout is awaiting verification. Do not start another payment; billing support must reconcile it first.</p>}
        {data?.subscriptions.length === 0 && <p>No subscriptions yet.</p>}
        {data?.subscriptions.map((s: any) => <article className="billing-record" key={s.id}><div><h3>Schema Plus · {s.period === 'yearly' ? 'Yearly' : 'Monthly'}</h3><p>{s.state}{s.paid_until && ` · Paid access through ${new Date(s.paid_until).toLocaleDateString('en-IN')}`}</p></div><div className="billing-actions">
            <button className="soft-button" disabled={busy} onClick={() => act('refresh', s.id)}><RefreshCw size={15} />Refresh status</button>
            <button className="soft-button" disabled={busy} onClick={() => receipts(s.id)}><Download size={15} />Invoices</button>
            {!['cancelled', 'completed', 'expired'].includes(s.state) && <button className="text-button danger" disabled={busy} onClick={() => setCancel(s)}>Cancel renewal</button>}
        </div></article>)}
        {busy && <Loader2 className="spin" size={20} aria-label="Updating billing" />}
        <AlertDialog open={!!cancel} onOpenChange={open => !busy && !open && setCancel(null)}><AlertDialogContent><AlertDialogTitle>Stop future renewals?</AlertDialogTitle><AlertDialogDescription>We will cancel the recurring mandate. Any verified paid access continues through its paid period. Your existing pages stay readable. Cancellation does not issue a refund.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep subscription</AlertDialogCancel><button className="primary danger-bg" disabled={busy} onClick={async () => { if (await act('cancel', cancel.id, 'CANCEL')) { setCancel(null); toast.success('Renewal cancelled'); } }}>Cancel renewal</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
        <Dialog open={!!invoices} onOpenChange={open => !open && setInvoices(null)}><DialogContent><DialogTitle>Subscription invoices</DialogTitle><DialogDescription>Invoices supplied by the payment provider.</DialogDescription>{invoices?.invoices.map((invoice: any) => <div className="sent-row" key={invoice.id}><span>{invoice.id}<small>{invoice.currency} {(invoice.amount / 100).toFixed(2)} · {invoice.status}</small></span>{invoice.url && <a className="text-button" href={invoice.url} target="_blank" rel="noopener noreferrer">Open invoice</a>}</div>)}{invoices && !invoices.invoices.length && <p>No invoices yet.</p>}{invoices?.hasMore && <button className="soft-button" disabled={busy} onClick={() => receipts(invoices.id, invoices.skip + 20)}>More invoices</button>}</DialogContent></Dialog>
    </section>;
}
