import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'vite';
import { prepareActiveRecallSession } from '../web/src/active-recall.js';
import { trainingJapaneseCueMp3Path } from '../web/src/training-japanese-cue.js';

class Control {
  readonly handlers = new Map<string, Array<() => void>>();
  dataset: Record<string, string> = {};
  disabled = false;
  src = ''; currentSrc = ''; currentTime = 0; duration = 300;
  readyState = 4; networkState = 1; paused = true; loop = false; error = null;
  plays = 0;
  constructor(readonly classes: string, readonly textContent: string) {}
  addEventListener(type: string, listener: () => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }
  removeEventListener(type: string, listener: () => void): void {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter(value => value !== listener));
  }
  emit(type: string): void { for (const listener of [...(this.handlers.get(type) ?? [])]) listener(); }
  play(): Promise<void> { this.plays += 1; this.paused = false; this.emit('play'); this.emit('playing'); return Promise.resolve(); }
  pause(): void { this.paused = true; }
  load(): void {}
}

// Only the DOM operations needed during initial rendering are implemented.
// Buttons come from main.ts's actual rendered HTML, not a copied button list.
function createInitialPage(metadata: unknown, saved: Record<string, string> = {}) {
  let buttons: Control[] = [];
  let selectedMode = '';
  let renderedHtml = '';
  const japaneseAudio: Control[] = [];
  const utterances: Control[] = [];
  const audio = new Control('', '');
  const diagnostic = { textContent: '' };
  const app = {
    set innerHTML(html: string) {
      renderedHtml = html;
      selectedMode = html.match(/<option value="([^"]*)" selected>/)?.[1] ?? '';
      buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match => {
        const button = new Control(match[1]!.match(/class="([^"]*)"/)?.[1] ?? '', match[2]!.trim());
        for (const attribute of match[1]!.matchAll(/data-([a-z-]+)="([^"]*)"/g)) {
          button.dataset[attribute[1]!.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())] = attribute[2]!;
        }
        return button;
      });
    },
    querySelectorAll(selector: string): Control[] {
      return buttons.filter(button => button.classes.split(/\s+/).includes(selector.slice(1)));
    },
    querySelector(selector: string) {
      if (selector === 'audio') return audio;
      if (selector === '.training-button') return this.querySelectorAll(selector)[0];
      if (selector === '.resume-diagnostic') return diagnostic;
      if (['.training-status', '.resume-diagnostic', '.japanese-cue-mode'].includes(selector)) {
        return { textContent: '', get value() { return selectedMode; } };
      }
      throw new Error(`Unexpected initial DOM query: ${selector}`);
    },
  };
  const storage = { getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = value; }, removeItem: (key: string) => { delete saved[key]; } };
  const requests: string[] = [];
  const context = {
    document: {
      createElement: () => ({ relList: { supports: () => true } }),
      querySelector: (selector: string) => selector === '#app' ? app : null,
      addEventListener: () => {},
    },
    window: { localStorage: storage, addEventListener: () => {}, location: { href: 'https://example.test/EAG/' },
      setTimeout: (callback: () => void) => { queueMicrotask(callback); return 1; }, clearTimeout: () => {},
      speechSynthesis: { speaking: false, pending: false, paused: false,
        speak: (utterance: Control) => { utterances.push(utterance); utterance.emit('start'); }, cancel: () => {} } },
    localStorage: storage,
    navigator: {},
    console,
    URL, performance,
    Audio: class extends Control {
      constructor() { super('', ''); japaneseAudio.push(this); }
    },
    SpeechSynthesisUtterance: class extends Control {
      constructor(text: string) { super('', text); }
    },
    fetch: async (url: string) => {
      requests.push(url);
      return { ok: true, json: async () => url.endsWith('/metadata.json')
        ? JSON.parse(readFileSync(`web/public/${url.replace('/English-Audio-Generator/', '')}`, 'utf8'))
        : metadata };
    },
    __trainingInitialization: undefined as Promise<void> | undefined,
  };
  return { app, context, requests, japaneseAudio, utterances, audio, diagnostic, selectedMode: () => selectedMode,
    selectMode: (value: string) => { selectedMode = value; }, renderedHtml: () => renderedHtml, saved };
}

async function bundleInitialPage(useOldGuard = false): Promise<string> {
  const entry = resolve('web/src/main.ts');
  const result = await build({
    configFile: false,
    root: resolve('web'),
    base: '/English-Audio-Generator/',
    logLevel: 'silent',
    plugins: [{
      name: 'observe-training-initialization',
      enforce: 'pre',
      transform(source, id) {
        if (resolve(id) !== entry) return;
        // Capture the real async render promise so failures can be asserted
        // without an unhandled rejection. No application logic is replaced.
        assert.ok(source.includes('void renderLesson(initialLesson);'));
        let code = source.replace('void renderLesson(initialLesson);',
          'globalThis.__trainingInitialization = renderLesson(initialLesson);');
        if (useOldGuard) {
          assert.ok(code.includes('activeRecallButtons.length !== 5'));
          code = code.replace('activeRecallButtons.length !== 5', 'activeRecallButtons.length !== 4');
        }
        return code;
      },
    }],
    build: { write: false, rollupOptions: { input: entry } },
  });
  assert.ok(!Array.isArray(result) && 'output' in result);
  const chunk = result.output.find(output => output.type === 'chunk' && output.isEntry);
  assert.ok(chunk?.type === 'chunk');
  return chunk.code;
}

test('actual initial page renders five recall buttons and registers every Start handler', async () => {
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata);
  runInNewContext(await bundleInitialPage(), page.context);
  assert.ok(page.context.__trainingInitialization);
  await page.context.__trainingInitialization;
  const recallButtons = page.app.querySelectorAll('.active-recall-button');
  const startButtons = page.app.querySelectorAll('.training-button');
  assert.equal(recallButtons.length, 5);
  assert.equal(startButtons.length, 6);
  assert.equal(page.selectedMode(), 'mp3');
  for (const button of startButtons) {
    assert.equal(button.handlers.get('click')?.length, 1, `${button.textContent} has a click handler`);
  }
  assert.deepEqual(page.requests, ['/English-Audio-Generator/lessons/basic-delivery/metadata.json']);
});

test('old four-button guard rejects the actual five-button page before any Start registration', async () => {
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata);
  runInNewContext(await bundleInitialPage(true), page.context);
  assert.ok(page.context.__trainingInitialization);
  await assert.rejects(page.context.__trainingInitialization, /Training controls were not found\./);
  assert.equal(page.app.querySelectorAll('.active-recall-button').length, 5);
  for (const button of page.app.querySelectorAll('.training-button')) {
    assert.equal(button.handlers.get('click')?.length ?? 0, 0);
  }
});

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

test('actual Start handlers select normal assets in all modes and retain diagnostic assets', async () => {
  const code = await bundleInitialPage();
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  for (const mode of ['global', 'sequential-category', 'sequential-category-order']) {
    const page = createInitialPage(metadata);
    runInNewContext(code, page.context);
    await page.context.__trainingInitialization;
    const button = page.app.querySelectorAll('.active-recall-button').find(button =>
      button.dataset.activeRecallMode === mode && !button.dataset.diagnosticFresh)!;
    button.emit('click');
    assert.equal(page.japaneseAudio.length, 1);
    assert.match(page.japaneseAudio[0]!.src, /^\/English-Audio-Generator\/lessons\/[^/]+\/japanese-cues\/phrase-\d{3}\.mp3$/);
    assert.equal(page.audio.plays, 0, 'English waits for Japanese ended');
    button.emit('click');
    await flush();
  }
  for (const label of ['Start Fresh 3-Cue A/B Test', 'Start Fresh 20-Cue MP3 Diagnostic']) {
    const page = createInitialPage(metadata);
    runInNewContext(code, page.context);
    await page.context.__trainingInitialization;
    const button = page.app.querySelectorAll('.active-recall-button').find(button => button.textContent === label)!;
    button.emit('click');
    assert.match(page.japaneseAudio[0]!.src, /^\/English-Audio-Generator\/diagnostics\//);
    button.emit('click');
    await flush();
    assert.deepEqual(page.saved, {}, 'Fresh diagnostics never persist normal state');
  }
});

test('actual normal playback uses one Japanese cue and two English plays, or three for Weak', async () => {
  const code = await bundleInitialPage();
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  for (const repetitions of [2, 3]) {
    const saved: Record<string, string> = repetitions === 3 ? { 'eag.weakPhrases.v1': JSON.stringify(['basic-delivery:0']) } : {};
    const page = createInitialPage(metadata, saved);
    runInNewContext(code, page.context);
    await page.context.__trainingInitialization;
    const button = page.app.querySelectorAll('.active-recall-button').find(button =>
      button.dataset.activeRecallMode === 'sequential-category-order' && !button.dataset.diagnosticFresh)!;
    button.emit('click');
    const japanese = page.japaneseAudio[0]!;
    assert.equal(japanese.plays, 1);
    assert.equal(page.audio.plays, 0);
    japanese.emit('ended');
    await flush();
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      assert.equal(page.audio.plays, repetition);
      assert.equal(japanese.plays, 1, 'English repeats do not repeat Japanese');
      page.audio.currentTime = 1000;
      page.audio.emit('timeupdate');
      await flush();
    }
    assert.equal(japanese.plays, 2, 'Next Japanese cue starts after English repetitions');
    assert.match(japanese.src, /phrase-002\.mp3$/);
    button.emit('click');
    await flush();
    if (repetitions === 3) assert.equal(page.saved['eag.weakPhrases.v1'], JSON.stringify(['basic-delivery:0']));
  }
});

test('actual Resume restores Japanese identity without changing saved queue, round or Weak state', async () => {
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8'));
  const ordered = [...lessons.filter((lesson: { domain: string }) => lesson.domain === 'delivery'),
    ...lessons.filter((lesson: { domain: string }) => lesson.domain === 'everyday')];
  const initial = prepareActiveRecallSession(ordered, null, undefined, 'sequential-category-order');
  initial.session.currentIndex = 43;
  const entry = initial.queue[43]!;
  const saved = {
    'eag.sequentialCategoryOrderedActiveRecallSession.v1': JSON.stringify(initial.session),
    'eag.sequentialCategoryOrderedActiveRecallDiagnosticRound.v1': JSON.stringify({ version: 1, currentRound: 2, lastCompletedRound: 1 }),
    'eag.weakPhrases.v1': JSON.stringify([`${entry.lessonId}:${entry.phraseIndex}`]),
  };
  const before = JSON.stringify(saved);
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata, saved);
  runInNewContext(await bundleInitialPage(), page.context);
  await page.context.__trainingInitialization;
  const button = page.app.querySelectorAll('.active-recall-button').find(button =>
    button.dataset.activeRecallMode === 'sequential-category-order' && !button.dataset.diagnosticFresh)!;
  button.emit('click');
  assert.equal(page.japaneseAudio[0]!.src, `/English-Audio-Generator/${trainingJapaneseCueMp3Path(entry.lessonId, entry.phraseIndex)}`);
  assert.equal(page.japaneseAudio[0]!.currentTime, 0);
  button.emit('click');
  await flush();
  assert.equal(JSON.stringify(saved), before);
});

test('actual normal Training still starts the continuous English track', async () => {
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata);
  runInNewContext(await bundleInitialPage(), page.context);
  await page.context.__trainingInitialization;
  const button = page.app.querySelectorAll('.training-button').find(button => button.textContent === 'Start Training')!;
  button.emit('click');
  await flush();
  assert.match(page.audio.src, /lessons\/basic-delivery\/continuous-training\.mp3$/);
  assert.equal(page.audio.plays, 1);
  assert.equal(page.japaneseAudio.length, 0);
  button.emit('click');
  await flush();
});

test('actual legacy selection speaks Japanese and does not create an MP3 element', async () => {
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata);
  runInNewContext(await bundleInitialPage(), page.context);
  await page.context.__trainingInitialization;
  page.selectMode('speech-synthesis');
  const button = page.app.querySelectorAll('.active-recall-button').find(button =>
    button.dataset.activeRecallMode === 'sequential-category-order' && !button.dataset.diagnosticFresh)!;
  button.emit('click');
  assert.equal(page.utterances.length, 1);
  assert.equal(page.japaneseAudio.length, 0);
  assert.equal(page.audio.plays, 0);
  page.utterances[0]!.emit('end');
  await flush();
  assert.equal(page.audio.plays, 1);
  button.emit('click');
  await flush();
});

test('a full 65-phrase Weak round retains its transition history within the 4000-event bound', async () => {
  const lessons = JSON.parse(await readFile('web/src/training-lessons.json', 'utf8')) as Array<{ id: string; phrases: unknown[] }>;
  const weak = lessons.flatMap(lesson => lesson.phrases.map((_phrase, index) => `${lesson.id}:${index}`));
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata, { 'eag.weakPhrases.v1': JSON.stringify(weak) });
  runInNewContext(await bundleInitialPage(), page.context);
  await page.context.__trainingInitialization;
  const button = page.app.querySelectorAll('.active-recall-button').find(button =>
    button.dataset.activeRecallMode === 'global')!;
  button.emit('click');
  const japanese = page.japaneseAudio[0]!;
  for (let index = 0; index < 65; index += 1) {
    assert.equal(japanese.plays, index + 1);
    japanese.emit('playing');
    japanese.emit('ended');
    await flush();
    for (let repeat = 0; repeat < 3; repeat += 1) {
      page.audio.emit('seeking');
      page.audio.emit('seeked');
      assert.equal(page.audio.plays, index * 3 + repeat + 1);
      page.audio.currentTime = 1000;
      page.audio.emit('timeupdate');
      await flush();
    }
  }
  assert.equal(japanese.plays, 66, 'Normal training retains next-round behavior');
  const lines = page.diagnostic.textContent;
  const retained = Number(lines.match(/retained (\d+)\/4000/)?.[1]);
  assert.ok(retained > 2000 && retained < 4000);
  assert.match(lines, /active-recall start/);
  assert.match(lines, /"queueIndex":64/);
  assert.match(lines, /japanese-mp3 ended/);
  assert.match(lines, /english seek-setting/);
  assert.match(lines, /english play-call/);
  assert.match(lines, /english playing/);
  assert.match(lines, /english play-resolved/);
  button.emit('click');
  await flush();
});


test('actual UI groups controls, places cue mode first and closes diagnostics by default', async () => {
  const metadata = JSON.parse(await readFile('web/public/lessons/basic-delivery/metadata.json', 'utf8'));
  const page = createInitialPage(metadata);
  runInNewContext(await bundleInitialPage(), page.context);
  await page.context.__trainingInitialization;
  const html = page.renderedHtml();
  assert.ok(html.indexOf('class="cue-mode-setting"') < html.indexOf('class="control-group training-controls"'));
  assert.match(html, /Used for Active Recall/);
  assert.match(html, /value="mp3" selected>MP3 \(recommended\)/);
  for (const [group, labels] of [
    ['training-controls', ['Start Training']],
    ['recall-controls', ['Start Global Shuffle Active Recall', 'Start Sequential Category Shuffle', 'Start Sequential Category Order']],
    ['diagnostic-controls', ['Start Fresh 3-Cue A/B Test', 'Start Fresh 20-Cue MP3 Diagnostic']],
  ] as const) {
    const section = html.match(new RegExp(`<section class="control-group ${group}"[^>]*>([\\s\\S]*?)</section>`))?.[1];
    assert.ok(section, group);
    for (const label of labels) assert.ok(section.includes(label), label);
  }
  assert.match(html, /<details class="diagnostic-details">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(html, /<summary>Resume \/ Audio transition diagnostics<\/summary>/);
  assert.match(html, /class="resume-diagnostic"/);
  page.selectMode('speech-synthesis');
  const start = page.app.querySelectorAll('.active-recall-button').find(button =>
    button.dataset.activeRecallMode === 'sequential-category-order' && !button.dataset.diagnosticFresh)!;
  start.emit('click');
  assert.equal(page.utterances.length, 1, 'selector still selects legacy speech');
  assert.equal(page.japaneseAudio.length, 0);
  assert.equal(start.textContent, 'Stop Active Recall');
  start.emit('click');
  await flush();
});
