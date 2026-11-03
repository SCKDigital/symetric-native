/**
 * expopush.ts — thin client for Expo's push notification API.
 *
 * Native (symetric-native) uses Expo push tokens instead of the Web Push
 * Protocol this app's own service worker relies on (see webpush.ts) — no
 * VAPID JWT, no p256dh/auth encryption keys, no per-message signing. Expo's
 * backend fans a token out to APNs/FCM itself, so sending is just one POST
 * per batch (up to 100 messages) to a single fixed endpoint.
 *
 * Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

// Expo's documented maximum messages per request.
const BATCH_SIZE = 100;

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
}

export interface ExpoPushResult {
  to: string;
  ok: boolean;
  /** e.g. 'DeviceNotRegistered' — callers should delete the token on this one. */
  error?: string;
  /** Expo's receipt id for an accepted message. A ticket only means Expo took
   *  the message; whether APNs/FCM delivered it is in the receipt, which is
   *  where a credentials problem shows up. Callers that care can pass these to
   *  fetchExpoPushReceipts a few seconds later. */
  receiptId?: string;
}

type ExpoTicket =
  | { status: 'ok'; id: string }
  | { status: 'error'; message: string; details?: { error?: string } };

/**
 * Sends a batch of Expo push messages, chunked to Expo's 100-per-request
 * limit. Never throws — a chunk-level network failure is reported as a
 * per-message `ok: false` result instead, so callers can treat this the same
 * way they treat individual sendWebPush() outcomes.
 */
export async function sendExpoPushBatch(messages: ExpoPushMessage[]): Promise<ExpoPushResult[]> {
  if (messages.length === 0) return [];

  const results: ExpoPushResult[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const chunk = messages.slice(i, i + BATCH_SIZE);

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        // `sound` and `priority` are deliberate: a check-in expires thirty
        // minutes after it is due, so a reminder that arrives silently, or
        // that Android holds back until the next time the device wakes, is
        // usually a missed check-in. `channelId` is deliberately NOT sent —
        // Expo's own docs are explicit that naming a channel the device has
        // not created means the notification is never displayed at all, and
        // an install that has not run the current app version yet has no
        // channel of ours. Omitting it lets Expo use (and create) its default.
        body: JSON.stringify(chunk.map((m) => ({
          to: m.to,
          title: m.title,
          body: m.body,
          sound: 'default',
          priority: 'high',
        }))),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        for (const m of chunk) {
          results.push({ to: m.to, ok: false, error: `http_${res.status}: ${text.slice(0, 200)}` });
        }
        continue;
      }

      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];

      chunk.forEach((m, idx) => {
        const ticket = tickets[idx];
        if (!ticket) {
          results.push({ to: m.to, ok: false, error: 'no_ticket_returned' });
          return;
        }
        if (ticket.status === 'ok') {
          results.push({ to: m.to, ok: true, receiptId: ticket.id });
          return;
        }
        results.push({ to: m.to, ok: false, error: ticket.details?.error ?? ticket.message });
      });
    } catch (err) {
      for (const m of chunk) {
        results.push({ to: m.to, ok: false, error: `network_error: ${(err as Error).message}` });
      }
    }
  }

  return results;
}

export interface ExpoPushReceipt {
  receiptId: string;
  /** 'ok' once the message reached APNs/FCM; 'error' if delivery failed;
   *  'pending' while Expo has not decided yet. */
  status: 'ok' | 'error' | 'pending';
  /** Expo's machine-readable cause, e.g. 'DeviceNotRegistered',
   *  'MismatchSenderId', 'InvalidCredentials', 'MessageTooBig'. */
  error?: string;
  message?: string;
}

/**
 * Looks up delivery receipts for messages Expo has already accepted.
 *
 * A ticket only says Expo took the message. Everything that goes wrong
 * *after* that — an app whose FCM or APNs credentials are missing, wrong, or
 * revoked — is reported here and nowhere else, which is why a push pipeline
 * with broken credentials looks completely healthy from the ticket side: it
 * accepts every message and delivers none. Anything calling this should allow
 * a few seconds after sending; 'pending' means "ask again later", not a
 * failure.
 *
 * Never throws — a lookup failure comes back as an empty map, since a receipt
 * check is diagnostic and must not break the send path that called it.
 */
export async function fetchExpoPushReceipts(receiptIds: string[]): Promise<Map<string, ExpoPushReceipt>> {
  const out = new Map<string, ExpoPushReceipt>();
  if (receiptIds.length === 0) return out;

  // Expo's receipts endpoint takes the same 100-per-request limit as send.
  for (let i = 0; i < receiptIds.length; i += BATCH_SIZE) {
    const chunk = receiptIds.slice(i, i + BATCH_SIZE);
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ids: chunk }),
      });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        data?: Record<string, { status: 'ok' | 'error'; message?: string; details?: { error?: string } }>;
      };
      const data = json.data ?? {};
      for (const id of chunk) {
        const receipt = data[id];
        if (!receipt) {
          // Expo omits ids it has not resolved yet rather than returning a
          // status for them.
          out.set(id, { receiptId: id, status: 'pending' });
          continue;
        }
        out.set(id, receipt.status === 'ok'
          ? { receiptId: id, status: 'ok' }
          : { receiptId: id, status: 'error', error: receipt.details?.error, message: receipt.message });
      }
    } catch {
      // Leave this chunk out of the map — callers treat a missing receipt the
      // same as 'pending'.
    }
  }

  return out;
}

export interface AcceptedExpoMessage {
  checkInId: string;
  token: string;
  receiptId: string;
}

export interface ReceiptOutcomeSummary {
  /** Tokens the push service has retired — delete these rows. */
  deadTokens: string[];
  /** App-wide credential failures: not one device's problem, every native
   *  push is failing. Distinct error codes, for logging. */
  credentialErrors: string[];
  /** Check-ins where every accepted message came back an error and nothing
   *  else delivered them — their notified_at claim is false. */
  undeliveredCheckIns: string[];
  /** Every individual failure, for the log. */
  errors: Array<{ checkInId: string; error: string }>;
}

/**
 * Works out what a batch of delivery receipts means, separately from the
 * database work that follows — which is the only way any of this is testable
 * without a live push service.
 *
 * A receipt that is missing or still pending counts as delivered, never as
 * failed: Expo recommends reading receipts fifteen minutes after sending and
 * promises nothing sooner, so "no verdict yet" is the normal case, and
 * treating it as failure would retract reminders that did arrive.
 *
 * `deliveredElsewhere` holds check-ins another channel (Web Push) already
 * delivered, so a user whose phone token is dead but whose browser got the
 * reminder is not counted as un-notified.
 */
export function summariseReceiptOutcomes(
  accepted: AcceptedExpoMessage[],
  receipts: Map<string, ExpoPushReceipt>,
  deliveredElsewhere: Set<string> = new Set(),
): ReceiptOutcomeSummary {
  const acceptedPerCheckIn = new Map<string, number>();
  const failedPerCheckIn = new Map<string, number>();
  const deadTokens = new Set<string>();
  const credentialErrors = new Set<string>();
  const errors: Array<{ checkInId: string; error: string }> = [];

  for (const message of accepted) {
    acceptedPerCheckIn.set(message.checkInId, (acceptedPerCheckIn.get(message.checkInId) ?? 0) + 1);

    const receipt = receipts.get(message.receiptId);
    if (receipt?.status !== 'error') continue;

    failedPerCheckIn.set(message.checkInId, (failedPerCheckIn.get(message.checkInId) ?? 0) + 1);
    const code = receipt.error ?? receipt.message ?? 'unknown';
    errors.push({ checkInId: message.checkInId, error: code });

    if (receipt.error === 'DeviceNotRegistered') deadTokens.add(message.token);
    if (receipt.error === 'InvalidCredentials' || receipt.error === 'MismatchSenderId') {
      credentialErrors.add(receipt.error);
    }
  }

  const undeliveredCheckIns = [...failedPerCheckIn.entries()]
    .filter(([checkInId, failed]) => failed === acceptedPerCheckIn.get(checkInId) && !deliveredElsewhere.has(checkInId))
    .map(([checkInId]) => checkInId);

  return {
    deadTokens: [...deadTokens],
    credentialErrors: [...credentialErrors],
    undeliveredCheckIns,
    errors,
  };
}
