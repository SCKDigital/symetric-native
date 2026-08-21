import { supabase } from '@/lib/supabase';

// Scoped port of the one function MindSetup needs from the web app's
// src/lib/milestoneDetection.ts (332 lines covering many other milestone
// types unrelated to onboarding) — port the rest here if/when those other
// milestones get built.
export async function recordFirstCheckinsScheduledMilestone(userId: string): Promise<void> {
  await supabase
    .from('milestones_achieved')
    .upsert({ user_id: userId, milestone_type: 'first_checkins_scheduled' }, { onConflict: 'user_id,milestone_type', ignoreDuplicates: true } as never);
}
