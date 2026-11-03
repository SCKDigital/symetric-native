import { createClient } from 'npm:@supabase/supabase-js@2';

// Records onboarding age/consent answers with server-observed IP + user agent,
// which the client cannot supply itself. Routed through a function (rather than
// a direct client-side profiles.update, as before) purely so this metadata can
// be stamped from the request instead of trusted from the caller. Field list is
// an explicit whitelist, not a blind spread of the request body, so this stays
// a single-purpose consent-recording endpoint rather than a general
// service-role "update my profile" backdoor.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsentPayload {
  date_of_birth: string;
  age_confirmed_18: boolean;
  mind_not_health_service_ack: boolean;
  mind_data_consent: boolean;
  body_tracking_enabled: boolean;
  cycle_tracking_enabled: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json() as Partial<ConsentPayload>;

    if (
      typeof body.date_of_birth !== 'string' ||
      typeof body.age_confirmed_18 !== 'boolean' ||
      typeof body.mind_not_health_service_ack !== 'boolean' ||
      typeof body.mind_data_consent !== 'boolean' ||
      typeof body.body_tracking_enabled !== 'boolean' ||
      typeof body.cycle_tracking_enabled !== 'boolean'
    ) {
      return new Response(JSON.stringify({ error: 'Invalid consent payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // x-forwarded-for can carry a proxy chain — the client's address is the first entry.
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent');

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        date_of_birth: body.date_of_birth,
        age_confirmed_18: body.age_confirmed_18,
        mind_not_health_service_ack: body.mind_not_health_service_ack,
        mind_data_consent: body.mind_data_consent,
        mind_consent_recorded_at: now,
        body_tracking_enabled: body.body_tracking_enabled,
        body_consent_recorded_at: body.body_tracking_enabled ? now : null,
        cycle_tracking_enabled: body.cycle_tracking_enabled,
        cycle_consent_recorded_at: body.cycle_tracking_enabled ? now : null,
        consent_ip_address: ipAddress,
        consent_user_agent: userAgent,
        onboarding_complete: true,
      })
      .eq('id', user.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
