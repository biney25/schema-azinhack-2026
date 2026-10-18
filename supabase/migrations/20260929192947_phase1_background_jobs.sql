-- The machine API is service-role only. Customer JWTs never claim jobs or select owners.
create table schema_private.dispatch_tokens(hash text primary key,expires_at timestamptz not null);
create table schema_private.worker_runs(id uuid primary key default gen_random_uuid(),started_at timestamptz not null default now(),finished_at timestamptz,processed integer not null default 0,failed integer not null default 0);
create table schema_private.runtime_config(id boolean primary key default true check(id),worker_url text not null check(worker_url ~ '^https://[a-z]+\.supabase\.co/functions/v1/schema-worker$'));
alter table schema_private.dispatch_tokens enable row level security;
alter table schema_private.worker_runs enable row level security;
alter table schema_private.runtime_config enable row level security;
revoke all on all tables in schema schema_private from public,anon,authenticated;

create function schema_private.worker(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare j public.schema_jobs; p public.schema_profiles; ids uuid[]; aid uuid; rid uuid; total bigint; items jsonb; candidate record;
 begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise sqlstate 'PT403' using message='Worker credential required.';end if;
 if action='authorize' then
 if coalesce(payload->>'token','') !~ '^[0-9a-f]{64}$' then raise sqlstate 'PT401' using message='Invalid dispatch.';end if;
 delete from schema_private.dispatch_tokens where hash=encode(sha256(convert_to(payload->>'token','UTF8')),'hex') and expires_at>now();
 if not found then raise sqlstate 'PT401' using message='Invalid dispatch.';end if;
 insert into schema_private.worker_runs default values returning id into rid;return jsonb_build_object('runId',rid);
 elsif action='claim' then
 -- Five errors/expired leases are terminal; successful batches do not consume retries.
 update public.schema_jobs set state='failed',error_code='lease_exhausted',lease_token=null,lease_until=null,updated_at=now()where state='running' and lease_until<now() and attempts>=5;
 with candidate as(select id from public.schema_jobs where ((state='pending' and available_at<=now())or(state='running' and lease_until<now()))and attempts<5 order by available_at,id for update skip locked limit 1)
 update public.schema_jobs set state='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',updated_at=now()where id in(select id from candidate)returning * into j;
 if not found then return 'null'::jsonb;end if;return to_jsonb(j);
 elsif action='run.finish' then
 update schema_private.worker_runs set finished_at=now(),processed=least(10,greatest(0,(payload->>'processed')::integer)),failed=least(10,greatest(0,(payload->>'failed')::integer))where id=(payload->>'runId')::uuid and finished_at is null;
 return jsonb_build_object('ok',true);
 end if;
 select * into j from public.schema_jobs where id=(payload->>'jobId')::uuid;
 if not found then raise sqlstate 'PT409' using message='Lease lost.';end if;
 select * into p from public.schema_profiles where id=j.owner_id for update;
 select * into j from public.schema_jobs where id=j.id for update;
 if j.state<>'running' or j.lease_token is distinct from (payload->>'leaseToken')::uuid or j.lease_until<=now()then raise sqlstate 'PT409' using message='Lease lost.';end if;
 if j.kind not in ('account_erasure','asset_erasure')then raise sqlstate 'PT400' using message='Unknown handler.';end if;
 if j.kind='account_erasure' and p.status<>'deleting' then raise sqlstate 'PT409' using message='Journal is not closed.';end if;
 if action='batch' then
 -- Grace window is longer than an Edge upload lifetime. Late writes cannot recreate erased objects.
 if exists(select 1 from public.schema_assets where owner_id=j.owner_id and state='pending' and created_at>now()-interval '15 minutes') then
 update public.schema_jobs set state='pending',available_at=now()+interval '1 minute',attempts=greatest(0,attempts-1),lease_token=null,lease_until=null where id=j.id;return jsonb_build_object('deferred',true);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'key',a.key)),'[]')into items from(select * from public.schema_assets where owner_id=j.owner_id and(j.kind='account_erasure' or(id::text=j.dedupe_key and state='deleting'))order by id limit 50)a;
 return jsonb_build_object('assets',items,'ownerId',j.owner_id,'kind',j.kind);
 elsif action='ack' then
 if jsonb_typeof(payload->'ids') is distinct from 'array' or jsonb_array_length(payload->'ids')>50 then raise sqlstate 'PT400' using message='Invalid batch.';end if;
 select coalesce(array_agg(value::uuid),'{}')into ids from jsonb_array_elements_text(payload->'ids');
 if exists(select 1 from unnest(ids)x where not exists(select 1 from public.schema_assets where id=x and owner_id=j.owner_id and(j.kind='account_erasure' or(id::text=j.dedupe_key and state='deleting'))))then raise sqlstate 'PT409' using message='Invalid batch ownership.';end if;
 if j.kind='account_erasure' then delete from public.schema_entry_assets where owner_id=j.owner_id and asset_id=any(ids);end if;
 select coalesce(sum(size),0)into total from public.schema_assets where owner_id=j.owner_id and id=any(ids);
 delete from public.schema_assets where owner_id=j.owner_id and id=any(ids);
 update public.schema_profiles set storage_bytes=greatest(0,storage_bytes-total),archive_revision=archive_revision+1 where id=j.owner_id;
 update public.schema_jobs set state='pending',attempts=0,available_at=now(),lease_token=null,lease_until=null,updated_at=now()where id=j.id;
 return jsonb_build_object('ok',true);
 elsif action='prepare_auth_delete' then
 if j.kind<>'account_erasure' or exists(select 1 from public.schema_assets where owner_id=j.owner_id)then raise sqlstate 'PT409' using message='Files remain.';end if;
 delete from public.schema_entries where owner_id=j.owner_id;
 delete from public.schema_consent_choices where owner_id=j.owner_id;
 delete from public.schema_consent_events where owner_id=j.owner_id;
 delete from schema_private.audit where owner_id=j.owner_id;
 delete from schema_private.request_limits where owner_id=j.owner_id;
 update public.schema_profiles set name='',birthday=null,theme='rose',quiet=false,text_size='standard',question_mode='off',ai_consent=false,onboarded=false,onboarding_step='welcome',storage_bytes=0,archive_revision=archive_revision+1 where id=j.owner_id;
 return jsonb_build_object('ownerId',j.owner_id);
 elsif action='complete' then
 if exists(select 1 from public.schema_assets where owner_id=j.owner_id and(j.kind='account_erasure' or id::text=j.dedupe_key))then raise sqlstate 'PT409' using message='Files remain.';end if;
 if j.kind='account_erasure' then
 if exists(select 1 from auth.users where id=j.owner_id)then raise sqlstate 'PT409' using message='Identity remains.';end if;
 update public.schema_profiles set status='deleted' where id=j.owner_id;
 end if;
 update public.schema_jobs set state='succeeded',error_code=null,lease_token=null,lease_until=null,updated_at=now()where id=j.id;return jsonb_build_object('ok',true);
 elsif action='fail' then
 update public.schema_jobs set state=case when attempts>=5 then 'failed' else 'pending' end,available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),error_code='provider_unavailable',lease_token=null,lease_until=null,updated_at=now()where id=j.id;
 return jsonb_build_object('ok',true);
 end if;
 raise sqlstate 'PT404' using message='Unknown worker action.';
 end;
$$;
revoke all on function schema_private.worker(text,jsonb) from public,anon,authenticated;
grant execute on function schema_private.worker(text,jsonb) to service_role;
create function public.schema_worker(action text,payload jsonb default '{}'::jsonb)returns jsonb language sql security invoker set search_path='' as $$select schema_private.worker(action,payload)$$;
revoke all on function public.schema_worker(text,jsonb) from public,anon,authenticated;
grant execute on function public.schema_worker(text,jsonb) to service_role;

create function schema_private.housekeeping()returns void language plpgsql security definer set search_path='' as $$
 declare a record;
 begin
 -- Serialize with customer writes and closure before expiring an upload intent.
 for a in select id,owner_id from public.schema_assets where state='pending' and created_at<now()-interval '15 minutes' order by created_at limit 100 loop
 perform 1 from public.schema_profiles where id=a.owner_id for update;
 update public.schema_assets set state='deleting' where id=a.id and state='pending';
 if found and exists(select 1 from public.schema_profiles where id=a.owner_id and status='active')then
 insert into public.schema_jobs(owner_id,kind,dedupe_key)values(a.owner_id,'asset_erasure',a.id::text)on conflict(owner_id,kind,dedupe_key)do nothing;
 end if;
 end loop;
 delete from schema_private.request_limits where minute<now()-interval '1 day';
 delete from schema_private.dispatch_tokens where expires_at<now();
 delete from schema_private.worker_runs where started_at<now()-interval '15 days';
 end;
$$;
revoke all on function schema_private.housekeeping()from public,anon,authenticated,service_role;
create index schema_assets_pending_expiry on public.schema_assets(created_at)where state='pending';
