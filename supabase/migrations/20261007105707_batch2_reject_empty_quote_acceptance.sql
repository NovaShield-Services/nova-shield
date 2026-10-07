-- Batch 2: a quote with no line items must not be acceptable.
--
-- Ordering: runs after 20261006230637_phase_c_repair_calculate_job_pricing_overload.
-- Does not modify any already-applied migration.
--
-- THE GAP
--
-- respond_to_quote's provisional-pricing guard is:
--
--   select coalesce(bool_and(pricing_approved), true) into v_all_approved
--   from public.quote_line_items where quote_id = p_quote_id;
--
-- bool_and() over zero rows returns NULL, so coalesce(..., true) treats "this
-- quote has no lines at all" as "every line is approved". A 0-line quote
-- therefore passed every check and accepted cleanly: ns_quotes went to
-- 'accepted', ns_jobs went to 'accepted', and a quote_response notification
-- was queued -- for a quote containing no work and no money. The coalesce is
-- correct for its own purpose (a quote whose lines are all approved should
-- not be blocked), so the emptiness case needs its own explicit check rather
-- than a change to that expression.
--
-- WHAT CHANGES
--
-- One new guard, inside the existing `if p_response = 'accepted'` block and
-- placed BEFORE the pricing-approval check so that:
--   * declining an empty quote still works -- there is nothing unsafe about
--     a customer saying no to an empty document, and an admin may well have
--     sent one by mistake and want it closed off;
--   * the "Final pricing is still pending confirmation" message is still the
--     one a customer sees when lines exist but are provisional. An empty
--     quote is a different fault and says so.
--
-- Everything else in this function is carried over unchanged: the
-- accepted/declined validation, the not-found and not-'sent' checks, the
-- provisional-pricing guard, the option-group pre-check, both status
-- updates, the sibling supersede, and the notification insert. The
-- provisional guard is deliberately NOT relaxed -- this migration only adds
-- a case that was previously allowed through.

create or replace function public.respond_to_quote(p_quote_id uuid, p_response text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job             uuid;
  v_status          text;
  v_option_group_id uuid;
  v_all_approved    boolean;
begin
  if p_response not in ('accepted','declined') then
    raise exception 'Invalid response.' using errcode = 'check_violation';
  end if;

  select job_id, status, option_group_id into v_job, v_status, v_option_group_id
  from public.ns_quotes where id = p_quote_id;

  if v_job is null then
    raise exception 'Quote not found.' using errcode = 'no_data_found';
  end if;
  if v_status <> 'sent' then
    raise exception 'This quote is no longer open for a response.'
      using errcode = 'check_violation';
  end if;

  -- Declining a provisional price is always fine; only ACCEPTING it risks
  -- silently presenting an unapproved rate as commercially finalized
  -- (Phase 16's audit finding -- neither accept path checked this before).
  if p_response = 'accepted' then
    -- An empty quote has nothing to buy. Checked before the approval guard
    -- below, whose bool_and()/coalesce treats "no rows" as "all approved".
    if not exists (
      select 1 from public.quote_line_items where quote_id = p_quote_id
    ) then
      raise exception 'This quote has no line items, so there is nothing to accept yet.'
        using errcode = 'check_violation';
    end if;

    select coalesce(bool_and(pricing_approved), true) into v_all_approved
    from public.quote_line_items where quote_id = p_quote_id;

    if not v_all_approved then
      raise exception 'Final pricing is still pending confirmation. We will confirm your pricing before this quote can be accepted.'
        using errcode = 'check_violation';
    end if;

    -- Option-group acceptance: a friendly pre-check for the common case.
    -- The actual, race-proof guarantee is the partial unique index
    -- ns_quotes_one_accepted_per_option_group -- if two accept requests for
    -- two different siblings genuinely race, whichever UPDATE below commits
    -- first wins and the other hits a unique-violation and rolls back.
    if v_option_group_id is not null and exists (
      select 1 from public.ns_quotes
      where option_group_id = v_option_group_id and status = 'accepted'
    ) then
      raise exception 'Another option in this proposal has already been accepted.'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.ns_quotes
     set status = p_response, responded_at = now()
   where id = p_quote_id;
  update public.ns_jobs set status = p_response where id = v_job;

  if v_option_group_id is not null and p_response = 'accepted' then
    update public.ns_quotes set status = 'superseded'
    where option_group_id = v_option_group_id and id <> p_quote_id and status = 'sent';
  end if;

  insert into public.notifications (kind, channel, subject, payload, job_id)
  values ('quote_response', 'email',
          'Quote ' || p_response, jsonb_build_object('quote_id', p_quote_id), v_job);

  return p_response;
end
$function$;
