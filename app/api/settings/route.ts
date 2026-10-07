import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';

export const dynamic = 'force-dynamic';

/**
 * Everything the Settings page needs: the people who can sign in, and the
 * company numbers every department reads. Only the CEO can change either.
 */
export async function GET() {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile) return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });

  const { data: people } = await sb
    .from('profiles')
    .select('id, email, full_name, role, status, created_at')
    .order('created_at', { ascending: true });

  const { data: settings } = await sb.from('company_settings').select('*').single();
  const { data: prices } = await sb.from('price_book').select('*').order('service');

  return NextResponse.json({ ok: true, people: people || [], settings, prices: prices || [] });
}

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile) return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  if (profile.role !== 'CEO') {
    return NextResponse.json({ ok: false, message: 'Only the CEO can change settings.' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const action: string = body?.action || '';

  // ---- approve, change or suspend a person ----
  if (action === 'person') {
    const { id, role, status } = body;
    if (!id) return NextResponse.json({ ok: false, message: 'Which person?' }, { status: 400 });

    const { error } = await sb.from('profiles').update({ role, status }).eq('id', id);
    if (error) return NextResponse.json({ ok: false, message: error.message });

    await sb.from('audit_log').insert({
      actor_id: user.id,
      actor_email: profile.email,
      action: 'PROFILE_CHANGED',
      entity: 'profiles',
      entity_id: id,
      after_data: { role, status }
    });

    return NextResponse.json({
      ok: true,
      message:
        status === 'ACTIVE'
          ? 'Access switched on. That person can now open the departments their role allows.'
          : 'Access updated.'
    });
  }

  // ---- company numbers that every department uses ----
  if (action === 'company') {
    const allowed = [
      'legal_name', 'display_name', 'phone', 'email', 'website', 'address', 'license_number',
      'service_areas', 'services', 'target_gross_margin', 'minimum_gross_margin',
      'default_deposit_pct', 'tax_reserve_pct', 'waste_pct', 'overhead_pct',
      'contingency_pct', 'payment_fee_pct', 'hourly_labor_rate', 'travel_rate_per_mile',
      'estimate_valid_days'
    ];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    allowed.forEach((k) => {
      if (body[k] !== undefined) patch[k] = body[k];
    });

    const { error } = await sb.from('company_settings').update(patch).eq('id', 1);
    if (error) return NextResponse.json({ ok: false, message: error.message });

    await sb.from('audit_log').insert({
      actor_id: user.id,
      actor_email: profile.email,
      action: 'SETTINGS_CHANGED',
      entity: 'company_settings',
      entity_id: '1',
      after_data: patch
    });

    return NextResponse.json({
      ok: true,
      message: 'Saved. Estimates, Finance and Marketing all read these numbers from here.'
    });
  }

  // ---- the price book the estimator builds on ----
  if (action === 'price') {
    const { id, service, unit, material_unit_cost, labor_unit_cost, notes, active } = body;
    const row = {
      service,
      unit: unit || 'sq ft',
      material_unit_cost: Number(material_unit_cost) || 0,
      labor_unit_cost: Number(labor_unit_cost) || 0,
      notes: notes || null,
      active: active === undefined ? true : !!active
    };

    const res = id
      ? await sb.from('price_book').update(row).eq('id', id)
      : await sb.from('price_book').insert(row);

    if (res.error) return NextResponse.json({ ok: false, message: res.error.message });
    return NextResponse.json({ ok: true, message: 'Price saved.' });
  }

  // ---- switch an AI seat on or off and set what it costs ----
  if (action === 'agent') {
    const { slug, status, monthly_cost, system_prompt } = body;
    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (monthly_cost !== undefined) patch.monthly_cost = Number(monthly_cost) || 0;
    if (system_prompt) patch.system_prompt = system_prompt;

    const { error } = await sb.from('ai_agents').update(patch).eq('slug', slug);
    if (error) return NextResponse.json({ ok: false, message: error.message });
    return NextResponse.json({ ok: true, message: 'Agent updated.' });
  }

  return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
}
