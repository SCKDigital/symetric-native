import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { parseDateString } from '@/lib/date-utils';
import type { Appointment } from '@/lib/supabase';
import { BRAND, brandTint } from '@/constants/brand';

// Port of the web app's AppointmentReminderCard.tsx. Native's Today screen
// never had this — an appointment set on the web simply didn't show on the
// phone, which is the one place you'd want the reminder.
//
// Shown only when the appointment is within the next seven days; the caller
// owns that rule, exactly as TodayScreen.tsx does on the web.

function fmtDate(dateStr: string): string {
  return parseDateString(dateStr).toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

/** Whole days from today to `dateStr`, both taken at local midnight. */
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appt = parseDateString(dateStr);
  appt.setHours(0, 0, 0, 0);
  return Math.round((appt.getTime() - today.getTime()) / 86_400_000);
}

function daysLabel(dateStr: string): string {
  const diff = daysUntil(dateStr);
  if (diff === 0) return 'Appointment today';
  if (diff === 1) return 'Appointment tomorrow';
  return `Appointment in ${diff} days`;
}

export default function AppointmentReminderCard({ appointment }: { appointment: Appointment }) {
  return (
    <Pressable
      onPress={() => router.push('/prepare')}
      accessibilityRole="button"
      accessibilityLabel={`${daysLabel(appointment.appointment_date)}, ${fmtDate(appointment.appointment_date)}. Review in Prepare.`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Text style={styles.days}>{daysLabel(appointment.appointment_date)}</Text>
      <Text style={styles.date}>{fmtDate(appointment.appointment_date)}</Text>
      <Text style={styles.link}>Review in Prepare →</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brandTint(BRAND.fill, 0.07),
    borderWidth: 1,
    borderColor: brandTint(BRAND.fill, 0.2),
    borderLeftWidth: 3,
    borderLeftColor: BRAND.text,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  pressed: { opacity: 0.7 },
  days: { fontSize: 13, fontWeight: '600', color: BRAND.text, marginBottom: 3 },
  date: { fontSize: 14, color: '#c8d0e0', marginBottom: 6 },
  link: { fontSize: 12, color: BRAND.fillAlt },
});
