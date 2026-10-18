create extension if not exists pg_cron;
create extension if not exists pg_net;
-- The URL is owner-configured after deploying the matching function. No reusable
-- secret appears in the schedule, source or logs. Each dispatch token is single use.
create function schema_private.dispatch()returns bigint language plpgsql security definer set search_path='' as $$
 declare endpoint text; token text; request_id bigint;
 begin
 perform schema_private.housekeeping();
 select worker_url into endpoint from schema_private.runtime_config where id=true;
 if endpoint is null then return null;end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into schema_private.dispatch_tokens(hash,expires_at)values(encode(sha256(convert_to(token,'UTF8')),'hex'),now()+interval '90 seconds');
 request_id:=net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json'),body:=jsonb_build_object('token',token),timeout_milliseconds:=50000);
 return request_id;
 end;
$$;
revoke all on function schema_private.dispatch()from public,anon,authenticated,service_role;
-- Enabling the actual invocation requires a configured private runtime URL.
select cron.schedule('schema-erasure-dispatch','* * * * *','select schema_private.dispatch();');
select cron.schedule('schema-cron-history-retention','17 3 * * *',$$delete from cron.job_run_details where end_time<now()-interval '15 days';$$);
