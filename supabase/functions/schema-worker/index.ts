import {createClient} from 'npm:@supabase/supabase-js@2.117.0';
import {runWorker} from './handler.mjs';
// Custom authentication: the DB atomically consumes a single-use 90-second
// dispatch token before any work. No owner or job ID is accepted from a request.
Deno.serve((req:Request)=>runWorker(req,createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}})));
