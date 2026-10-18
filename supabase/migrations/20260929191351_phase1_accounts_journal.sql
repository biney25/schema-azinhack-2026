-- Phase 1 customer backend. The existing private Sites data is not modified.
create schema if not exists schema_private;
revoke all on schema schema_private from public, anon, authenticated;
grant usage on schema schema_private to authenticated, service_role;
alter default privileges in schema schema_private revoke execute on functions from public;

create table public.schema_profiles (
 id uuid primary key, -- intentional tombstone; survives Auth user erasure
 name text not null default '' check(length(name)<=80),
 birthday date, theme text not null default 'rose' check(theme in ('rose','lavender','vintage')),
 quiet boolean not null default false, text_size text not null default 'standard' check(text_size in ('standard','large')),
 question_mode text not null default 'gentle' check(question_mode in ('gentle','off')),
 onboarded boolean not null default false, onboarding_step text not null default 'welcome' check(onboarding_step in ('welcome','first_page','done')),
 ai_consent boolean not null default false, preferences_version integer not null default 1,
 status text not null default 'active' check(status in ('active','deleting','deleted')),
 plan text not null default 'free' check(plan in ('free','plus','extra')),
 storage_bytes bigint not null default 0 check(storage_bytes>=0), storage_limit bigint not null default 268435456,
 archive_revision bigint not null default 0, created_at timestamptz not null default now()
);
create table public.schema_entries (
 id uuid primary key,owner_id uuid not null references public.schema_profiles(id),
 title text not null check(length(btrim(title)) between 1 and 140),body text not null default '' check(length(body)<=20000),
 date date not null, mood text not null default '' check(mood in ('','happy','peaceful','tired','sad','mixed','proud')),
 theme text not null default 'rose' check(theme in ('rose','lavender','vintage')),
 layout text not null default 'collage' check(layout in ('collage','letter','filmstrip')),
 tags jsonb not null default '[]' check(jsonb_typeof(tags)='array' and jsonb_array_length(tags)<=20),
 people jsonb not null default '[]' check(jsonb_typeof(people)='array' and jsonb_array_length(people)<=20),
 place text not null default '' check(length(place)<=100),blocks jsonb not null default '[]' check(jsonb_typeof(blocks)='array' and jsonb_array_length(blocks)<=20),
 favorite boolean not null default false,ai_allowed boolean not null default false,version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,id)
);
create index schema_entries_owner_date on public.schema_entries(owner_id,date desc,id desc);
create index schema_entries_owner_updated on public.schema_entries(owner_id,updated_at,id);
create table public.schema_assets (
 id uuid primary key,owner_id uuid not null references public.schema_profiles(id),key text not null unique,
 name text not null check(length(name)<=100),type text not null check(type in ('image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg')),
 size bigint not null check(size between 12 and 8388608),checksum text not null check(checksum~'^[0-9a-f]{64}$'),
 state text not null default 'pending' check(state in ('pending','ready','deleting')),
 created_at timestamptz not null default now(),unique(owner_id,id)
);
create index schema_assets_owner_id on public.schema_assets(owner_id,id);
create table public.schema_entry_assets (
 owner_id uuid not null,entry_id uuid not null,asset_id uuid not null,position smallint not null check(position between 0 and 11),
 primary key(entry_id,asset_id),unique(entry_id,position),
 foreign key(owner_id,entry_id) references public.schema_entries(owner_id,id) on delete cascade,
 foreign key(owner_id,asset_id) references public.schema_assets(owner_id,id)
);
create index schema_entry_assets_owner_asset on public.schema_entry_assets(owner_id,asset_id);
create table public.schema_consent_choices (
 owner_id uuid not null references public.schema_profiles(id),purpose text not null check(purpose in ('storage','ai','sharing','imports','notifications')),
 enabled boolean not null,notice_version text not null,updated_at timestamptz not null default now(),primary key(owner_id,purpose)
);
create table public.schema_consent_events (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.schema_profiles(id),purpose text not null,enabled boolean not null,notice_version text not null,created_at timestamptz not null default now()
);
create index schema_consent_events_owner_date on public.schema_consent_events(owner_id,created_at desc,id desc);
create table public.schema_jobs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.schema_profiles(id),kind text not null,
 dedupe_key text not null,state text not null default 'pending' check(state in ('pending','running','succeeded','failed','cancelled')),
 attempts integer not null default 0 check(attempts>=0),available_at timestamptz not null default now(),lease_token uuid,lease_until timestamptz,
 error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,kind,dedupe_key)
);
create index schema_jobs_due on public.schema_jobs(available_at,id) where state='pending';
create index schema_jobs_expired on public.schema_jobs(lease_until) where state='running';
create index schema_jobs_owner_state on public.schema_jobs(owner_id,state);
create table schema_private.audit (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null,action text not null,created_at timestamptz not null default now()
);
create index schema_audit_owner_date on schema_private.audit(owner_id,created_at desc);
create table schema_private.request_limits (
 owner_id uuid not null,minute timestamptz not null,count integer not null,primary key(owner_id,minute)
);

-- Reading auth.sessions closes the access-token-after-signout gap. No JWT user_metadata is used.
create function schema_private.live_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.user_id=(select auth.uid()) and s.id::text=(select auth.jwt()->>'session_id')
 and (s.not_after is null or s.not_after>now()) and u.email_confirmed_at is not null
 and coalesce(u.is_anonymous,false)=false and (u.banned_until is null or u.banned_until<now()));
$$;
revoke all on function schema_private.live_session() from public,anon;
grant execute on function schema_private.live_session() to authenticated;
create function schema_private.active_owner() returns boolean language sql stable security definer set search_path='' as $$
 select schema_private.live_session() and exists(select 1 from public.schema_profiles where id=(select auth.uid()) and status='active');
$$;
revoke all on function schema_private.active_owner() from public,anon;
grant execute on function schema_private.active_owner() to authenticated;

create function schema_private.assert_actor(recent boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
 declare actor uuid:=auth.uid();
 begin
 if actor is null or not schema_private.live_session() then raise sqlstate 'PT401' using message='Sign in again to open your journal.';end if;
 if recent and not exists(select 1 from auth.sessions s where s.user_id=actor and s.id::text=auth.jwt()->>'session_id' and s.created_at>now()-interval '5 minutes') then
 raise sqlstate 'PT403' using message='Sign in again before changing account security or closing the journal.';end if;
 return actor;
 end;
$$;
revoke all on function schema_private.assert_actor(boolean) from public,anon,authenticated;

create function schema_private.entry_dto(e public.schema_entries) returns jsonb language sql stable set search_path='' as $$
 select to_jsonb(e)||jsonb_build_object('aiAllowed',e.ai_allowed,'assets',coalesce((select jsonb_agg(a.asset_id order by a.position) from public.schema_entry_assets a where a.entry_id=e.id),'[]'::jsonb));
$$;
revoke all on function schema_private.entry_dto(public.schema_entries) from public,anon,authenticated;

create function schema_private.consent(actor uuid,p_purpose text,p_enabled boolean) returns void language plpgsql set search_path='' as $$
 begin
 if not exists(select 1 from public.schema_consent_choices c where c.owner_id=actor and c.purpose=p_purpose and c.enabled=p_enabled and c.notice_version='2026-09-29.1') then
 insert into public.schema_consent_events(owner_id,purpose,enabled,notice_version)values(actor,p_purpose,p_enabled,'2026-09-29.1');
 end if;
 insert into public.schema_consent_choices(owner_id,purpose,enabled,notice_version)values(actor,p_purpose,p_enabled,'2026-09-29.1')
 on conflict(owner_id,purpose) do update set enabled=excluded.enabled,notice_version=excluded.notice_version,updated_at=now();
 end;
$$;
revoke all on function schema_private.consent(uuid,text,boolean) from public,anon,authenticated;

-- The one Data API mutation surface. Private function, fixed search_path, verified actor.
create function schema_private.api(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
 declare actor uuid; p public.schema_profiles; e public.schema_entries; a public.schema_assets; jid uuid; result jsonb; n integer; aid uuid; ids uuid[]; is_new boolean; expected integer; pday date;
 begin
 actor:=schema_private.assert_actor(action in ('account.close','security.recent'));
 if octet_length(payload::text)>262144 then raise sqlstate 'PT413' using message='This request is too large.';end if;
 insert into public.schema_profiles(id)values(actor)on conflict(id)do nothing;
 -- A per-account lock serializes quota reservations, close, consent and page writes.
 select * into p from public.schema_profiles where id=actor for update;
 if action='account.status' then return jsonb_build_object('status',p.status,'job',(select to_jsonb(j)-'lease_token' from public.schema_jobs j where owner_id=actor and kind='account_erasure'),'remainingFiles',(select count(*) from public.schema_assets where owner_id=actor));end if;
 if action='bootstrap' and p.status<>'active' then return jsonb_build_object('profile',to_jsonb(p),'entries','[]'::jsonb,'hasMore',false,'stats',jsonb_build_object('pages',0,'days',0,'years',0),'years','[]'::jsonb);end if;
 if p.status<>'active' then raise sqlstate 'PT410' using message='This journal is closed.';end if;
 if action not in ('bootstrap','profile.save','privacy.get','security.sessions','security.recent') and not p.onboarded then raise sqlstate 'PT403' using message='Complete your welcome choices first.';end if;
 if action not in ('bootstrap','privacy.get','security.sessions','entries.list','entries.get','media.list','media.get','archive.status','security.recent','calendar','collections','recap','export.summary','export.entries') then
 insert into schema_private.request_limits values(actor,date_trunc('minute',now()),1)
 on conflict(owner_id,minute)do update set count=schema_private.request_limits.count+1 returning count into n;
 if n>60 then raise sqlstate 'PT429' using message='Too many changes. Try again in a minute.';end if;
 end if;
 if payload ? 'exportRevision' and payload->>'exportRevision' is distinct from actor::text||':'||p.archive_revision::text then raise sqlstate 'PT409' using message='Your journal changed during the download. Start a fresh download.';end if;
 if action='security.recent' then return jsonb_build_object('ok',true);
 elsif action='bootstrap' then
 return jsonb_build_object('profile',to_jsonb(p),'entries',(select coalesce(jsonb_agg(schema_private.entry_dto(x) order by x.date desc,x.id desc),'[]') from (select * from public.schema_entries where owner_id=actor order by date desc,id desc limit 60)x),'hasMore',(select count(*)>60 from (select 1 from public.schema_entries where owner_id=actor limit 61)x),'stats',(select jsonb_build_object('pages',count(*),'days',count(distinct date),'years',count(distinct extract(year from date)))from public.schema_entries where owner_id=actor),'years',(select coalesce(jsonb_agg(x order by x.year desc),'[]')from(select extract(year from date)::text as year,count(*) from public.schema_entries where owner_id=actor group by 1)x));
 elsif action='profile.save' then
 expected:=(payload->>'preferencesVersion')::integer;
 if expected is null or expected<>p.preferences_version then raise sqlstate 'PT409' using message='Your preferences changed. Reload them before saving.';end if;
 if not p.onboarded and (coalesce((payload->>'adultConfirmed')::boolean,false)=false or coalesce((payload->>'storageAcknowledged')::boolean,false)=false) then raise sqlstate 'PT400' using message='Confirm the adult and journal-storage choices.';end if;
 pday:=nullif(payload->>'birthday','')::date;
 if pday>(current_date-interval '18 years')::date then raise sqlstate 'PT400' using message='This release is for adults 18 and older.';end if;
 if not p.onboarded then perform schema_private.consent(actor,'storage',true);insert into schema_private.audit(owner_id,action) values(actor,'adult_declaration');end if;
 -- AI consent is changed separately, never by a stale profile form.
 update public.schema_profiles set name=coalesce(payload->>'name',''),birthday=pday,theme=coalesce(payload->>'theme','rose'),quiet=coalesce((payload->>'quiet')::boolean,false),text_size=coalesce(payload->>'textSize','standard'),question_mode=coalesce(payload->>'questionMode','gentle'),onboarded=true,onboarding_step=case when onboarding_step='welcome' then 'first_page' else onboarding_step end,preferences_version=preferences_version+1,archive_revision=archive_revision+1 where id=actor;
 return jsonb_build_object('ok',true);
 elsif action='onboarding.complete' then update public.schema_profiles set onboarding_step='done' where id=actor;return jsonb_build_object('ok',true);
 elsif action='privacy.get' then
 return jsonb_build_object('noticeVersion','2026-09-29.1','choices',(select coalesce(jsonb_agg(to_jsonb(c)),'[]')from public.schema_consent_choices c where owner_id=actor),'history',(select coalesce(jsonb_agg(x order by x.created_at desc,x.id desc),'[]')from(select * from public.schema_consent_events where owner_id=actor order by created_at desc,id desc limit 50)x));
 elsif action='privacy.set' then
 if payload->>'noticeVersion' is distinct from '2026-09-29.1' or coalesce(payload->>'purpose','') not in ('ai','sharing','imports','notifications') or jsonb_typeof(payload->'enabled') is distinct from 'boolean' then raise sqlstate 'PT400' using message='Review the current privacy choices.';end if;
 if (payload->>'enabled')::boolean and payload->>'purpose' in ('sharing','imports','notifications') then raise sqlstate 'PT409' using message='This feature is not connected in this customer release yet.';end if;
 perform schema_private.consent(actor,payload->>'purpose',(payload->>'enabled')::boolean);
 if payload->>'purpose'='ai' then update public.schema_profiles set ai_consent=(payload->>'enabled')::boolean,preferences_version=preferences_version+1 where id=actor;end if;
 return jsonb_build_object('ok',true);

 elsif action='calendar' then
 return jsonb_build_object('entries',(select coalesce(jsonb_agg(schema_private.entry_dto(x) order by x.date,x.id),'[]')from(select * from public.schema_entries where owner_id=actor and date>=(payload->>'month'||'-01')::date and date<((payload->>'month'||'-01')::date+interval '1 month') order by date,id limit 1001)x));
 elsif action='collections' then
 return jsonb_build_object('people',(select coalesce(jsonb_agg(x),'[]')from(select v as name,count(*) as count from public.schema_entries je cross join lateral jsonb_array_elements_text(je.people)v where owner_id=actor group by v order by count(*) desc,v limit 100)x),'ideas',(select coalesce(jsonb_agg(x),'[]')from(select v as name,count(*) as count from public.schema_entries je cross join lateral jsonb_array_elements_text(je.tags)v where owner_id=actor group by v order by count(*) desc,v limit 100)x),'places',(select coalesce(jsonb_agg(x),'[]')from(select place as name,count(*) as count from public.schema_entries where owner_id=actor and place<>'' group by place order by count(*) desc,place limit 100)x));
 elsif action='recap' then
 pday:=(payload->>'date')::date;
 return jsonb_build_object('from',pday-6,'to',pday,'stats',(select jsonb_build_object('pages',count(*),'days',count(distinct date))from public.schema_entries where owner_id=actor and date between pday-6 and pday),'highlights',(select coalesce(jsonb_agg(x),'[]')from(select id,title,date from public.schema_entries where owner_id=actor and date between pday-6 and pday order by favorite desc,date desc,id desc limit 5)x));
 elsif action='export.summary' then
 return (select jsonb_build_object('revision',actor::text||':'||p.archive_revision::text,'profile',jsonb_build_object('name',p.name,'birthday',p.birthday,'theme',p.theme),'pages',(select count(*)from public.schema_entries where owner_id=actor),'files',count(*)filter(where state='ready'),'unfinished',count(*)filter(where state<>'ready'),'bytes',coalesce(sum(size)filter(where state='ready'),0),'estimatedBytes',coalesce(sum(size),0)+count(*)*4096+1048576+(select coalesce(sum(octet_length(to_jsonb(je)::text)*16+16384),0)from public.schema_entries je where owner_id=actor))from public.schema_assets where owner_id=actor);
 elsif action='export.entries' then
 return jsonb_build_object('entries',(select coalesce(jsonb_agg(schema_private.entry_dto(x) order by x.id),'[]')from(select * from public.schema_entries where owner_id=actor and(coalesce(payload->>'after','')='' or id>(payload->>'after')::uuid)order by id limit 101)x));
 elsif action='entries.list' then
 return jsonb_build_object('entries',(select coalesce(jsonb_agg(schema_private.entry_dto(x) order by x.date desc,x.id desc),'[]')from(select * from public.schema_entries where owner_id=actor
 and(coalesce(payload->>'q','')='' or position(lower(left(payload->>'q',100)) in lower(title||' '||body||' '||tags::text||' '||people::text||' '||place))>0)
 and(coalesce(payload->>'year','')='' or extract(year from date)::text=payload->>'year')
 and(not coalesce((payload->>'favorite')::boolean,false) or favorite)
 and(coalesce(payload->>'month','')='' or to_char(date,'YYYY-MM')=payload->>'month')
 and(coalesce(payload->>'before','')='' or (date,id)<((payload->>'before')::date,(payload->>'last')::uuid))
 order by date desc,id desc limit 61)x));
 elsif action='entries.get' then
 select * into e from public.schema_entries where id=(payload->>'id')::uuid and owner_id=actor;if not found then raise sqlstate 'PT404' using message='This page is unavailable.';end if;
 return jsonb_build_object('entry',schema_private.entry_dto(e));
 elsif action='entries.save' then
 select * into e from public.schema_entries where id=(payload->>'id')::uuid and owner_id=actor;is_new:=not found;
 expected:=(payload->>'version')::integer;
 if not is_new and expected is null and (schema_private.entry_dto(e)-array['owner_id','version','created_at','updated_at','ai_allowed'])=payload then return jsonb_build_object('entry',schema_private.entry_dto(e));end if;
 if not is_new and (expected is null or expected<>e.version) then raise sqlstate 'PT409' using message='This page changed on another device. Keep both versions or reload.';end if;
 if is_new and expected is not null then raise sqlstate 'PT409' using message='The earlier page is unavailable. Save a separate copy.';end if;
 if jsonb_typeof(payload->'assets') is distinct from 'array' or jsonb_array_length(payload->'assets')>12 then raise sqlstate 'PT400' using message='Choose up to twelve files.';end if;
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(payload->'assets');
 if (select count(distinct x) from unnest(ids)x)<>cardinality(ids) then raise sqlstate 'PT400' using message='A file was selected twice.';end if;
 if exists(select 1 from unnest(ids)x where not exists(select 1 from public.schema_assets where id=x and owner_id=actor and state='ready'))then raise sqlstate 'PT400' using message='A selected file is unavailable.';end if;
 if jsonb_typeof(payload->'tags') is distinct from 'array' or jsonb_typeof(payload->'people') is distinct from 'array' or jsonb_typeof(payload->'blocks') is distinct from 'array' then raise sqlstate 'PT400' using message='Invalid page details.';end if;
 if exists(select 1 from jsonb_array_elements((payload->'tags')||(payload->'people'))v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 50)then raise sqlstate 'PT400' using message='Use short text labels.';end if;
 if exists(select 1 from jsonb_array_elements(payload->'blocks')b where length(coalesce(b->>'text',''))>100 or jsonb_typeof(b) is distinct from 'object' or ((b->>'x')::numeric between 0 and 90) is not true or ((b->>'y')::numeric between 0 and 90) is not true or ((b->>'rotation')::numeric between -30 and 30) is not true or (b->>'id' ~ '^[0-9a-f-]{36}$') is not true)then raise sqlstate 'PT400' using message='Invalid decoration.';end if;
 if is_new then
 insert into public.schema_entries(id,owner_id,title,body,date,mood,theme,layout,tags,people,place,blocks,favorite,ai_allowed)values((payload->>'id')::uuid,actor,payload->>'title',payload->>'body',(payload->>'date')::date,payload->>'mood',payload->>'theme',payload->>'layout',payload->'tags',payload->'people',payload->>'place',payload->'blocks',(payload->>'favorite')::boolean,(payload->>'aiAllowed')::boolean) returning * into e;
 else
 update public.schema_entries set title=payload->>'title',body=payload->>'body',date=(payload->>'date')::date,mood=payload->>'mood',theme=payload->>'theme',layout=payload->>'layout',tags=payload->'tags',people=payload->'people',place=payload->>'place',blocks=payload->'blocks',favorite=(payload->>'favorite')::boolean,ai_allowed=(payload->>'aiAllowed')::boolean,version=version+1,updated_at=now()where id=e.id returning * into e;
 delete from public.schema_entry_assets where entry_id=e.id;
 end if;
 insert into public.schema_entry_assets(owner_id,entry_id,asset_id,position)select actor,e.id,x,(ord-1)::smallint from unnest(ids)with ordinality as v(x,ord);
 update public.schema_profiles set archive_revision=archive_revision+1 where id=actor;
 return jsonb_build_object('entry',schema_private.entry_dto(e));
 elsif action='entries.delete' then
 delete from public.schema_entries where id=(payload->>'id')::uuid and owner_id=actor;if not found then raise sqlstate 'PT404' using message='This page is unavailable.';end if;
 update public.schema_profiles set archive_revision=archive_revision+1 where id=actor;return jsonb_build_object('ok',true);
 elsif action='media.reserve' then
 aid:=(payload->>'id')::uuid;select * into a from public.schema_assets where id=aid;
 if found then
 if a.owner_id<>actor or a.checksum<>payload->>'checksum' or a.type<>payload->>'type' or a.size<>(payload->>'size')::bigint then raise sqlstate 'PT409' using message='This file identifier belongs to another upload.';end if;
 if a.state<>'ready' then raise sqlstate 'PT409' using message='This upload is still pending. Retry shortly or remove it from Storage.';end if;
 return jsonb_build_object('asset',to_jsonb(a),'existing',true);
 end if;
 if p.storage_bytes+(payload->>'size')::bigint>p.storage_limit then raise sqlstate 'PT402' using message='Your storage is full.';end if;
 insert into public.schema_assets(id,owner_id,key,name,type,size,checksum)values(aid,actor,actor::text||'/'||aid::text,left(coalesce(payload->>'name','Memory'),100),payload->>'type',(payload->>'size')::bigint,payload->>'checksum')returning * into a;
 update public.schema_profiles set storage_bytes=storage_bytes+a.size,archive_revision=archive_revision+1 where id=actor;
 return jsonb_build_object('asset',to_jsonb(a),'existing',false);
 elsif action='media.finalize' then
 select * into a from public.schema_assets where id=(payload->>'id')::uuid and owner_id=actor;
 if not found then raise sqlstate 'PT404' using message='This upload is unavailable.';end if;
 if a.state<>'pending' then raise sqlstate 'PT409' using message='This upload is no longer pending.';end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='schema-media' and o.name=a.key and (o.metadata->>'size')::bigint=a.size)then raise sqlstate 'PT409' using message='This file did not finish uploading.';end if;
 update public.schema_assets set state='ready' where id=a.id;update public.schema_profiles set archive_revision=archive_revision+1 where id=actor;
 return jsonb_build_object('ok',true);
 elsif action='media.delete' then
 select * into a from public.schema_assets where id=(payload->>'id')::uuid and owner_id=actor;
 if not found then raise sqlstate 'PT404' using message='This file is unavailable.';end if;
 if exists(select 1 from public.schema_entry_assets where asset_id=a.id)then raise sqlstate 'PT409' using message='Remove this file from its pages first.';end if;
 if a.state='pending' and a.created_at>now()-interval '15 minutes' then raise sqlstate 'PT409' using message='This upload may still be running. Retry after fifteen minutes.';end if;
 update public.schema_assets set state='deleting' where id=a.id;
 insert into public.schema_jobs(owner_id,kind,dedupe_key)values(actor,'asset_erasure',a.id::text)on conflict(owner_id,kind,dedupe_key)do nothing;
 return jsonb_build_object('ok',true,'queued',true);
 elsif action='media.list' then
 return jsonb_build_object('assets',(select coalesce(jsonb_agg(to_jsonb(x)-'key' order by x.id),'[]')from(select a.*,(select count(*)from public.schema_entry_assets where asset_id=a.id) as page_count from public.schema_assets a where owner_id=actor and(coalesce(payload->>'after','')='' or id>(payload->>'after')::uuid) and(not coalesce((payload->>'unused')::boolean,false)or not exists(select 1 from public.schema_entry_assets where asset_id=a.id))order by id limit 101)x));
 elsif action='media.get' then
 select * into a from public.schema_assets where id=(payload->>'id')::uuid and owner_id=actor and state='ready';if not found then raise sqlstate 'PT404' using message='This file is unavailable.';end if;return jsonb_build_object('asset',to_jsonb(a));
 elsif action='archive.status' then
 return jsonb_build_object('revision',actor::text||':'||p.archive_revision::text,'pages',(select count(*)from public.schema_entries where owner_id=actor),'files',(select count(*)from public.schema_assets where owner_id=actor));
 elsif action='security.sessions' then
 return jsonb_build_object('sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'current',id::text=auth.jwt()->>'session_id')order by created_at desc),'[]')from auth.sessions where user_id=actor));
 elsif action='account.close' then
 if payload->>'confirm' is distinct from 'DELETE' then raise sqlstate 'PT400' using message='Type DELETE to close your journal.';end if;
 update public.schema_profiles set status='deleting',ai_consent=false where id=actor;
 update public.schema_jobs set state='cancelled',updated_at=now()where owner_id=actor and state in('pending','running');
 insert into public.schema_jobs(owner_id,kind,dedupe_key)values(actor,'account_erasure','close-account')on conflict(owner_id,kind,dedupe_key)do update set state='pending',available_at=now() returning id into jid;
 return jsonb_build_object('ok',true,'remaining',true,'jobId',jid);
 end if;
 raise sqlstate 'PT404' using message='This action is unavailable.';
 end;
$$;
revoke all on function schema_private.api(text,jsonb) from public,anon;
grant execute on function schema_private.api(text,jsonb) to authenticated;
create function public.schema_api(action text,payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select schema_private.api(action,payload)$$;
revoke all on function public.schema_api(text,jsonb)from public,anon;
grant execute on function public.schema_api(text,jsonb)to authenticated;

alter table public.schema_profiles enable row level security;
revoke all on public.schema_profiles from anon,authenticated;
grant select on public.schema_profiles to authenticated;
create policy owner_read on public.schema_profiles for select to authenticated using(id=(select auth.uid()) and (select schema_private.live_session()));
grant all on public.schema_profiles to service_role;

alter table public.schema_entries enable row level security;
revoke all on public.schema_entries from anon,authenticated;
grant select on public.schema_entries to authenticated;
create policy owner_read on public.schema_entries for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.active_owner()));
grant all on public.schema_entries to service_role;

alter table public.schema_assets enable row level security;
revoke all on public.schema_assets from anon,authenticated;
grant select on public.schema_assets to authenticated;
create policy owner_read on public.schema_assets for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.active_owner()));
grant all on public.schema_assets to service_role;

alter table public.schema_entry_assets enable row level security;
revoke all on public.schema_entry_assets from anon,authenticated;
grant select on public.schema_entry_assets to authenticated;
create policy owner_read on public.schema_entry_assets for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.active_owner()));
grant all on public.schema_entry_assets to service_role;

alter table public.schema_consent_choices enable row level security;
revoke all on public.schema_consent_choices from anon,authenticated;
grant select on public.schema_consent_choices to authenticated;
create policy owner_read on public.schema_consent_choices for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.active_owner()));
grant all on public.schema_consent_choices to service_role;

alter table public.schema_consent_events enable row level security;
revoke all on public.schema_consent_events from anon,authenticated;
grant select on public.schema_consent_events to authenticated;
create policy owner_read on public.schema_consent_events for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.active_owner()));
grant all on public.schema_consent_events to service_role;

alter table public.schema_jobs enable row level security;
revoke all on public.schema_jobs from anon,authenticated;
grant select(id,owner_id,kind,state,attempts,available_at,error_code,created_at,updated_at) on public.schema_jobs to authenticated;
create policy owner_read on public.schema_jobs for select to authenticated using(owner_id=(select auth.uid()) and (select schema_private.live_session()));
grant all on public.schema_jobs to service_role;

alter table schema_private.audit enable row level security;
alter table schema_private.request_limits enable row level security;
revoke all on all tables in schema schema_private from anon,authenticated;
-- Objects remain private. Only the byte-validating Edge Function can insert a file.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('schema-media','schema-media',false,8388608,array['image/jpeg','image/png','image/webp','audio/webm','audio/mp4','audio/ogg']);
create policy schema_media_read on storage.objects for select to authenticated using(bucket_id='schema-media' and (select schema_private.active_owner()) and exists(select 1 from public.schema_assets a where a.key=name and a.owner_id=(select auth.uid()) and a.state='ready'));
-- No client UPDATE/upsert or DELETE policy. Finalization, replacement and erasure use audited workflows.
