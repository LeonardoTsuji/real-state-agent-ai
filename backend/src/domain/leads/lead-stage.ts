export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'QUALIFIED'
  | 'VISIT_SCHEDULED'
  | 'NEGOTIATION'
  | 'WON'
  | 'LOST';

const allowedTransitions: Record<LeadStage, readonly LeadStage[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT_SCHEDULED', 'NEGOTIATION', 'LOST'],
  VISIT_SCHEDULED: ['QUALIFIED', 'NEGOTIATION', 'LOST'],
  NEGOTIATION: ['WON', 'LOST'],
  WON: [],
  LOST: ['CONTACTED'],
};

export function canTransitionLeadStage(
  from: LeadStage,
  to: LeadStage,
): boolean {
  return from === to || allowedTransitions[from].includes(to);
}
