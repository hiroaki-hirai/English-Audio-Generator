import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build } from 'vite';

class Control {
  readonly handlers = new Map<string, unknown[]>();
  constructor(readonly classes: string, readonly textContent: string) {}
  addEventListener(type: string, listener: unknown): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), listener]);
  }
}

// Only the DOM operations needed during initial rendering are implemented.
// Buttons come from main.ts's actual rendered HTML, not a copied button list.
function createInitialPage(metadata: unknown) {
  let buttons: Control[] = [];
  const audio = new Control('', '');
  const app = {
    set innerHTML(html: string) {
      buttons = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(match =>
        new Control(match[1]!.match(/class="([^"]*)"/)?.[1] ?? '', match[2]!.trim()));
    },
    querySelectorAll(selector: string): Control[] {
      return buttons.filter(button => button.classes.split(/\s+/).includes(selector.slice(1)));
    },
    querySelector(selector: string) {
      if (selector === 'audio') return audio;
      if (selector === '.training-button') return this.querySelectorAll(selector)[0];
      if (['.training-status', '.resume-diagnostic', '.japanese-cue-mode'].includes(selector)) {
        return { textContent: '', value: 'speech-synthesis' };
      }
      throw new Error(`Unexpected initial DOM query: ${selector}`);
    },
  };
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const requests: string[] = [];
  const context = {
    document: {
      createElement: () => ({ relList: { supports: () => true } }),
      querySelector: (selector: string) => selector === '#app' ? app : null,
      addEventListener: () => {},
    },
    window: { localStorage: storage, addEventListener: () => {} },
    localStorage: storage,
    navigator: {},
    console,
    fetch: async (url: string) => {
      requests.push(url);
      return { ok: true, json: async () => metadata };
    },
    __trainingInitialization: undefined as Promise<void> | undefined,
  };
  return { app, context, requests };
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
