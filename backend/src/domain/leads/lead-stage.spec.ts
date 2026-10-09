import { canTransitionLeadStage } from './lead-stage.js';

describe('lead stage domain transitions', () => {
  it('allows only the declared funnel transitions', () => {
    expect(canTransitionLeadStage('NEW', 'CONTACTED')).toBe(true);
    expect(canTransitionLeadStage('QUALIFIED', 'NEGOTIATION')).toBe(true);
    expect(canTransitionLeadStage('LOST', 'CONTACTED')).toBe(true);
    expect(canTransitionLeadStage('NEW', 'WON')).toBe(false);
    expect(canTransitionLeadStage('WON', 'CONTACTED')).toBe(false);
  });
});
