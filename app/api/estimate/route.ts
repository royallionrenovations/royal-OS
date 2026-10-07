import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { currentProfile } from '@/lib/access';
import { computeEstimate, type EstimateInput } from '@/lib/estimate';

export const dynamic = 'force-dynamic';

/* The estimator maths lives in lib/estimate.ts, so both this route and the
   Estimates page can use it. Next.js route files may only export handlers. */

export async function POST(req: Request) {
  const sb = supabaseServer();
  const { user, profile } = await currentProfile(sb);
  if (!user || !profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ ok: false, message: 'Not signed in.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const input = (body?.input || {}) as EstimateInput;
  const action = body?.action || 'compute';

  const { data: s } = await sb
    .from('company_settings')
    .select('minimum_gross_margin, default_deposit_pct')
    .single();

  const floor = Number(s?.minimum_gross_margin) || 0.35;
  const deposit = Number(s?.default_deposit_pct) || 0.4;
  const out = computeEstimate(input, floor, deposit);

  if (action === 'compute') return NextResponse.json({ ok: true, result: out });

  if (action === 'save') {
    const customerName = body?.customer_name || null;
    const projectTitle = body?.project_title || null;

    const { data: est, error } = await sb
      .from('estimates')
      .insert({
        customer_name: customerName,
        project_title: projectTitle,
        project_address: body?.project_address || null,
        project_type: body?.project_type || 'Residential',
        material_cost: Number(input.material_cost) || 0,
        waste_pct: Number(input.waste_pct) || 0,
        waste_cost: out.waste_cost,
        labor_cost: Number(input.labor_cost) || 0,
        subcontract_cost: Number(input.subcontract_cost) || 0,
        disposal_cost: Number(input.disposal_cost) || 0,
        travel_cost: Number(input.travel_cost) || 0,
        equipment_cost: Number(input.equipment_cost) || 0,
        overhead_cost: out.overhead_cost,
        contingency_cost: out.contingency_cost,
        payment_fee_cost: out.payment_fee_cost,
        total_cost: out.total_cost,
        target_margin: Number(input.target_margin) || 0,
        subtotal: out.subtotal,
        discount: Number(input.discount) || 0,
        tax_amount: out.tax_amount,
        total: out.total,
        gross_profit: out.gross_profit,
        gross_margin: out.gross_margin,
        deposit_pct: deposit,
        deposit_amount: out.deposit,
        scope_of_work: body?.scope_of_work || null,
        optional_upgrades: body?.optional_upgrades || null,
        status: out.below_floor ? 'DRAFT' : 'WAITING_APPROVAL',
        valid_until: body?.valid_until || null,
        customer_id: body?.customer_id || null,
        lead_id: body?.lead_id || null
      })
      .select('id, estimate_number')
      .single();

    if (error) return NextResponse.json({ ok: false, message: error.message });

    await sb.from('audit_log').insert({
      actor_id: user.id,
      actor_email: profile.email,
      action: 'ESTIMATE_CREATED',
      entity: 'estimates',
      entity_id: est?.id,
      after_data: { total: out.total, margin: out.gross_margin }
    });

    return NextResponse.json({
      ok: true,
      estimateId: est?.id,
      number: est?.estimate_number,
      result: out,
      message: out.below_floor
        ? 'Saved as a draft, because the margin is under your floor. Fix the price before sending it.'
        : 'Saved and waiting for your approval. Nothing is sent until you approve it.'
    });
  }

  return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 });
}
