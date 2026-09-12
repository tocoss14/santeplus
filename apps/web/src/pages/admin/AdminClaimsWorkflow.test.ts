import { describe, expect, it } from 'vitest';
import { claimWorkflowStage } from './AdminClaimsWorkflow';

describe('claimWorkflowStage', () => {
  it('maps canonical claim statuses to instruction stages', () => {
    expect(claimWorkflowStage('DRAFT')).toMatchObject({ stage: 0, terminal: false });
    expect(claimWorkflowStage('SUBMITTED')).toMatchObject({ stage: 1, terminal: false });
    expect(claimWorkflowStage('UNDER_REVIEW')).toMatchObject({ stage: 2, terminal: false });
    expect(claimWorkflowStage('INFO_REQUESTED')).toMatchObject({ stage: 2, terminal: false });
    expect(claimWorkflowStage('APPROVED')).toMatchObject({ stage: 3, terminal: false });
    expect(claimWorkflowStage('PAID')).toMatchObject({ stage: 4, terminal: true });
    expect(claimWorkflowStage('REJECTED')).toMatchObject({ terminal: true });
  });
});
