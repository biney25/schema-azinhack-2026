import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
const mode=process.argv[2];if(!['sites','customer'].includes(mode))throw new Error('Select the intended hosting target.');
const root=mode==='sites'?'dist/server':'.next/server',other=mode==='sites'?'customer':'sites';
const markers={sites:[],customer:[]};
function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())visit(p);else if(e.name.endsWith('.js')){const s=readFileSync(p,'utf8');for(const name of Object.keys(markers))if(new RegExp('mode:\\s*[`"\\\']'+name+'[`"\\\']').test(s))markers[name].push(p);}}}
visit(root);
if(!markers[mode].length||markers[other].length)throw new Error('Build selected the wrong account implementation. Publication stopped.');
console.log('Verified hosting identity boundary:',mode);
