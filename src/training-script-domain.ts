// Phase 4B sources remain byte-identical; classify these lessons at read time.
const etclLessonIds = new Set([
  'etcl-01-talking-about-my-job',
  'etcl-02-daily-routine',
  'etcl-03-recent-events',
  'etcl-04-current-situation',
  'etcl-05-reasons-and-decisions',
  'etcl-06-preferences-and-priorities',
  'etcl-07-asking-questions',
  'etcl-08-responding-naturally',
  'etcl-09-past-experiences',
  'etcl-10-explaining-problems',
  'etcl-11-plans-and-possibilities',
  'etcl-12-expressing-opinions',
]);

export function resolveTrainingScriptDomain(id: string, domain: string): string {
  if (!etclLessonIds.has(id)) return domain;

  if (domain !== 'everyday' && domain !== 'etcl') {
    throw new Error(`ETCL lesson ${id} must have everyday or etcl source domain.`);
  }

  return 'etcl';
}
