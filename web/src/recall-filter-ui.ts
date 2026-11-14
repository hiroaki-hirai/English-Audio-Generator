import {
  saveRecallFilterSettings,
  selectFilteredLessons,
  type RecallFilterLoadStatus,
  type RecallFilterMode,
  type RecallFilterSettings,
} from './recall-filter.js';

type FilterLesson = {
  id: string;
  domain: string;
  scenario: string;
  scenarioJa: string;
  phrases: unknown[];
};

type FilterStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const domainLabels: Array<[string, string]> = [
  ['delivery', 'Delivery English'],
  ['everyday', 'Everyday English'],
  ['etcl', 'ETCL'],
];

const modeLabels: Array<[RecallFilterMode, string]> = [
  ['off', 'OFF'],
  ['include', 'Include selected'],
  ['exclude', 'Exclude selected'],
];

// Uses classes distinct from the existing lesson/training/recall buttons and
// no nested <section>, so existing control counts and layout checks still hold.
export function renderRecallFilter(
  lessons: readonly FilterLesson[],
  settings: RecallFilterSettings,
): string {
  const selected = new Set(settings.lessonIds);
  const modes = modeLabels.map(([value, label]) => `
          <label><input class="recall-filter-mode" type="radio" name="recall-filter-mode" value="${value}"${settings.mode === value ? ' checked' : ''}> ${label}</label>`).join('');
  const categories = domainLabels.map(([domain, label]) => {
    const items = lessons.filter((lesson) => lesson.domain === domain).map((lesson) => `
            <label><input class="recall-filter-lesson" type="checkbox" data-lesson-id="${lesson.id}" data-domain="${domain}"${selected.has(lesson.id) ? ' checked' : ''}> ${lesson.scenarioJa} <span lang="en">${lesson.scenario}</span></label>`).join('');
    return `
          <fieldset class="recall-filter-category" data-domain="${domain}">
            <legend><label><input class="recall-filter-domain" type="checkbox" data-domain="${domain}"> ${label} <span class="recall-filter-domain-count" data-domain="${domain}"></span></label></legend>${items}
          </fieldset>`;
  }).join('');
  return `
        <details class="recall-filter">
          <summary>Active Recall filter: <span class="recall-filter-summary">OFF</span></summary>
          <fieldset class="recall-filter-modes">
            <legend>Filter</legend>${modes}
          </fieldset>${categories}
          <p class="recall-filter-status" aria-live="polite"></p>
        </details>`;
}

export type RecallFilterControls = {
  reportProgressNotSaved: () => void;
};

export function bindRecallFilter(
  root: Pick<HTMLElement, 'querySelectorAll'>,
  lessons: readonly FilterLesson[],
  getStorage: () => FilterStorage,
  loaded: { settings: RecallFilterSettings; status: RecallFilterLoadStatus },
): RecallFilterControls {
  const all = <T extends Element>(selector: string): T[] => Array.from(root.querySelectorAll<T>(selector));
  const modeInputs = all<HTMLInputElement>('.recall-filter-mode');
  const domainInputs = all<HTMLInputElement>('.recall-filter-domain');
  const lessonInputs = all<HTMLInputElement>('.recall-filter-lesson');
  const domainCounts = all<HTMLElement>('.recall-filter-domain-count');
  const [summary] = all<HTMLElement>('.recall-filter-summary');
  const [status] = all<HTMLElement>('.recall-filter-status');
  let settings: RecallFilterSettings = { ...loaded.settings, lessonIds: [...loaded.settings.lessonIds] };
  let notice = loaded.status === 'invalid'
    ? 'Saved filter settings were invalid, so the filter is OFF.'
    : loaded.status === 'unavailable' ? 'Filter settings could not be read on this device; the filter is OFF.' : '';
  let progressNotSaved = false;

  const update = (): void => {
    const selected = new Set(settings.lessonIds);
    for (const [domain] of domainLabels) {
      const members = lessons.filter((lesson) => lesson.domain === domain);
      const count = members.filter((lesson) => selected.has(lesson.id)).length;
      for (const input of domainInputs.filter((item) => item.dataset.domain === domain)) {
        input.checked = members.length > 0 && count === members.length;
        input.indeterminate = count > 0 && count < members.length;
      }
      for (const element of domainCounts.filter((item) => item.dataset.domain === domain)) {
        element.textContent = `(${count}/${members.length})`;
      }
    }
    for (const input of lessonInputs) input.checked = selected.has(input.dataset.lessonId ?? '');
    for (const input of modeInputs) input.checked = input.value === settings.mode;
    const targets = selectFilteredLessons(lessons, settings);
    const phrases = targets.reduce((total, lesson) => total + lesson.phrases.length, 0);
    const label = modeLabels.find(([value]) => value === settings.mode)?.[1] ?? 'OFF';
    const target = `${targets.length} lessons / ${phrases} phrases`;
    if (summary) {
      summary.textContent = (settings.mode === 'off' ? `OFF (${target})` : `${label} — ${phrases === 0 ? 'no phrases; will not start' : target}`)
        + (progressNotSaved ? ' — WARNING: progress is not being saved' : '');
    }
    if (status) {
      status.textContent = [
        `Target: ${target}.`,
        settings.mode !== 'off' && phrases === 0 ? 'Active Recall will not start with this filter.' : '',
        'Changes apply from the next start.',
        notice,
        progressNotSaved ? 'WARNING: Progress for this filter is not being saved (storage full or unavailable). Playback continues, but this position will be lost when you stop. Existing data was not deleted.' : '',
      ].filter(Boolean).join(' ');
    }
  };

  const commit = (next: RecallFilterSettings): void => {
    const order = new Map(lessons.map((lesson, index) => [lesson.id, index]));
    settings = { version: 1, mode: next.mode, lessonIds: [...new Set(next.lessonIds)]
      .sort((a, b) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity) || (a < b ? -1 : 1)) };
    notice = saveRecallFilterSettings(getStorage, settings)
      ? '' : 'Filter settings could not be saved on this device; the next start uses the previously saved settings.';
    update();
  };

  for (const input of modeInputs) {
    input.addEventListener('change', () => {
      if (input.checked) commit({ ...settings, mode: input.value as RecallFilterMode });
    });
  }
  for (const input of domainInputs) {
    input.addEventListener('change', () => {
      const members = lessons.filter((lesson) => lesson.domain === input.dataset.domain).map((lesson) => lesson.id);
      const rest = settings.lessonIds.filter((id) => !members.includes(id));
      commit({ ...settings, lessonIds: input.checked ? [...rest, ...members] : rest });
    });
  }
  for (const input of lessonInputs) {
    input.addEventListener('change', () => {
      const id = input.dataset.lessonId ?? '';
      const rest = settings.lessonIds.filter((item) => item !== id);
      commit({ ...settings, lessonIds: input.checked ? [...rest, id] : rest });
    });
  }
  update();
  return {
    reportProgressNotSaved: () => {
      progressNotSaved = true;
      update();
    },
  };
}
