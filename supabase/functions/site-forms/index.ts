import { createClient } from 'npm:@supabase/supabase-js@2';

// Receives the marketing site's two forms, the homepage waitlist and the
// /support contact form. The site is static and ships no form JavaScript, so
// these arrive as ordinary form posts and are answered with a 303 back to a
// page on the site: a thank-you on success, /form-error otherwise.
//
// Contact messages are stored (contact_messages) and emailed to support@ via
// Resend with reply-to set to the visitor, so replying from the inbox answers
// them directly. Storing first means a failed send loses nothing.
//
// `company` is a honeypot: hidden from people, filled in by bots. A submission
// with it set gets the thank-you page and is otherwise dropped.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const SITE_URL = 'https://symetric.app';
// Redirects go back to whichever of these the form was posted from, so the
// dev server's forms land on the dev server's pages.
const ALLOWED_ORIGINS = [SITE_URL, 'https://www.symetric.app', 'http://localhost:4321'];

const NOTIFY_TO = 'support@symetric.app';
const NOTIFY_FROM = 'symetric website <website@symetric.app>';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REASONS = ['general', 'support'];

function redirect(origin: string, path: string) {
  return new Response(null, { status: 303, headers: { Location: origin + path } });
}

async function readFields(req: Request): Promise<Record<string, string>> {
  if ((req.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await req.json();
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
  }
  const form = await req.formData();
  const fields: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === 'string') fields[k] = v;
  return fields;
}

Deno.serve(async (req) => {
  const requestOrigin = req.headers.get('origin') ?? '';
  const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : SITE_URL;

  if (req.method !== 'POST') return redirect(origin, '/');

  try {
    const fields = await readFields(req);
    const form = fields.form;
    const thanks = form === 'contact' ? '/thanks/message' : '/thanks/waitlist';

    if (fields.company) return redirect(origin, thanks);

    const email = (fields.email ?? '').trim().toLowerCase();
    if (email.length > 254 || !EMAIL_RE.test(email)) return redirect(origin, '/form-error');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (form === 'waitlist') {
      const { error } = await supabase
        .from('waitlist')
        .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw error;
      return redirect(origin, thanks);
    }

    if (form === 'contact') {
      const reason = fields.reason ?? '';
      const message = (fields.message ?? '').trim();
      if (!REASONS.includes(reason) || !message || message.length > 5000) {
        return redirect(origin, '/form-error');
      }

      const { data: row, error } = await supabase
        .from('contact_messages')
        .insert({ email, reason, message })
        .select('id')
        .single();
      if (error) throw error;

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: NOTIFY_FROM,
          to: [NOTIFY_TO],
          reply_to: email,
          subject: `Website: ${reason === 'support' ? 'App support' : 'General enquiry'} from ${email}`,
          text: `${message}\n\n---\nFrom: ${email}\nReason: ${reason}\nMessage id: ${row.id}`,
        }),
      });
      if (res.ok) {
        await supabase.from('contact_messages').update({ notified: true }).eq('id', row.id);
      } else {
        // Stored, so not lost; the visitor still gets the thank-you.
        console.error('site-forms: Resend send failed', res.status, await res.text());
      }
      return redirect(origin, thanks);
    }

    return redirect(origin, '/form-error');
  } catch (err) {
    console.error('site-forms:', (err as Error).message);
    return redirect(origin, '/form-error');
  }
});
