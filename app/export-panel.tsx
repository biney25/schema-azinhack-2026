'use client';
import { useEffect, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

type ExportProgress = { label: string; files: number; pages: number; totalFiles: number; totalPages: number; phase: string };
type SaveWindow = Window & { showSaveFilePicker?: (options: unknown) => Promise<{ createWritable: () => Promise<WritableStream<Uint8Array>> }> };

export function ExportPanel() {
    const [busy, setBusy] = useState(false), [progress, setProgress] = useState<ExportProgress | null>(null), [message, setMessage] = useState(''), [error, setError] = useState('');
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (!busy) return;
        const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [busy]);
    async function download(includeMedia: boolean) {
        if (controller.current) return;
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setMessage(''); setError(''); setProgress(null);
        let destination: WritableStream<Uint8Array> | undefined;
        const filename = `schema-${includeMedia ? 'journal' : 'pages-only'}-${new Date().toISOString().slice(0,10)}.zip`;
        try {
            // The picker must run in the click's user-activation window, before imports/network work.
            const saveWindow = window as SaveWindow;
            if (saveWindow.showSaveFilePicker) {
                try {
                    const handle = await saveWindow.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Journal ZIP', accept: { 'application/zip': ['.zip'] } }] });
                    abort.signal.throwIfAborted();
                    destination = await handle.createWritable();
                } catch (e: unknown) {
                    // Embedded browsers may expose the API while disallowing the picker.
                    // The bounded ordinary download needs no file-system access.
                    if (!(e instanceof DOMException) || e.name !== 'SecurityError') throw e;
                }
            }
            const { buildJournalArchive } = await import('@/lib/journal-export.mjs');
            const result = await buildJournalArchive({ destination, includeMedia, signal: abort.signal, onProgress: (p: ExportProgress) => setProgress(p) });
            if (result.blob) {
                const url = URL.createObjectURL(result.blob), link = document.createElement('a');
                link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
                // Let the browser consume the URL before releasing its backing Blob.
                setTimeout(() => URL.revokeObjectURL(url), 60000);
            }
            setMessage(`${destination ? 'Journal saved.' : 'Download prepared. Check your browser’s downloads.'} Extract the ZIP and open index.html.${result.manifest.unfinishedFiles ? ` ${result.manifest.unfinishedFiles} unfinished files are listed but not included; finish or clear those uploads in Storage, then download again.` : ''}`);
        } catch (e: unknown) {
            try { await destination?.abort(); } catch { /* exporter already aborted */ }
            if (abort.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) setMessage('Download cancelled. You can start again whenever you like.');
            else setError(e instanceof Error ? e.message : 'The download could not finish. Please try again.');
        } finally { controller.current = null; setBusy(false); setProgress(null); }
    }
    const percent = progress ? Math.min(99, (progress.files + progress.pages) / Math.max(1, progress.totalFiles + progress.totalPages) * 100) : 0;
    return <section aria-labelledby="export-title" className="export-panel">
        <h3 id="export-title">Take your memories with you</h3>
        <p>A readable journal, your saved photos and voice recordings, and your page data—all in one ZIP. Includes files in Storage that aren’t attached to a page.</p>
        <div className="billing-actions"><button className="soft-button" onClick={() => download(true)} disabled={busy}><Download size={16}/>Download journal ZIP</button><button className="text-button" onClick={() => download(false)} disabled={busy}>Pages only (no media)</button></div>
        {busy && <div className="export-progress"><p role="status"><Loader2 size={16} className="spin"/>{progress?.label || 'Preparing your download…'}</p><Progress value={percent} aria-label="Journal download progress"/><button className="text-button" onClick={() => controller.current?.abort()}>Cancel download</button></div>}
        {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
        <p className="help-text">Keep this tab open and avoid editing your journal until it finishes. Unsaved drafts and other people’s postcards aren’t included. Photos are the optimized copies saved in Schema. The downloaded file is not encrypted—keep it somewhere private.</p>
        <p className="help-text">Large journals save directly to disk where supported. Other browsers are limited to 100 MB per download; pages-only downloads keep all text and layout data.</p>
    </section>;
}
