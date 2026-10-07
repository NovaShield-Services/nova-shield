-- Batch 3: three read-only admin RPCs behind is_admin().
--
-- Ordering: after 20261007105707_batch2_reject_empty_quote_acceptance.
-- Modifies no existing migration. Writes nothing: all three are STABLE.
--
-- WHY THESE ARE SERVER-SIDE
--
-- The admin previously counted by fetching rows: dashboardCounts() pulled
-- EVERY ns_jobs row just to tally statuses in JS, and listJobs() pulled 200
-- unfiltered rows with no way to search at all. Text search also has to span
-- three tables (ns_jobs, customers, properties); PostgREST can filter on one
-- embedded resource but cannot OR across two different ones in a single
-- request, so the only honest alternatives were a server-side function or a
-- client-side scan. These functions are the former.
--
-- They also give the dashboard and the jobs list ONE definition of "today",
-- "upcoming", "overdue" and "unscheduled". A dashboard card saying "3
-- scheduled today" and the jobs screen it links to now compute that bucket
-- in the same place, so the count and the list cannot disagree.
--
-- All three are SECURITY DEFINER so they can read across admin-only tables
-- in one pass, and every one re-checks is_admin() first -- they are not
-- granted to anon and introduce no anonymous access.

/* ------------------------------------------------------------------------ */
/* 1. Dashboard summary -- one round trip for the whole home screen.        */
/* ------------------------------------------------------------------------ */

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_today_start timestamptz := date_trunc('day', now());
  v_today_end   timestamptz := date_trunc('day', now()) + interval '1 day';
  v_week_end    timestamptz := date_trunc('day', now()) + interval '8 days';
  v_activity    jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  -- Recent activity, assembled only from timestamps that actually exist.
  -- Deliberately absent: quote "viewed" (no viewed_at column anywhere) and
  -- quote "superseded" (no superseded_at -- supersession is a status with no
  -- recorded time, so it cannot be placed on a timeline).
  select coalesce(jsonb_agg(a order by (a->>'at') desc), '[]'::jsonb)
    into v_activity
  from (
    select * from (
      select jsonb_build_object(
               'kind', 'request_received', 'at', r.submitted_at,
               'job_id', (select j.id from public.ns_jobs j where j.request_id = r.id limit 1),
               'customer', c.name) as a
        from public.quote_requests r
        left join public.customers c on c.id = r.customer_id
       where r.submitted_at is not null
       order by r.submitted_at desc limit 6
    ) s1
    union all
    select * from (
      select jsonb_build_object(
               'kind', 'quote_sent', 'at', q.sent_at, 'job_id', q.job_id,
               'customer', c.name, 'version', q.version)
        from public.ns_quotes q
        join public.ns_jobs j on j.id = q.job_id
        left join public.customers c on c.id = j.customer_id
       where q.sent_at is not null
       order by q.sent_at desc limit 6
    ) s2
    union all
    select * from (
      select jsonb_build_object(
               'kind', 'quote_' || q.status, 'at', q.responded_at, 'job_id', q.job_id,
               'customer', c.name, 'version', q.version)
        from public.ns_quotes q
        join public.ns_jobs j on j.id = q.job_id
        left join public.customers c on c.id = j.customer_id
       where q.responded_at is not null and q.status in ('accepted','declined')
       order by q.responded_at desc limit 6
    ) s3
    union all
    select * from (
      select jsonb_build_object(
               'kind', 'job_completed', 'at', j.completed_at, 'job_id', j.id,
               'customer', c.name)
        from public.ns_jobs j
        left join public.customers c on c.id = j.customer_id
       where j.completed_at is not null
       order by j.completed_at desc limit 6
    ) s4
    union all
    select * from (
      select jsonb_build_object(
               'kind', 'note_added', 'at', n.created_at, 'job_id', n.job_id,
               'customer', c.name, 'visibility', n.visibility)
        from public.job_notes n
        join public.ns_jobs j on j.id = n.job_id
        left join public.customers c on c.id = j.customer_id
       order by n.created_at desc limit 6
    ) s5
  ) merged(a);

  return jsonb_build_object(
    'generated_at', now(),

    -- Request lifecycle (new | reviewed | converted | spam | archived).
    -- Kept strictly separate from job and quote lifecycles.
    'requests_new', (select count(*) from public.quote_requests where status = 'new'),
    'requests_reviewed_unconverted',
      (select count(*) from public.quote_requests where status = 'reviewed'),

    -- Quote lifecycle rolled up to the jobs it affects.
    'jobs_awaiting_customer',
      (select count(distinct q.job_id) from public.ns_quotes q where q.status = 'sent'),
    'jobs_accepted_unscheduled',
      (select count(distinct j.id)
         from public.ns_jobs j
         join public.ns_quotes q on q.job_id = j.id and q.status = 'accepted'
        where j.scheduled_for is null and j.completed_at is null),

    -- Job lifecycle / schedule buckets. Same boundaries search_jobs uses.
    'scheduled_today',
      (select count(*) from public.ns_jobs
        where scheduled_for >= v_today_start and scheduled_for < v_today_end),
    'scheduled_next_7_days',
      (select count(*) from public.ns_jobs
        where scheduled_for >= v_today_end and scheduled_for < v_week_end),
    'overdue_scheduled',
      (select count(*) from public.ns_jobs
        where scheduled_for < v_today_start and completed_at is null),
    'completed_last_14_days',
      (select count(*) from public.ns_jobs
        where completed_at >= now() - interval '14 days'),

    -- Attention: a job carrying at least one review-flagged measurement or
    -- elevation. review_required already existed per row with no rollup.
    'jobs_with_review_flags',
      (select count(*) from public.ns_jobs j
        where exists (select 1 from public.job_measurements m
                       where m.job_id = j.id and m.review_required)
           or exists (select 1 from public.job_sections s
                       where s.job_id = j.id and s.review_required)),

    'recent_activity', v_activity
  );
end
$function$;

/* ------------------------------------------------------------------------ */
/* 2. Jobs search / filter / sort -- one query, server-side.               */
/* ------------------------------------------------------------------------ */

create or replace function public.search_jobs(
  p_query           text    default null,
  p_statuses        text[]  default null,
  p_schedule_bucket text    default null,   -- today | upcoming | overdue | unscheduled
  p_scheduled_from  date    default null,
  p_scheduled_to    date    default null,
  p_needs_review    boolean default false,
  p_sort            text    default 'updated_desc',
  p_limit           integer default 50,
  p_offset          integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_pattern     text := case when p_query is null or btrim(p_query) = '' then null
                             else '%' || btrim(p_query) || '%' end;
  v_today_start timestamptz := date_trunc('day', now());
  v_today_end   timestamptz := date_trunc('day', now()) + interval '1 day';
  v_week_end    timestamptz := date_trunc('day', now()) + interval '8 days';
  v_limit       integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset      integer := greatest(coalesce(p_offset, 0), 0);
  v_sort        text := coalesce(p_sort, 'updated_desc');
  v_total       bigint := 0;
  v_rows        jsonb  := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  with base as (
    select j.id, j.reference, j.title, j.status, j.scheduled_for, j.completed_at,
           j.created_at, j.updated_at, j.customer_id, j.property_id, j.request_id,
           c.name  as customer_name, c.phone as customer_phone, c.email as customer_email,
           p.address_line1, p.city, p.postal_code,
           (select count(*) from public.job_measurements m
             where m.job_id = j.id and m.review_required)   as flagged_measurements,
           (select count(*) from public.job_sections s
             where s.job_id = j.id and s.review_required)   as flagged_sections,
           (select count(*) from public.job_measurements m where m.job_id = j.id)
                                                            as measurement_count
      from public.ns_jobs j
      left join public.customers  c on c.id = j.customer_id
      left join public.properties p on p.id = j.property_id
     where
       -- Text search spans the job, its customer and its property. This is
       -- the whole reason the function exists: PostgREST cannot OR across
       -- two embedded resources in one request.
       (v_pattern is null
         or j.reference      ilike v_pattern
         or j.title          ilike v_pattern
         or c.name           ilike v_pattern
         or c.email          ilike v_pattern
         or c.phone          ilike v_pattern
         or p.address_line1  ilike v_pattern
         or p.city           ilike v_pattern
         or p.postal_code    ilike v_pattern)
       -- Job lifecycle only. Never mixed with request or quote status.
       and (p_statuses is null or array_length(p_statuses, 1) is null
            or j.status = any (p_statuses))
       and (p_schedule_bucket is null
         or (p_schedule_bucket = 'today'
              and j.scheduled_for >= v_today_start and j.scheduled_for < v_today_end)
         or (p_schedule_bucket = 'upcoming'
              and j.scheduled_for >= v_today_end and j.scheduled_for < v_week_end)
         or (p_schedule_bucket = 'overdue'
              and j.scheduled_for < v_today_start and j.completed_at is null)
         or (p_schedule_bucket = 'unscheduled' and j.scheduled_for is null))
       and (p_scheduled_from is null
            or (j.scheduled_for is not null
                and j.scheduled_for >= p_scheduled_from::timestamptz))
       and (p_scheduled_to is null
            or (j.scheduled_for is not null
                and j.scheduled_for < (p_scheduled_to::timestamptz + interval '1 day')))
       and (not coalesce(p_needs_review, false)
            or exists (select 1 from public.job_measurements m
                        where m.job_id = j.id and m.review_required)
            or exists (select 1 from public.job_sections s
                        where s.job_id = j.id and s.review_required))
  ),
  counted as (select b.*, count(*) over () as total_count from base b),
  page as (
    select cc.*, row_number() over (
             order by
               case when v_sort = 'scheduled_asc'  then cc.scheduled_for end asc  nulls last,
               case when v_sort = 'scheduled_desc' then cc.scheduled_for end desc nulls last,
               case when v_sort = 'created_desc'   then cc.created_at    end desc,
               case when v_sort = 'customer_asc'   then cc.customer_name end asc  nulls last,
               cc.updated_at desc
           ) as ord
      from counted cc
     order by ord
     limit v_limit offset v_offset
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', pg.id, 'reference', pg.reference, 'title', pg.title,
             'status', pg.status, 'scheduled_for', pg.scheduled_for,
             'completed_at', pg.completed_at, 'created_at', pg.created_at,
             'updated_at', pg.updated_at,
             'customer', jsonb_build_object('id', pg.customer_id, 'name', pg.customer_name,
                                            'phone', pg.customer_phone, 'email', pg.customer_email),
             'property', jsonb_build_object('id', pg.property_id, 'address_line1', pg.address_line1,
                                            'city', pg.city, 'postal_code', pg.postal_code),
             'measurement_count', pg.measurement_count,
             'review_flags', jsonb_build_object('measurements', pg.flagged_measurements,
                                                'sections', pg.flagged_sections,
                                                'total', pg.flagged_measurements + pg.flagged_sections),
             -- What the customer originally asked for, via the normalized
             -- quote_request_services relationship -- never copied onto the job.
             'requested_services', coalesce((
               select jsonb_agg(coalesce(sv.name, rs.other_label) order by coalesce(sv.name, rs.other_label))
                 from public.quote_request_services rs
                 left join public.services sv on sv.id = rs.service_id
                where rs.request_id = pg.request_id), '[]'::jsonb),
             -- Latest quote by version, plus whether anything on this job is
             -- currently accepted or sent. Quote lifecycle stays its own field.
             'latest_quote', (
               select jsonb_build_object('id', q.id, 'version', q.version, 'status', q.status,
                                         'total', q.total, 'sent_at', q.sent_at,
                                         'responded_at', q.responded_at)
                 from public.ns_quotes q
                where q.job_id = pg.id
                order by q.version desc, q.created_at desc
                limit 1),
             'quote_count', (select count(*) from public.ns_quotes q where q.job_id = pg.id),
             'has_unapproved_pricing', exists (
               select 1 from public.ns_quotes q
               join public.quote_line_items li on li.quote_id = q.id
              where q.job_id = pg.id and q.status in ('draft','sent')
                and li.pricing_approved = false)
           ) order by pg.ord), '[]'::jsonb),
         coalesce(max(pg.total_count), 0)
    into v_rows, v_total
  from page pg;

  return jsonb_build_object(
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'sort', v_sort,
    'rows', v_rows
  );
end
$function$;

/* ------------------------------------------------------------------------ */
/* 3. Job activity -- normalized real events for one job.                  */
/* ------------------------------------------------------------------------ */

create or replace function public.job_activity(p_job_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_events jsonb;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = 'insufficient_privilege';
  end if;

  -- Every branch below is anchored to a column that genuinely exists and is
  -- genuinely populated by the application. What is NOT here, and why:
  --
  --   quote viewed / read receipts  - no viewed_at column exists anywhere
  --   quote superseded              - no superseded_at; supersession is a
  --                                   status with no recorded time, so it is
  --                                   reported as context on the quote entry
  --                                   instead of as a dated event
  --   customer replies / calls / texts / "on my way"
  --                                 - nothing persists these; the SMS links
  --                                   are launchers and record nothing
  --
  -- `actor_id` is passed through raw. auth.users is unreadable from the
  -- browser and admin_users holds only user_id, so the only real NAME in the
  -- schema is ns_quotes.signed_by_name (typed by the customer); everything
  -- else must render as "you"/"a staff member", never an invented name.
  select coalesce(jsonb_agg(e order by (e->>'at') desc nulls last), '[]'::jsonb)
    into v_events
  from (
    -- request received / reviewed (request lifecycle)
    select jsonb_build_object('kind','request_received','at',r.submitted_at,
             'source','quote_requests','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('channel', r.source,
                         'message', r.customer_message,
                         'preferred_schedule', r.preferred_schedule)) as e
      from public.quote_requests r
      join public.ns_jobs j on j.request_id = r.id
     where j.id = p_job_id and r.submitted_at is not null
    union all
    select jsonb_build_object('kind','request_reviewed','at',r.reviewed_at,
             'source','quote_requests','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('status', r.status))
      from public.quote_requests r
      join public.ns_jobs j on j.request_id = r.id
     where j.id = p_job_id and r.reviewed_at is not null
    union all
    -- job created
    select jsonb_build_object('kind','job_created','at',j.created_at,
             'source','ns_jobs','actor_id',j.created_by,'actor_name',null,
             'detail', jsonb_build_object('reference', j.reference))
      from public.ns_jobs j where j.id = p_job_id
    union all
    -- scheduled_for is a TARGET date, not a record of when booking happened
    -- (there is no scheduled_at). Surfaced as a dated scheduled item and
    -- labelled that way by the renderer.
    select jsonb_build_object('kind','scheduled_for','at',j.scheduled_for,
             'source','ns_jobs','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('is_target_date', true))
      from public.ns_jobs j where j.id = p_job_id and j.scheduled_for is not null
    union all
    select jsonb_build_object('kind','job_completed','at',j.completed_at,
             'source','ns_jobs','actor_id',null,'actor_name',null,
             'detail', '{}'::jsonb)
      from public.ns_jobs j where j.id = p_job_id and j.completed_at is not null
    union all
    -- quote lifecycle
    select jsonb_build_object(
             'kind', case when q.version > 1 then 'quote_revised' else 'quote_created' end,
             'at', q.created_at, 'source','ns_quotes','actor_id',q.created_by,'actor_name',null,
             'detail', jsonb_build_object('quote_id',q.id,'version',q.version,'kind',q.kind,
                         'total',q.total,'current_status',q.status,
                         'option_label',q.option_label))
      from public.ns_quotes q where q.job_id = p_job_id
    union all
    select jsonb_build_object('kind','quote_sent','at',q.sent_at,
             'source','ns_quotes','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('quote_id',q.id,'version',q.version,'total',q.total,
                         'option_label',q.option_label))
      from public.ns_quotes q where q.job_id = p_job_id and q.sent_at is not null
    union all
    select jsonb_build_object('kind','quote_'||q.status,'at',q.responded_at,
             'source','ns_quotes','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('quote_id',q.id,'version',q.version,'total',q.total,
                         'option_label',q.option_label))
      from public.ns_quotes q
     where q.job_id = p_job_id and q.responded_at is not null
       and q.status in ('accepted','declined')
    union all
    -- signed_by_name is the one genuine actor name the schema records
    select jsonb_build_object('kind','quote_signed','at',q.signed_at,
             'source','ns_quotes','actor_id',null,'actor_name',q.signed_by_name,
             'detail', jsonb_build_object('quote_id',q.id,'version',q.version))
      from public.ns_quotes q where q.job_id = p_job_id and q.signed_at is not null
    union all
    -- notes, with their real visibility so the renderer can separate
    -- internal from customer-visible
    select jsonb_build_object('kind','note_added','at',n.created_at,
             'source','job_notes','actor_id',n.author_id,'actor_name',null,
             'detail', jsonb_build_object('note_id',n.id,'visibility',n.visibility,'body',n.body))
      from public.job_notes n where n.job_id = p_job_id
    union all
    -- outbound notifications actually queued/sent by the system
    select jsonb_build_object(
             'kind', case when nt.sent_at is not null then 'notification_sent'
                          else 'notification_queued' end,
             'at', coalesce(nt.sent_at, nt.created_at),
             'source','notifications','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('notification_kind',nt.kind,'channel',nt.channel,
                         'status',nt.status,'subject',nt.subject))
      from public.notifications nt where nt.job_id = p_job_id
    union all
    -- change orders
    select jsonb_build_object('kind','change_order_raised','at',co.created_at,
             'source','ns_change_orders','actor_id',co.created_by,'actor_name',null,
             'detail', jsonb_build_object('description',co.description,'amount',co.amount,
                         'status',co.status))
      from public.ns_change_orders co
      join public.ns_quotes q on q.id = co.quote_id
     where q.job_id = p_job_id
    union all
    select jsonb_build_object('kind','change_order_'||co.status,'at',co.approved_at,
             'source','ns_change_orders','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('description',co.description,'amount',co.amount))
      from public.ns_change_orders co
      join public.ns_quotes q on q.id = co.quote_id
     where q.job_id = p_job_id and co.approved_at is not null
       and co.status in ('approved','declined')
    union all
    -- photos
    select jsonb_build_object('kind','photo_added','at',a.created_at,
             'source','job_attachments','actor_id',a.uploaded_by,'actor_name',null,
             'detail', jsonb_build_object('photo_kind',a.kind,'caption',a.caption,
                         'elevation_tag',a.elevation_tag,'from_request',(a.request_id is not null)))
      from public.job_attachments a where a.job_id = p_job_id
    union all
    -- inspection findings
    select jsonb_build_object('kind','inspection_flag','at',f.noted_at,
             'source','job_inspection_flags','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('flag', fl.name, 'note', f.note))
      from public.job_inspection_flags f
      join public.inspection_flags fl on fl.id = f.flag_id
     where f.job_id = p_job_id
    union all
    -- measurements
    select jsonb_build_object('kind','measurement_added','at',m.created_at,
             'source','job_measurements','actor_id',null,'actor_name',null,
             'detail', jsonb_build_object('service', sv.name, 'quantity', m.quantity,
                         'review_required', m.review_required, 'review_reason', m.review_reason))
      from public.job_measurements m
      left join public.services sv on sv.id = m.service_id
     where m.job_id = p_job_id
  ) merged(e)
  where e->>'at' is not null;

  return v_events;
end
$function$;
