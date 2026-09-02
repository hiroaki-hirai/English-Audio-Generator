import './style.css';

import {
  createActiveRecallSessionStore,
  prepareActiveRecallSession,
} from './active-recall.js';
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
const selectedLessonStorageKey = 'eag.selectedLesson.v1';
const activeRecallSessionStorageKey = 'eag.activeRecallSession.v1';
const activeRecallSessionStore = createActiveRecallSessionStore(
  () => window.localStorage,
  activeRecallSessionStorageKey,
);

function loadSelectedLesson(): TrainingScript | undefined {
  const selectedLessonId = localStorage.getItem(selectedLessonStorageKey);

  return lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0];
}

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
        localStorage.setItem(selectedLessonStorageKey, lesson.id);
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
  const lessonAudioUrl =
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/lesson.mp3`;
  const continuousTrainingAudioUrl =
    `${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/continuous-training.mp3`;

  let trainingActive = false;
  let trainingRunId = 0;
  let cancelActiveSegment: (() => void) | null = null;
  let cancelPendingWait: (() => void) | null = null;
  let loopBeforeTraining = audio.loop;

  function setMediaSessionPlaybackState(
    state: MediaSessionPlaybackState,
  ): void {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  function restoreLessonAudio(): void {
    if (audio.src === new URL(lessonAudioUrl, window.location.href).href) {
      return;
    }

    audio.src = lessonAudioUrl;
    audio.load();
  }

  if ('mediaSession' in navigator) {
    if ('MediaMetadata' in window) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: 'Continuous Training',
        artist: 'English Audio Generator',
        album: selectedLesson.scenario,
      });
    }

    navigator.mediaSession.setActionHandler('play', () => {
      void audio.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      audio.pause();
    });
  }

  audio.addEventListener('play', () => setMediaSessionPlaybackState('playing'));
  audio.addEventListener('pause', () => setMediaSessionPlaybackState('paused'));
  audio.addEventListener('ended', () => {
    if (trainingActive && audio.src.endsWith('/continuous-training.mp3')) {
      stopTraining();
    }
  });

  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;

      const finish = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);

        if (cancelPendingWait === finish) {
          cancelPendingWait = null;
        }

        resolve();
      };

      const timeoutId = window.setTimeout(finish, milliseconds);
      cancelPendingWait = finish;
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

  function getPhraseSegments(lessonMetadata: LessonMetadata): PhraseSegment[] {
    return lessonMetadata.phrases.map((phrase, index) => {
      const nextPhrase = lessonMetadata.phrases[index + 1];

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

  async function loadLessonMetadata(
    lessonId: string,
  ): Promise<LessonMetadata> {
    const response = await fetch(
      `${import.meta.env.BASE_URL}lessons/${lessonId}/metadata.json`,
    );

    if (!response.ok) {
      throw new Error(`Failed to load metadata for ${lessonId}.`);
    }

    return (await response.json()) as LessonMetadata;
  }

  async function useLessonAudio(lessonId: string): Promise<void> {
    const audioUrl = `${import.meta.env.BASE_URL}lessons/${lessonId}/lesson.mp3`;
    const absoluteAudioUrl = new URL(audioUrl, window.location.href).href;

    if (audio.src !== absoluteAudioUrl) {
      audio.src = audioUrl;
      audio.load();
    }

    await waitForAudioMetadata();
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
    trainingActive = true;
    trainingRunId += 1;

    const runId = trainingRunId;
    const preparedSession = prepareActiveRecallSession(
      lessons,
      activeRecallSessionStore.load(),
    );
    const { queue, session } = preparedSession;

    activeRecallSessionStore.save(session);

    loopBeforeTraining = audio.loop;
    audio.loop = false;

    trainingButton.disabled = true;
    activeRecallButton.textContent = 'Stop Active Recall';

    try {
      const metadataPromisesByLessonId = new Map<
        string,
        Promise<LessonMetadata>
      >();

      const getLessonMetadata = (lessonId: string): Promise<LessonMetadata> => {
        const existingPromise = metadataPromisesByLessonId.get(lessonId);

        if (existingPromise) {
          return existingPromise;
        }

        const metadataPromise = loadLessonMetadata(lessonId);

        metadataPromisesByLessonId.set(lessonId, metadataPromise);
        return metadataPromise;
      };

      for (
        let queueIndex = session.currentIndex;
        queueIndex < queue.length;
        queueIndex += 1
      ) {
        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const entry = queue[queueIndex];

        if (!entry) {
          throw new Error(`Active Recall queue entry ${queueIndex} is missing.`);
        }

        session.currentIndex = queueIndex;
        activeRecallSessionStore.save(session);

        trainingStatus.textContent = `Phrase ${queueIndex + 1} / ${queue.length} — Meaning`;

        await speakJapaneseCue(entry.ja);

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        trainingStatus.textContent = `Phrase ${queueIndex + 1} / ${queue.length} — Recall`;

        const recallDelay = wait(recallMilliseconds);

        // Prepare English media during Recall so the Japanese cue starts first.
        const [entryMetadata] = await Promise.all([
          getLessonMetadata(entry.lessonId),
          useLessonAudio(entry.lessonId),
          recallDelay,
        ]);

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        const segment = getPhraseSegments(entryMetadata)[entry.phraseIndex];

        if (!segment) {
          throw new Error(
            `Phrase segment was not found for ${entry.lessonId}:${entry.phraseIndex}.`,
          );
        }

        const weakPhraseKey = getWeakPhraseKey(
          entry.lessonId,
          entry.phraseIndex,
        );

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

          trainingStatus.textContent = `Phrase ${queueIndex + 1} / ${queue.length} — ${phase}`;

          await playSegment(segment, runId);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          if (repetition < repetitions - 1) {
            await wait(repeatGapMilliseconds);
          }
        }
      }

      if (trainingActive && trainingRunId === runId) {
        activeRecallSessionStore.clear();
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
        restoreLessonAudio();

        trainingButton.disabled = false;
        activeRecallButton.textContent = 'Start Active Recall';
        trainingStatus.textContent = 'Training stopped';
      }
    }
  }

  async function runTraining(): Promise<void> {
    const hasWeakPhrases = selectedLesson.phrases.some((_, index) =>
      weakPhrases.has(getWeakPhraseKey(selectedLesson.id, index)),
    );

    if (!hasWeakPhrases) {
      trainingActive = true;
      trainingRunId += 1;
      loopBeforeTraining = audio.loop;
      audio.loop = false;
      audio.src = continuousTrainingAudioUrl;
      trainingButton.textContent = 'Stop Training';
      activeRecallButton.disabled = true;
      trainingStatus.textContent = 'Continuous Training playing';

      try {
        await audio.play();
      } catch (error) {
        console.error('Continuous Training playback failed:', error);
        stopTraining();
      }

      return;
    }

    await waitForAudioMetadata();

    trainingActive = true;
    trainingRunId += 1;

    const runId = trainingRunId;
    const segments = getPhraseSegments(metadata);

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

    cancelPendingWait?.();
    cancelPendingWait = null;

    audio.pause();
    audio.loop = loopBeforeTraining;
    restoreLessonAudio();

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

      restoreLessonAudio();
      await waitForAudioMetadata();

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

const initialLesson = loadSelectedLesson();

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
