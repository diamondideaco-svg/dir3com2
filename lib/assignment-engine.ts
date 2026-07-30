import type { SupabaseClient } from '@supabase/supabase-js';

export interface ShieldScoreInput {
  averageRating?: number | null;
  onTimeRate?: number | null;
  cancellationRate?: number | null;
  complaints?: number | null;
  shieldLevel?: string | null;
}

export function calculateShieldScore(input: ShieldScoreInput) {
  const averageRatingScore = ((input.averageRating ?? 0) / 5) * 40;
  const onTimeScore = ((input.onTimeRate ?? 0) / 100) * 20;
  const cancellationScore = ((100 - (input.cancellationRate ?? 0)) / 100) * 15;
  const complaintsScore = (((100 - Math.max(0, input.complaints ?? 0) * 10) / 100) * 15);

  const shieldLevelMap: Record<string, number> = {
    basic: 50,
    silver: 70,
    gold: 85,
    platinum: 100,
  };

  const shieldLevelScore = ((shieldLevelMap[(input.shieldLevel ?? '').toLowerCase()] ?? 60) / 100) * 10;
  const score = averageRatingScore + onTimeScore + cancellationScore + complaintsScore + shieldLevelScore;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function autoAssignBooking(supabase: SupabaseClient, bookingId: string, assignedBy = 'system') {
  const { data: booking, error: bookingError } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (bookingError || !booking) {
    return { success: false, error: 'Booking not found' };
  }

  const [rulesResult, partnersResult, performanceResult, availabilityResult] = await Promise.all([
    supabase.from('assignment_rules').select('*').eq('enabled', true),
    supabase.from('partners').select('*').eq('status', 'active'),
    supabase.from('partner_performance').select('*'),
    supabase.from('partner_availability').select('*'),
  ]);

  const rules = (rulesResult.data || []) as Array<{ service_type?: string | null; priority_weight?: number | null }>;
  const partners = (partnersResult.data || []) as Array<{ id: string; company_name?: string | null; city?: string | null; status?: string | null; shield_level?: string | null }>;
  const performance = (performanceResult.data || []) as Array<{ partner_id: string; average_rating?: number | null; on_time_rate?: number | null; cancelled_bookings?: number | null; complaints?: number | null; total_bookings?: number | null }>;
  const availability = (availabilityResult.data || []) as Array<{ partner_id: string; date?: string | null; available?: boolean | null }>;

  const bookingCity = booking.city || booking.destination || '';
  const bookingService = booking.service_name || booking.service_type || 'DIR3 Stay';

  const filteredPartners = partners.filter((partner) => {
    const matchesCity = !bookingCity || !partner.city || partner.city === bookingCity;
    const matchesService = !rules.length || rules.some((rule) => rule.service_type === bookingService || !rule.service_type);
    const hasAvailability = !availability.length || availability.some((entry) => entry.partner_id === partner.id && entry.available !== false);
    return matchesCity && matchesService && hasAvailability;
  });

  const scoredCandidates = filteredPartners.map((partner) => {
    const stats = performance.find((entry) => entry.partner_id === partner.id);
    const averageRating = stats?.average_rating ?? 4.5;
    const onTimeRate = stats?.on_time_rate ?? 95;
    const cancellationRate = stats?.total_bookings ? ((stats.cancelled_bookings ?? 0) / stats.total_bookings) * 100 : 5;
    const complaints = stats?.complaints ?? 0;
    const shieldScore = calculateShieldScore({
      averageRating,
      onTimeRate,
      cancellationRate,
      complaints,
      shieldLevel: partner.shield_level,
    });

    return {
      partner,
      score: shieldScore,
      reason: `Score ${shieldScore} based on rating ${averageRating}/5, punctuality ${onTimeRate}% and complaints ${complaints}`,
    };
  });

  scoredCandidates.sort((left, right) => right.score - left.score);
  const selectedCandidate = scoredCandidates[0];

  if (!selectedCandidate) {
    return { success: false, error: 'No eligible partners found' };
  }

  const assignmentPayload = {
    booking_id: bookingId,
    partner_id: selectedCandidate.partner.id,
    assignment_status: 'assigned',
    assigned_by: assignedBy,
    notes: `Auto-assigned with shield score ${selectedCandidate.score}`,
  };

  const { data: assignment, error: assignmentError } = await supabase.from('partner_assignments').insert(assignmentPayload).select().single();
  if (assignmentError || !assignment) {
    return { success: false, error: assignmentError?.message || 'Assignment failed' };
  }

  await supabase.from('assignment_logs').insert({
    booking_id: bookingId,
    partner_id: selectedCandidate.partner.id,
    score: selectedCandidate.score,
    decision_reason: selectedCandidate.reason,
    assigned_by: assignedBy,
  });

  await supabase.from('bookings').update({ status: 'Assigned' }).eq('id', bookingId);

  return { success: true, assignment, partner: selectedCandidate.partner, score: selectedCandidate.score };
}

export async function assignPartnerToBooking(supabase: SupabaseClient, bookingId: string, partnerId: string, assignedBy = 'admin', reason = 'Manual assignment') {
  const assignmentPayload = {
    booking_id: bookingId,
    partner_id: partnerId,
    assignment_status: 'assigned',
    assigned_by: assignedBy,
    notes: reason,
  };

  const { data: assignment, error } = await supabase.from('partner_assignments').insert(assignmentPayload).select().single();
  if (error || !assignment) {
    return { success: false, error: error?.message || 'Assignment failed' };
  }

  await supabase.from('assignment_logs').insert({
    booking_id: bookingId,
    partner_id: partnerId,
    score: 100,
    decision_reason: reason,
    assigned_by: assignedBy,
  });

  await supabase.from('bookings').update({ status: 'Assigned' }).eq('id', bookingId);
  return { success: true, assignment };
}

export async function recalculateShieldScore(supabase: SupabaseClient, bookingId: string) {
  const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
  if (!booking) {
    return { success: false, error: 'Booking not found' };
  }

  const { data: assignment } = await supabase.from('partner_assignments').select('*').eq('booking_id', bookingId).order('assigned_at', { ascending: false }).limit(1).single();
  const { data: performance } = await supabase.from('partner_performance').select('*').eq('partner_id', assignment?.partner_id).single();
  const score = calculateShieldScore({
    averageRating: performance?.average_rating ?? 4.5,
    onTimeRate: performance?.on_time_rate ?? 95,
    cancellationRate: performance?.total_bookings ? ((performance.cancelled_bookings ?? 0) / performance.total_bookings) * 100 : 5,
    complaints: performance?.complaints ?? 0,
    shieldLevel: booking.partner_level ?? 'gold',
  });

  await supabase.from('assignment_logs').insert({
    booking_id: bookingId,
    partner_id: assignment?.partner_id,
    score,
    decision_reason: 'Recalculated shield score',
    assigned_by: 'admin',
  });

  return { success: true, score };
}
