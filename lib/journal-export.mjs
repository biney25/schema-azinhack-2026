import { ZipWriter, TextReader, BlobReader } from '@zip.js/zip.js';

export const BROWSER_EXPORT_LIMIT = 100 * 1024 ** 2;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const safeId = id => { if (!uuid.test(id)) throw new Error('A journal record has an invalid identifier.'); return id; };
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const stylesheet = `:root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#f6efe8;color:#342c32;font:17px/1.7 system-ui,sans-serif}main{max-width:850px;margin:40px auto;padding:clamp(22px,5vw,58px);background:#fffdf7;border:1px solid #dbc9c1;box-shadow:0 8px 30px #493b3010}h1,h2{font-family:Georgia,serif;line-height:1.2;overflow-wrap:anywhere}h1{font-size:clamp(30px,5vw,48px)}a{color:#783c59;text-underline-offset:4px}header,footer{margin:24px 0}.meta{color:#655661}.story{white-space:pre-wrap;overflow-wrap:anywhere}.photos{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:22px}figure{margin:10px 0;padding:12px;background:white;border:1px solid #e4d8ce}img{display:block;width:100%;height:auto}figcaption{font-size:14px;overflow-wrap:anywhere}audio{width:100%;max-width:100%}li{margin:12px 0;overflow-wrap:anywhere}.notes{border-top:1px dashed #c9acb5;padding-top:16px}.tag{display:inline-block;background:#f4e4ea;border-radius:9px;padding:2px 10px;margin:3px}.lavender{background:#f5f0fb}.vintage{background:#f5edd9}@media print{body{background:white}main{border:0;box-shadow:none;margin:0;padding:0}nav{display:none}figure{break-inside:avoid}a{color:inherit}}`;
function html(title, contents, root = '..', theme = '') {
    const safeTheme = ['rose','lavender','vintage'].includes(theme) ? theme : '';
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' file:; media-src 'self' file:; style-src 'self' file:; base-uri 'none'; form-action 'none'"><title>${escape(title)} · Schema</title><link rel="stylesheet" href="${root}/journal.css"></head><body><main class="${safeTheme}">${contents}</main></body></html>`;
}
function pageHtml(entry, media, part) {
    const attachments = entry.assets.map(id => {
        const asset = media.get(id);
        if (!asset) throw new Error('A page refers to a missing photo or recording. Please check Storage.');
        if (!asset.path) return `<p class="meta">${escape(asset.name)} — media file not included in this pages-only download.</p>`;
        const src = '../' + asset.path;
        return asset.type.startsWith('image/') ? `<figure><a href="${src}"><img src="${src}" alt="${escape(asset.name)}" loading="lazy"></a><figcaption>${escape(asset.name)}</figcaption></figure>` : `<figure><audio controls preload="none" src="${src}"></audio><figcaption><a href="${src}">${escape(asset.name)}</a></figcaption></figure>`;
    }).join('');
    const notes = entry.blocks?.length ? `<section class="notes"><h2>Page notes</h2>${entry.blocks.map(b => `<p class="story">${escape(b.text)}</p>`).join('')}</section>` : '';
    return html(entry.title, `<nav><a href="../index.html">My journal</a> · <a href="../browse/${part}.html">Pages in this chapter</a></nav><header><p class="meta">${escape(entry.date)}${entry.mood ? ' · '+escape(entry.mood) : ''}${entry.favorite ? ' · Favourite' : ''}</p><h1>${escape(entry.title)}</h1></header><p class="story">${escape(entry.body)}</p><section class="photos">${attachments}</section>${entry.place ? `<p>Place: ${escape(entry.place)}</p>` : ''}${entry.people?.length ? `<p>With: ${entry.people.map(escape).join(', ')}</p>` : ''}<p>${(entry.tags ?? []).map(t => `<span class="tag">${escape(t)}</span>`).join('')}</p>${notes}<footer class="meta">A saved Schema page. Original layout positions are preserved in the JSON files.</footer>`, '..', entry.theme);
}
function progressText(p) { return p.phase === 'media' ? `Packing photos & recordings · ${p.files} of ${p.totalFiles}` : p.phase === 'pages' ? `Packing journal pages · ${p.pages} of ${p.totalPages}` : 'Checking your download…'; }

/** Stream ZIP bytes to a supplied writable, or return a bounded Blob. No output is
 * committed until all pages/media and a final journal revision have been checked.
 * Requests are injected only for deterministic integration tests.
 * @param {{destination?: WritableStream<Uint8Array>, signal?: AbortSignal, onProgress?: (progress: {label:string,files:number,pages:number,totalFiles:number,totalPages:number,phase:string,bytes:number})=>void, request?: typeof fetch, includeMedia?: boolean, maxBytes?: number}} options
 */
export async function buildJournalArchive({ destination, signal = new AbortController().signal, onProgress = () => {}, request = fetch, includeMedia = true, maxBytes = destination ? Infinity : BROWSER_EXPORT_LIMIT } = {}) {
    let sink, zip, written = 0;
    const chunks = [];
    const check = () => signal.throwIfAborted();
    async function response(path) {
        check();
        const result = await request('/api/' + path, { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]) });
        if (!result.ok) {
            let message = `Your download could not finish (${result.status}). Please try again.`;
            try { message = (await result.json()).error || message; } catch { /* non-JSON proxy errors */ }
            throw new Error(message);
        }
        return result;
    }
    const json = async path => (await response(path)).json();
    try {
        // Acquire before network work so every failure also aborts an open file.
        sink = destination?.getWriter();
        const summary = await json('export/summary');
        const estimate = summary.estimatedBytes - (includeMedia ? 0 : summary.bytes);
        if (estimate > maxBytes) throw new Error('This journal is too large for an in-memory download. Use a browser with direct-to-disk saving, or choose pages only and download individual files from Storage.');
        const query = new URLSearchParams({ exportRevision: summary.revision });
        const state = { phase: 'media', files: 0, pages: 0, totalFiles: includeMedia ? summary.files : 0, totalPages: summary.pages, bytes: 0 };
        const report = () => onProgress({ ...state, label: progressText(state) });
        const stream = new WritableStream({
            async write(chunk) {
                check();
                written += chunk.byteLength;
                if (written > maxBytes) throw new Error('The download exceeded this browser’s memory limit. Use direct-to-disk saving.');
                if (sink) await sink.write(chunk); else chunks.push(chunk.slice());
            }
        });
        zip = new ZipWriter(stream, { level: 0, useWebWorkers: false, useCompressionStream: false, bufferedWrite: false, preventClose: true });
        const add = async (path, text) => { check(); await zip.add(path, new TextReader(text), { signal }); };
        const media = new Map(), mediaParts = [], pageParts = [], chapters = [];
        let after = '', index = 0, readyCount = 0, unfinishedCount = 0;
        report();
        do {
            const result = await json('export/media?' + query + '&after=' + encodeURIComponent(after));
            const inventory = [];
            for (const item of result.assets) {
                safeId(item.id);
                if (media.has(item.id)) throw new Error('A duplicate media record interrupted the download.');
                const record = { ...item, path: null, sha256: null };
                if (item.state === 'ready') {
                    readyCount++;
                    if (includeMedia) {
                        const ext = extensions[item.type];
                        if (!ext) throw new Error('A stored file has an unsupported format.');
                        const r = await response('assets/' + item.id + '?' + query);
                        if ((r.headers.get('content-type') ?? '').split(';')[0] !== item.type) throw new Error('A media file has an unexpected format. Download stopped.');
                        const blob = await r.blob();
                        if (blob.size !== item.size) throw new Error('A photo or recording was incomplete. Please try the download again.');
                        record.path = `media/${item.id}.${ext}`;
                        const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
                        record.sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
                        await zip.add(record.path, new BlobReader(blob), { signal });
                        state.files++; state.bytes += blob.size; report();
                    }
                } else unfinishedCount++;
                media.set(item.id, record);
                inventory.push(record);
            }
            const path = `data/media-${String(++index).padStart(4,'0')}.json`;
            await add(path, JSON.stringify(inventory, null, 2)); mediaParts.push(path);
            if (result.next && result.next <= after) throw new Error('The media cursor did not advance.');
            after = result.next ?? '';
        } while (after);
        index = 0; state.phase = 'pages'; report();
        do {
            const result = await json('export?' + query + '&after=' + encodeURIComponent(after));
            const part = `pages-${String(++index).padStart(4,'0')}`;
            const path = `data/${part}.json`;
            await add(path, JSON.stringify(result.entries, null, 2)); pageParts.push(path);
            const links = [];
            for (const entry of result.entries) {
                safeId(entry.id);
                await add(`pages/${entry.id}.html`, pageHtml(entry, media, part));
                links.push(`<li><a href="../pages/${entry.id}.html">${escape(entry.title)}</a><br><span class="meta">${escape(entry.date)}</span></li>`);
                state.pages++; report();
            }
            await add(`browse/${part}.html`, html(`Chapter ${index}`, `<nav><a href="../index.html">My journal</a></nav><h1>Chapter ${index}</h1><p class="meta">Archive order; each page keeps its original date.</p><ul>${links.join('')}</ul>`));
            chapters.push({ path:`browse/${part}.html`, pages:result.entries.length });
            if (result.next && result.next <= after) throw new Error('The journal cursor did not advance.');
            after = result.next ?? '';
        } while (after);
        state.phase = 'checking'; report();
        if (state.pages !== summary.pages || readyCount !== summary.files || unfinishedCount !== summary.unfinished || (includeMedia && state.bytes !== summary.bytes)) throw new Error('The archive did not include every expected record. Please start a fresh download.');
        const finalSummary = await json('export/summary?' + query);
        if (finalSummary.revision !== summary.revision) throw new Error('Your journal changed during the download. Please start a fresh download.');
        const manifest = { format: 'schema-portable-v2', exportedAt: new Date().toISOString(), revision:summary.revision, profile:summary.profile, pages:state.pages, storedFiles:readyCount, includedFiles:state.files, includedBytes:state.bytes, unfinishedFiles:unfinishedCount, includeMedia, pageParts, mediaParts };
        await add('manifest.json', JSON.stringify(manifest, null, 2));
        await add('journal.css', stylesheet);
        await add('README.txt', `SCHEMA PORTABLE JOURNAL\n\nExtract this ZIP, then open index.html in your browser. Photos and audio use local files. No account or internet is needed. Keep the folders together. If a browser blocks local media, open the file directly from the media folder.\n\n${includeMedia ? 'All ready media saved in your Schema account is included, including files without a page.' : 'PAGES ONLY: Photo and audio bytes are not included. Download them separately from Storage.'}\n${unfinishedCount} unfinished uploads/deletions are recorded in the media inventory, without file bytes. Unsaved browser drafts, temporary chats and other people’s postcards are not part of your saved journal.\n\nThe exported photos are the optimized copies stored by Schema, not pre-upload originals. HTML offers a readable layout; full text, dates, tags, preferences and original layout metadata remain in the JSON files.\n\nmanifest.json lists every data part. data/media-*.json maps IDs to paths, original file names, MIME types, byte counts and SHA-256 checksums for included files. This format is for portability; Schema does not yet offer ZIP re-import.\n\nThis download is not encrypted. Anyone with the file can read it. Store it somewhere private.\n`);
        await add('index.html', html(`${summary.profile.name || 'My'} journal`, `<header><p class="meta">SCHEMA · YOUR PERSONAL ARCHIVE</p><h1>${escape(summary.profile.name || 'My')} journal</h1><p>${state.pages} pages · ${state.files} included photos &amp; recordings</p><p class="meta">Saved ${escape(manifest.exportedAt.slice(0,10))}</p></header>${!includeMedia ? '<p>Pages-only download. Photos and recordings are listed but their files are not included.</p>' : ''}${unfinishedCount ? `<p>${unfinishedCount} unfinished uploads or deletions are listed in the inventory without media files.</p>` : ''}<h2>Open a chapter</h2><ol>${chapters.map((c,i)=>`<li><a href="${c.path}">Chapter ${i+1}</a> · ${c.pages} pages</li>`).join('')}</ol><footer><a href="README.txt">About this download</a> · <a href="manifest.json">Archive details</a></footer>`, '.', summary.profile.theme));
        check(); await zip.close(); check();
        // File System Access commits its temporary output here, after verification.
        if (sink) await sink.close();
        return { blob: destination ? null : new Blob(chunks, { type: 'application/zip' }), manifest, written };
    } catch (error) {
        try { await sink?.abort(error); } catch { /* already aborted by the browser */ }
        throw error;
    } finally { sink?.releaseLock(); }
}
