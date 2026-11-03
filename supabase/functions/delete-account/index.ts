import { createClient } from 'npm:@supabase/supabase-js@2';

// Deletes the caller's auth.users row, which a client cannot do itself. Every
// user table cascades from it, either directly (body tracking, push tokens,
// sleep_logs...) or through profiles, which is itself keyed to auth.users.
// Deleting profiles from the client, as the app used to, left the auth-keyed
// tables and the login (and so the email address) behind.
//
// Takes no body: the only account this can delete is the one whose token
// signed the request.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
