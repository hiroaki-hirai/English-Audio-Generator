import './style.css';

import lessonsData from './training-lessons.json';

type TrainingPhrase = {
  en: string;
  ja: string;
};

type TrainingScript = {
  id: string;
  scenario: string;
  scenarioJa: string;
  phrases: TrainingPhrase[];
};

type PhraseMetadata = {
  index: number;
  start: number;
};

type LessonMetadata = {
  phrases: PhraseMetadata[];
};

type PhraseSegment = {
  start: number;
  end: number;
};

const lessons = lessonsData as TrainingScript[];

const weakPhrasesStorageKey = 'eag.weakPhrases.v1';

function getWeakPhraseKey(lessonId: string, phraseIndex: number): string {
  return `${lessonId}:${phraseIndex}`;
}

function loadWeakPhrases(): Set<string> {
  const storedValue = localStorage.getItem(weakPhrasesStorageKey);

  if (!storedValue) {
    return new Set();
  }

  try {
    const parsedValue = JSON.parse(storedValue);

    if (!Array.isArray(parsedValue)) {
      return new Set();
    }

    return new Set(
      parsedValue.filter((value): value is string => typeof value === 'string'),
    );
  } catch {
    return new Set();
  }
}

function saveWeakPhrases(weakPhrases: Set<string>): void {
  localStorage.setItem(weakPhrasesStorageKey, JSON.stringify([...weakPhrases]));
}

const weakPhrases = loadWeakPhrases();

const app = document.querySelector<HTMLDivElement>('#app');

let stopCurrentTraining: (() => void) | null = null;

if (!app) {
  throw new Error('App root was not found.');
}

async function renderLesson(selectedLesson: TrainingScript): Promise<void> {
  const metadataResponse = await fetch(
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/metadata.json`,
  );

  if (!metadataResponse.ok) {
    throw new Error(`Failed to load metadata for ${selectedLesson.id}.`);
  }

  const metadata = (await metadataResponse.json()) as LessonMetadata;

  const lessonButtons = lessons
    .map(
      (lesson) => `
        <button
          class="lesson-button"
          type="button"
          data-lesson-id="${lesson.id}"
          aria-pressed="${lesson.id === selectedLesson.id}"
        >
          <strong>${lesson.scenarioJa}</strong>
          <span>${lesson.scenario}</span>
        </button>
      `,
    )
    .join('');

  const phrases = selectedLesson.phrases
    .map((phrase, index) => {
      const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, index);
      const isWeak = weakPhrases.has(weakPhraseKey);

      return `
        <li>
          <button
            class="phrase-button"
            type="button"
            data-phrase-index="${index}"
          >
            <strong>${phrase.en}</strong>
          </button>

          <span>${phrase.ja}</span>

          <button
            class="weak-button"
            type="button"
            data-phrase-index="${index}"
            aria-pressed="${isWeak}"
          >
            ${isWeak ? '★ Weak' : '☆ Weak'}
          </button>
        </li>
      `;
    })
    .join('');

  const player = `
    <div class="player">
      <audio
        controls
        loop
        preload="metadata"
        src="${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/lesson.mp3"
      ></audio>

      <button
        class="training-button"
        type="button"
      >
        Start Training
      </button>

      <button
        class="active-recall-button"
        type="button"
      >
        Start Active Recall
      </button>

      <p class="training-status" aria-live="polite">
        Training stopped
      </p>
    </div>
  `;

  app.innerHTML = `
    <section class="app-shell">
      <header>
        <p class="eyebrow">English Audio Generator</p>
        <h1>Delivery English Training</h1>
      </header>

      <nav class="lesson-selector" aria-label="Basic training lessons">
        <p class="lesson-label">Basic Training</p>
        <div class="lesson-buttons">
          ${lessonButtons}
        </div>
      </nav>

      <section class="lesson-card" aria-live="polite">
        <h2>${selectedLesson.scenario}</h2>
        <p class="scenario-ja">${selectedLesson.scenarioJa}</p>

        ${player}

        <ol class="phrases">
          ${phrases}
        </ol>
      </section>
    </section>
  `;

  const buttons = app.querySelectorAll<HTMLButtonElement>('.lesson-button');

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const lesson = lessons.find(
        (candidate) => candidate.id === button.dataset.lessonId,
      );

      if (lesson) {
        stopCurrentTraining?.();
        void renderLesson(lesson);
      }
    });
  });

  const audio = app.querySelector<HTMLAudioElement>('audio');

  if (!audio) {
    throw new Error('Audio player was not found.');
  }

  const trainingButton =
    app.querySelector<HTMLButtonElement>('.training-button');

  const activeRecallButton = app.querySelector<HTMLButtonElement>(
    '.active-recall-button',
  );

  const trainingStatus =
    app.querySelector<HTMLParagraphElement>('.training-status');

  if (!trainingButton || !activeRecallButton || !trainingStatus) {
    throw new Error('Training controls were not found.');
  }

  const repeatGapMilliseconds = 0;
  const trainingSeekLeadSeconds = 0.5;
  const recallMilliseconds = 5000;
  const originalSilenceSeconds = 5;

  let trainingActive = false;
  let trainingRunId = 0;
  let cancelActiveSegment: (() => void) | null = null;
  let loopBeforeTraining = audio.loop;

  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, milliseconds);
    });
  }

  let cancelJapaneseCue: (() => void) | null = null;

  function speakJapaneseCue(text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const utterance = new SpeechSynthesisUtterance(text);

      utterance.lang = 'ja-JP';

      const cleanup = (): void => {
        utterance.removeEventListener('end', handleEnd);
        utterance.removeEventListener('error', handleError);

        if (cancelJapaneseCue === cancel) {
          cancelJapaneseCue = null;
        }
      };

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };

      const cancel = (): void => {
        window.speechSynthesis.cancel();
        finish();
      };

      const handleEnd = (): void => {
        finish();
      };

      const handleError = (event: SpeechSynthesisErrorEvent): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(`Japanese cue playback failed: ${event.error}`));
      };

      cancelJapaneseCue = cancel;

      utterance.addEventListener('end', handleEnd);
      utterance.addEventListener('error', handleError);

      window.speechSynthesis.speak(utterance);
    });
  }

  function waitForAudioMetadata(): Promise<void> {
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      audio.addEventListener('loadedmetadata', () => resolve(), {
        once: true,
      });
    });
  }

  function getPhraseSegments(): PhraseSegment[] {
    return metadata.phrases.map((phrase, index) => {
      const nextPhrase = metadata.phrases[index + 1];

      const blockEnd = nextPhrase?.start ?? audio.duration;

      const interPhraseSilence =
        nextPhrase === undefined ? 0 : originalSilenceSeconds;

      const blockDuration = blockEnd - phrase.start - interPhraseSilence;

      const phraseDuration = (blockDuration - originalSilenceSeconds) / 2;

      return {
        start: phrase.start,
        end: phrase.start + phraseDuration,
      };
    });
  }

  function playSegment(segment: PhraseSegment, runId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = (): void => {
        audio.removeEventListener('timeupdate', handleTimeUpdate);

        if (cancelActiveSegment === cancel) {
          cancelActiveSegment = null;
        }
      };

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve();
      };

      const cancel = (): void => {
        finish();
      };

      const handleTimeUpdate = (): void => {
        if (!trainingActive || trainingRunId !== runId) {
          finish();
          return;
        }

        if (audio.currentTime >= segment.end) {
          audio.pause();
          finish();
        }
      };

      cancelActiveSegment = cancel;

      audio.currentTime = Math.max(0, segment.start - trainingSeekLeadSeconds);
      audio.addEventListener('timeupdate', handleTimeUpdate);

      void audio.play().catch((error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      });
    });
  }

  async function runActiveRecall(): Promise<void> {
    await waitForAudioMetadata();

    trainingActive = true;
    trainingRunId += 1;

    const runId = trainingRunId;
    const segments = getPhraseSegments();

    loopBeforeTraining = audio.loop;
    audio.loop = false;

    trainingButton.disabled = true;
    activeRecallButton.textContent = 'Stop Active Recall';

    try {
      for (const [index, segment] of segments.entries()) {
        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const phrase = selectedLesson.phrases[index];

        if (!phrase) {
          continue;
        }

        trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — Meaning`;

        await speakJapaneseCue(phrase.ja);

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — Recall`;

        await wait(recallMilliseconds);

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, index);

        const repetitions = weakPhrases.has(weakPhraseKey) ? 3 : 2;

        for (let repetition = 0; repetition < repetitions; repetition += 1) {
          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          const phase =
            repetition === 0
              ? 'Answer'
              : repetition === 1
                ? 'Repeat'
                : 'Weak Repeat';

          trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — ${phase}`;

          await playSegment(segment, runId);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          if (repetition < repetitions - 1) {
            await wait(repeatGapMilliseconds);
          }
        }
      }
    } catch (error) {
      console.error('Active Recall playback failed:', error);
    } finally {
      if (trainingRunId === runId) {
        trainingActive = false;

        cancelJapaneseCue?.();
        cancelJapaneseCue = null;

        audio.pause();
        audio.loop = loopBeforeTraining;

        trainingButton.disabled = false;
        activeRecallButton.textContent = 'Start Active Recall';
        trainingStatus.textContent = 'Training stopped';
      }
    }
  }

  async function runTraining(): Promise<void> {
    await waitForAudioMetadata();

    trainingActive = true;
    trainingRunId += 1;

    const runId = trainingRunId;
    const segments = getPhraseSegments();

    loopBeforeTraining = audio.loop;
    audio.loop = false;
    trainingButton.textContent = 'Stop Training';
    activeRecallButton.disabled = true;

    try {
      for (const [index, segment] of segments.entries()) {
        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, index);

        const repetitions = weakPhrases.has(weakPhraseKey) ? 3 : 2;

        for (let repetition = 0; repetition < repetitions; repetition += 1) {
          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          const phase =
            repetition === 0
              ? 'Listen'
              : repetition === 1
                ? 'Repeat'
                : 'Weak Repeat';

          trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — ${phase}`;

          await playSegment(segment, runId);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          if (repetition < repetitions - 1) {
            await wait(repeatGapMilliseconds);
          }
        }

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        trainingStatus.textContent = `Phrase ${index + 1} / ${segments.length} — Recall`;

        await wait(recallMilliseconds);
      }
    } catch (error) {
      console.error('Training playback failed:', error);
    } finally {
      if (trainingRunId === runId) {
        trainingActive = false;
        audio.pause();
        audio.loop = loopBeforeTraining;
        trainingButton.textContent = 'Start Training';
        activeRecallButton.disabled = false;
        trainingStatus.textContent = 'Training stopped';
      }
    }
  }

  function stopTraining(): void {
    trainingActive = false;
    trainingRunId += 1;

    cancelActiveSegment?.();
    cancelActiveSegment = null;

    cancelJapaneseCue?.();
    cancelJapaneseCue = null;

    audio.pause();
    audio.loop = loopBeforeTraining;

    trainingButton.disabled = false;
    trainingButton.textContent = 'Start Training';

    activeRecallButton.disabled = false;
    activeRecallButton.textContent = 'Start Active Recall';

    trainingStatus.textContent = 'Training stopped';
  }

  stopCurrentTraining = stopTraining;

  activeRecallButton.addEventListener('click', () => {
    if (trainingActive) {
      stopTraining();
      return;
    }

    void runActiveRecall();
  });

  trainingButton.addEventListener('click', () => {
    if (trainingActive) {
      stopTraining();
      return;
    }

    void runTraining();
  });

  const phraseButtons =
    app.querySelectorAll<HTMLButtonElement>('.phrase-button');

  phraseButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      if (trainingActive) {
        stopTraining();
      }

      const phraseIndex = Number(button.dataset.phraseIndex);
      const phraseMetadata = metadata.phrases.find(
        (candidate) => candidate.index === phraseIndex,
      );

      if (!phraseMetadata) {
        return;
      }

      const seekLeadSeconds = 0.5;
      const requestedTime = Math.max(0, phraseMetadata.start - seekLeadSeconds);

      audio.currentTime = requestedTime;

      try {
        await audio.play();
      } catch (error) {
        console.error('Failed to play lesson audio:', error);
      }
    });
  });

  const weakButtons = app.querySelectorAll<HTMLButtonElement>('.weak-button');

  weakButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const phraseIndex = Number(button.dataset.phraseIndex);

      if (!Number.isInteger(phraseIndex)) {
        return;
      }

      const weakPhraseKey = getWeakPhraseKey(selectedLesson.id, phraseIndex);

      const isCurrentlyWeak = weakPhrases.has(weakPhraseKey);

      if (isCurrentlyWeak) {
        weakPhrases.delete(weakPhraseKey);
      } else {
        weakPhrases.add(weakPhraseKey);
      }

      saveWeakPhrases(weakPhrases);

      const isWeak = weakPhrases.has(weakPhraseKey);

      button.textContent = isWeak ? '★ Weak' : '☆ Weak';
      button.setAttribute('aria-pressed', String(isWeak));
    });
  });
}

const initialLesson =
  lessons.find((lesson) => lesson.id === 'cash-payment') ?? lessons[0];

if (!initialLesson) {
  throw new Error('No training lessons were found.');
}

void renderLesson(initialLesson);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((error: unknown) => {
        console.error('Failed to register service worker:', error);
      });
  });
}
