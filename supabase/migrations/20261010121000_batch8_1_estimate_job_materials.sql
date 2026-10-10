-- Batch 8.1: derive a job's materials requirement from the measurements the
-- field already captured.
--
-- WHY A FUNCTION AND NOT A CLIENT-SIDE SUM
--
-- The requirement is an aggregate across three tables (job_measurements,
-- ns_service_material_usage, the ns_material_stock view) with a per-material
-- rollup on top, because one material can be consumed by several services on
-- the same job -- permanent_lighting and permanent_lighting_jump both draw
-- on wire. Doing that in the browser means fetching every measurement and
-- every mapping and re-implementing the rollup; doing it here keeps one
-- definition of "required".
--
-- WHY SECURITY INVOKER (same reasoning as the Batch 4 RPCs)
--
-- Every table and the view it reads are RLS-protected admin-only, and the
-- view is security_invoker. Left as INVOKER, there is no row this function
-- can expose that the caller could not already select. SECURITY DEFINER
-- would make this SQL solely responsible for not leaking, for no gain. The
-- explicit is_admin() guard stays as a clear error and a backstop.
--
-- WHAT THIS IS NOT
--
-- Not pricing. It returns quantities and a cost basis for purchasing only;
-- it does not touch calculate_job_pricing, quote_line_items, or any
-- customer-facing figure, and nothing in the quote path calls it.
--
-- Not a stock reservation. It reads the ledger, never writes to it.
-- Consuming stock stays an explicit act from the Inventory screen, so a
-- quote that is never accepted cannot silently draw down the shelf.

create or replace function public.estimate_job_materials(p_job_id uuid)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_job    record;
  v_lines  jsonb;
  v_unmapped jsonb;
begin
  if not public.is_admin() then
    raise exception 'estimate_job_materials is admin-only'
      using errcode = 'insufficient_privilege';
  end if;

  select j.id, j.customer_id, j.property_id, j.status
    into v_job
    from public.ns_jobs j
   where j.id = p_job_id;

  if not found then
    raise exception 'Job % was not found', p_job_id
      using errcode = 'no_data_found';
  end if;

  /* Measured quantity per service on this job. Zero-quantity rows are
     dropped: an empty placeholder run is not a material requirement, and
     keeping it would put 0-ft lines in a purchase order. */
  with measured as (
    select m.service_id,
           sum(m.quantity)                                as measured_qty,
           bool_or(m.review_required)                     as any_review_required
      from public.job_measurements m
     where m.job_id = p_job_id
       and m.quantity > 0
     group by m.service_id
  ),
  required as (
    select u.material_id,
           sum(me.measured_qty * u.quantity_per_unit * (1 + u.waste_factor))
             as required_qty,
           bool_or(me.any_review_required) as from_flagged_measurement,
           jsonb_agg(jsonb_build_object(
             'service_key',       s.key,
             'service_name',      s.name,
             'measured_quantity', me.measured_qty,
             'service_unit',      s.unit,
             'quantity_per_unit', u.quantity_per_unit,
             'waste_factor',      u.waste_factor
           ) order by s.sort_order, s.name) as from_services
      from measured me
      join public.ns_service_material_usage u on u.service_id = me.service_id
      join public.services s                  on s.id = me.service_id
     group by u.material_id
  )
  select coalesce(jsonb_agg(line order by line ->> 'name'), '[]'::jsonb)
    into v_lines
    from (
      select jsonb_build_object(
               'material_id',   st.material_id,
               'sku',           st.sku,
               'name',          st.name,
               'category',      st.category,
               'unit',          st.unit,
               'required',      round(r.required_qty, 2),
               'on_hand',       st.on_hand,
               -- Never negative: a surplus is reported as a zero shortfall
               -- plus the on-hand figure, so a reader cannot mistake
               -- "-40 needed" for an order quantity.
               'shortfall',     round(greatest(r.required_qty - st.on_hand, 0), 2),
               'pack_quantity', st.pack_quantity,
               'packs_to_order', case
                 when r.required_qty - st.on_hand <= 0 then 0
                 else ceil((r.required_qty - st.on_hand) / st.pack_quantity)
               end,
               'unit_cost',     st.unit_cost,
               'currency',      st.currency,
               'estimated_cost', case
                 when st.unit_cost is null then null
                 else round(r.required_qty * st.unit_cost, 2)
               end,
               'needs_reorder', st.needs_reorder,
               'active',        st.active,
               'from_flagged_measurement', r.from_flagged_measurement,
               'from_services', r.from_services
             ) as line
        from required r
        join public.ns_material_stock st on st.material_id = r.material_id
    ) lines;

  /* Services measured on this job that nothing is mapped to. Reported
     explicitly, because an empty requirement has two very different
     causes -- "this job needs no parts" and "nobody has told the app what
     this service consumes" -- and a bare empty list looks like the first
     while usually meaning the second. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'service_id',        s.id,
           'service_key',       s.key,
           'service_name',      s.name,
           'service_unit',      s.unit,
           'measured_quantity', me.measured_qty
         ) order by s.sort_order, s.name), '[]'::jsonb)
    into v_unmapped
    from (
      select m.service_id, sum(m.quantity) as measured_qty
        from public.job_measurements m
       where m.job_id = p_job_id and m.quantity > 0
       group by m.service_id
    ) me
    join public.services s on s.id = me.service_id
   where not exists (
     select 1 from public.ns_service_material_usage u
      where u.service_id = me.service_id);

  return jsonb_build_object(
    'job_id',            v_job.id,
    'job_status',        v_job.status,
    'customer_id',       v_job.customer_id,
    'property_id',       v_job.property_id,
    'generated_at',      now(),
    'lines',             v_lines,
    'unmapped_services', v_unmapped
  );
end
$$;

/* Admin-only, and explicitly so for all three routes a privilege can
   arrive by (Batch 7.1). CREATE OR REPLACE preserves existing grants, so a
   re-run cannot quietly widen access either. */
revoke all on function public.estimate_job_materials(uuid) from public;
revoke all on function public.estimate_job_materials(uuid) from anon;
grant execute on function public.estimate_job_materials(uuid) to authenticated;
grant execute on function public.estimate_job_materials(uuid) to service_role;

do $$
begin
  if has_function_privilege('anon', 'public.estimate_job_materials(uuid)', 'execute') then
    raise exception
      'anon still holds EXECUTE on estimate_job_materials after an explicit '
      'revoke from both anon and PUBLIC, so it is INHERITED from a role anon '
      'is a member of. Inspect pg_auth_members for anon and revoke there; '
      'this migration will not guess which role to change.'
      using errcode = 'insufficient_privilege';
  end if;
end
$$;

comment on function public.estimate_job_materials(uuid) is
  'Quantities only: what a job consumes, per the service->material mapping, '
  'against current on-hand stock. Reads the stock ledger, never writes it, '
  'and is not part of the pricing or quote path.';
