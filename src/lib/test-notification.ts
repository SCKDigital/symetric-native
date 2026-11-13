import { syncPushToken } from '@/lib/push-notifications';
import { supabase } from '@/lib/supabase';

/**
 * Sends this device a test notification. Shared by Settings and the reminders
 * step of first-run setup, which offers a test straight after reminders are
 * turned on so a broken setup is found on day one, not after a missed day.
 *
 * Registers this device's token first. A test that fails only because the
 * stored token is stale is the single most common way this reports a problem
 * the user cannot act on, and re-registering is what "toggle it off and on"
 * was really doing.
 *
 * `ok` means the push service accepted it, not that it appeared — only the
 * person holding the phone can say that, which is why setup follows a
 * successful send with "Did it arrive?".
 */
export async function sendTestNotification(userId: string): Promise<{ ok: boolean; message: string }> {
  await syncPushToken(userId);
  const { error } = await supabase.functions.invoke('send-test-notification');
  return error
    ? { ok: false, message: await describeTestFailure(error) }
    : { ok: true, message: 'Notification sent - check your device.' };
}

/**
 * Turns a failed send-test-notification call into something that says what
 * went wrong. It used to read "Failed to send. Try toggling notifications off
 * and on." for every possible cause — a device that was never registered, a
 * token the push service has retired, missing FCM/APNs credentials on the
 * server, and a plain network drop all produced the same sentence, and only
 * one of them was fixable by toggling anything.
 *
 * supabase-js reports a non-2xx response as a FunctionsHttpError whose
 * `context` is the raw Response, so the function's own error code is only
 * reachable by reading that body.
 */
export async function describeTestFailure(error: unknown): Promise<string> {
  let code = '';
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.json();
      code = String(body?.error ?? '');
    } catch {
      // Non-JSON body (a gateway error page, say) — fall through to the
      // generic message below rather than showing HTML to the user.
    }
  }

  if (code === 'no_subscription') {
    return 'This device isn’t registered for notifications. Turn Push notifications off, then on again.';
  }
  if (code === 'DeviceNotRegistered' || code === 'subscription_expired') {
    return 'This device’s registration has expired. Turn Push notifications off, then on again.';
  }
  if (code === 'InvalidCredentials' || code === 'MismatchSenderId') {
    // Nothing the user can do — the app's own push credentials are wrong.
    return `Notifications aren’t set up correctly for this build (${code}). This needs fixing in the app, not on your device.`;
  }
  if (code === 'MessageRateExceeded') {
    return 'Too many test notifications just now. Wait a minute and try again.';
  }
  if (code) return `Failed to send: ${code}`;
  return 'Failed to send. Check your connection and try again.';
}
