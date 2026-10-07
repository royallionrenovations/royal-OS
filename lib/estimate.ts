/**
 * The estimator maths, in its own library file.
 *
 * It lives here rather than inside the API route because Next.js route files
 * may only export handlers (GET, POST and a few reserved names). Anything a
 * page also needs has to live outside a route file, or the build refuses it.
 *
 * Used by:
 *   app/api/estimate/route.ts   (compute and save)
 *   app/(app)/estimates/page.tsx (show a worked example)
 */

export type EstimateInput = {
  material_cost: number;
  waste_pct: number;
  labor_cost: number;
  subcontract_cost: number;
  disposal_cost: number;
  travel_cost: number;
  equipment_cost: number;
  overhead_pct: number;
  contingency_pct: number;
  payment_fee_pct: number;
  target_margin: number;
  discount: number;
  tax_rate: number;
};

export type EstimateOutput = {
  waste_cost: number;
  overhead_cost: number;
  contingency_cost: number;
  payment_fee_cost: number;
  total_cost: number;
  subtotal: number;
  tax_amount: number;
  total: number;
  gross_profit: number;
  gross_margin: number;
  below_floor: boolean;
  deposit: number;
  balance: number;
  warnings: string[];
};

/**
 * The order follows the specification: materials, waste, labor, subcontractors,
 * disposal, travel and equipment are all direct cost. Overhead and contingency
 * are percentages of that direct cost, card fees apply to the total, and only
 * then is the margin applied.
 *
 * The margin divides rather than multiplies. A 40% margin means 40% of the
 * price is profit, so the price is cost divided by one minus the margin. Adding
 * 40% to the cost is a different, smaller number, and using that one is how a
 * contractor works a whole job for nothing.
 */
export function computeEstimate(
  i: EstimateInput,
  floorMargin = 0.35,
  depositPct = 0.4
): EstimateOutput {
  const waste = i.material_cost * (i.waste_pct || 0);

  const direct =
    i.material_cost + waste + i.labor_cost + (i.subcontract_cost || 0) +
    (i.disposal_cost || 0) + (i.travel_cost || 0) + (i.equipment_cost || 0);

  const overhead = direct * (i.overhead_pct || 0);
  const contingency = direct * (i.contingency_pct || 0);
  const beforeFees = direct + overhead + contingency;
  const fees = beforeFees * (i.payment_fee_pct || 0);
  const totalCost = beforeFees + fees;

  const margin = Math.min(0.9, Math.max(0, i.target_margin || 0));
  const subtotalRaw = margin >= 1 ? totalCost * 2 : totalCost / (1 - margin);
  const subtotal = Math.max(0, subtotalRaw - (i.discount || 0));
  const tax = subtotal * (i.tax_rate || 0);
  const total = subtotal + tax;
  const grossProfit = subtotal - totalCost;
  const grossMargin = subtotal > 0 ? grossProfit / subtotal : 0;

  const warnings: string[] = [];
  if (grossMargin < floorMargin) {
    warnings.push(
      "This price leaves a gross margin of " + (grossMargin * 100).toFixed(1) +
      "%, which is under your " + (floorMargin * 100).toFixed(0) +
      "% floor. Raise the target margin, or cut materials and labor, before this goes out."
    );
  }
  if (i.material_cost > 0 && waste === 0) {
    warnings.push("Waste is set to zero. Even a straight room loses about five percent to cuts and breakage.");
  }
  if ((i.disposal_cost || 0) === 0) {
    warnings.push("No disposal cost. If you are pulling up the old floor, someone pays to dump it.");
  }
  if ((i.contingency_pct || 0) === 0) {
    warnings.push("No contingency. On an older home the subfloor is the usual surprise, and it is not free.");
  }

  return {
    waste_cost: waste,
    overhead_cost: overhead,
    contingency_cost: contingency,
    payment_fee_cost: fees,
    total_cost: totalCost,
    subtotal,
    tax_amount: tax,
    total,
    gross_profit: grossProfit,
    gross_margin: grossMargin,
    below_floor: grossMargin < floorMargin,
    deposit: subtotal * depositPct,
    balance: subtotal * (1 - depositPct),
    warnings
  };
}
