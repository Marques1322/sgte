import { describe, expect, it } from 'vitest';
import { fatdStageDeadlinesSchema } from '@/features/workspace/domain';

const historicalStages = [
  { stage: 'defesa', due_date: '1999-01-01', status: 'concluido', completed_date: '1999-01-02' },
  { stage: 'revisao_cmt_companhia', due_date: '1999-01-03', status: 'concluido', completed_date: '1999-01-04' },
  { stage: 'julgamento', due_date: null, status: 'pendente', completed_date: null },
] as const;

describe('FATD stage deadlines', () => {
  it('accepts all three stages and manually entered historical dates', () => {
    expect(fatdStageDeadlinesSchema.safeParse({
      document_id: '00000000-0000-4000-8000-000000000001',
      stages: historicalStages,
    }).success).toBe(true);
  });

  it('rejects duplicate stage entries', () => {
    expect(fatdStageDeadlinesSchema.safeParse({
      document_id: '00000000-0000-4000-8000-000000000001',
      stages: [historicalStages[0], historicalStages[0], historicalStages[2]],
    }).success).toBe(false);
  });

  it('requires a completion date only for completed stages', () => {
    const invalidCompleted = historicalStages.map(stage => stage.stage === 'defesa'
      ? { ...stage, completed_date: null }
      : stage);
    const invalidPending = historicalStages.map(stage => stage.stage === 'julgamento'
      ? { ...stage, completed_date: '1999-01-05' }
      : stage);

    expect(fatdStageDeadlinesSchema.safeParse({
      document_id: '00000000-0000-4000-8000-000000000001',
      stages: invalidCompleted,
    }).success).toBe(false);
    expect(fatdStageDeadlinesSchema.safeParse({
      document_id: '00000000-0000-4000-8000-000000000001',
      stages: invalidPending,
    }).success).toBe(false);
  });
});
