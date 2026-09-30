import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* Shared by the public site and the admin tool so the project reference and
   key can never drift between the two.

   The publishable (anon) key is safe in the browser: anon has no table grants
   except the public service menu and two whitelisted settings keys. Everything
   else is denied before RLS is even consulted, and writes go through
   submit_quote_request() which validates server-side. */
export const SUPABASE_URL = 'https://xrgutmdgjzclaeyugsqg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_sh-M40urSjGvRODkAP7mFg_itg8ZUfY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/** Resolves the signed-in user and whether they are an admin. */
export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { session: null, isAdmin: false };

  const { data, error } = await supabase.rpc('is_admin');
  if (error) return { session, isAdmin: false, error };
  return { session, isAdmin: data === true };
}
