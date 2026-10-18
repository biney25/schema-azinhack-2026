-- AZINHACK demo-only usage budget; apply to a new, isolated customer project.
create table if not exists schema_private.hackathon_usage (
  owner_id uuid not null references public.schema_profiles(id) on delete cascade,
  kind text not null check(kind in ('tinyfish','ai')),
  period date not null,
  requests integer not null default 0 check(requests between 0 and 10000),
  primary key(owner_id,kind,period)
);
alter table schema_private.hackathon_usage enable row level security;
revoke all on schema_private.hackathon_usage from public,anon,authenticated;
create or replace function public.schema_hackathon_reserve(p_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; p public.schema_profiles; curdate date; cap integer; used integer;
begin
 actor:=schema_private.assert_actor(false);
 select * into p from public.schema_profiles where id=actor for update;
 if not found or p.status<>'active' or not p.onboarded then
  raise sqlstate 'PT403' using message='Complete journal setup first.';
 end if;
 if p_kind='tinyfish' then
  curdate:=(now() at time zone 'UTC')::date; cap:=5;
 elsif p_kind='ai' then
  if not p.ai_consent or not exists(select 1 from public.schema_consent_choices
   where owner_id=actor and purpose='ai' and enabled=true) then
   raise sqlstate 'PT403' using message='Enable AI in Privacy first.';
  end if;
  curdate:=date_trunc('month',now() at time zone 'UTC')::date;
  cap:=case p.plan when 'extra' then 500 when 'plus' then 150 else 10 end;
 else raise sqlstate 'PT400' using message='Unsupported quota kind.';
 end if;
 insert into schema_private.hackathon_usage(owner_id,kind,period,requests)
 values(actor,p_kind,curdate,1)
 on conflict(owner_id,kind,period) do update
 set requests=schema_private.hackathon_usage.requests+1
 where schema_private.hackathon_usage.requests<cap
 returning requests into used;
 if used is null then raise sqlstate 'PT429' using message='Demo quota reached.';end if;
 return jsonb_build_object('count',used,'limit',cap,'period',curdate);
end;
$$;
revoke all on function public.schema_hackathon_reserve(text) from public,anon;
grant execute on function public.schema_hackathon_reserve(text) to authenticated;
