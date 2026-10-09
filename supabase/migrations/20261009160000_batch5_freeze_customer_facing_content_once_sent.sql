-- Batch 5: freeze a quote's customer-facing prose once it has been sent.
--
-- Batch 5 adds an admin editor for ns_quotes.customer_notes and
-- ns_quotes.terms -- the two fields get_customer_quote returns and
-- site/quote.html renders as its notes and terms blocks. Until now nothing
-- in the admin could edit them, so nothing could rewrite them either.
--
-- Verified against the live database as an admin, in a rolled-back
-- transaction, before writing this:
--
--   draft customer_notes/terms update : allowed   (correct)
--   SENT  customer_notes/terms update : ALLOWED   <-- the hole
--   SENT  internal_notes update       : allowed   (intended, staff scratch)
--
-- So the new editor would have been able to change what a customer had
-- already received, on a quote whose money and line labels this batch just
-- went to some trouble to freeze. The admin UI only offers the editor on a
-- draft, but a UI gate is not the guarantee -- this is.
--
-- Scoped deliberately narrowly, by column and by prior status:
--   * only customer_notes and terms. internal_notes stays editable at any
--     status: it is private staff scratch that the customer never sees, and
--     being able to annotate a sent quote is the point of it.
--   * keyed on OLD.status, the state before the update. mark_quote_sent and
--     send_option_group move a row draft -> sent without touching these
--     columns, so they pass on both counts; respond_to_quote and expiry only
--     move status on an already-sent row and touch neither column;
--     duplicate_quote inserts rather than updates. Checked each one.
--
-- Changing this text on a sent quote is what a new version is for -- the same
-- rule the line items and totals already follow.

create or replace function public.guard_quote_customer_content_frozen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'draft'
     and (new.customer_notes is distinct from old.customer_notes
          or new.terms is distinct from old.terms) then
    raise exception
      'Quote % is % - the customer-facing note and terms are frozen once sent. Create a new version instead.',
      old.id, old.status
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists ns_quotes_customer_content_draft_only on public.ns_quotes;

create trigger ns_quotes_customer_content_draft_only
before update on public.ns_quotes
for each row execute function public.guard_quote_customer_content_frozen();
