import './style.css';

import {
  createNextActiveRecallRound,
  createActiveRecallSessionStore,
  prepareActiveRecallSession,
  prepareActiveRecallRoundState,
  type ActiveRecallQueueMode,
  type ActiveRecallRoundState,
} from './active-recall.js';
import lessonsData from './training-lessons.json';

type TrainingPhrase = {
  en: string;
  ja: string;
};

type TrainingScript = {
  id: string;
  domain: 'delivery' | 'everyday';
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
const lessonsByDomain = [
  ...lessons.filter((lesson) => lesson.domain === 'delivery'),
  ...lessons.filter((lesson) => lesson.domain === 'everyday'),
];
const activeRecallPhraseCount = lessons.reduce(
  (total, lesson) => total + lesson.phrases.length,
  0,
);

const weakPhrasesStorageKey = 'eag.weakPhrases.v1';
const selectedLessonStorageKey = 'eag.selectedLesson.v1';
const activeRecallSessionStorageKey = 'eag.activeRecallSession.v1';
const sequentialActiveRecallSessionStorageKey =
  'eag.sequentialCategoryActiveRecallSession.v1';
const activeRecallRoundStorageKey = 'eag.activeRecallDiagnosticRound.v1';
const sequentialActiveRecallRoundStorageKey =
  'eag.sequentialCategoryActiveRecallDiagnosticRound.v1';

const activeRecallSessionStores: Record<
  ActiveRecallQueueMode,
  ReturnType<typeof createActiveRecallSessionStore>
> = {
  global: createActiveRecallSessionStore(
    () => window.localStorage,
    activeRecallSessionStorageKey,
  ),
  'sequential-category': createActiveRecallSessionStore(
    () => window.localStorage,
    sequentialActiveRecallSessionStorageKey,
  ),
};

function getActiveRecallRoundStorageKey(mode: ActiveRecallQueueMode): string {
  return mode === 'sequential-category'
    ? sequentialActiveRecallRoundStorageKey
    : activeRecallRoundStorageKey;
}

function loadActiveRecallRoundState(mode: ActiveRecallQueueMode): string | null {
  try {
    return localStorage.getItem(getActiveRecallRoundStorageKey(mode));
  } catch {
    return null;
  }
}

function saveActiveRecallRoundState(
  roundState: ActiveRecallRoundState,
  mode: ActiveRecallQueueMode,
): void {
  try {
    localStorage.setItem(
      getActiveRecallRoundStorageKey(mode),
      JSON.stringify(roundState),
    );
  } catch {
    // Round persistence is temporary diagnostic state only.
  }
}

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

  const renderLessonButtons = (domain: TrainingScript['domain']): string =>
    lessons
      .filter((lesson) => lesson.domain === domain)
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
        class="training-button active-recall-button"
        type="button"
        data-active-recall-mode="global"
      >
        Start Global Shuffle Active Recall
      </button>

      <button
        class="training-button active-recall-button"
        type="button"
        data-active-recall-mode="sequential-category"
      >
        Start Sequential Category Shuffle
      </button>

      <p class="training-status" aria-live="polite">
        Training stopped
      </p>

      <pre class="resume-diagnostic" aria-live="polite">Resume diagnostic v2
Active Recall has not started.</pre>
    </div>
  `;

  app.innerHTML = `
    <section class="app-shell">
      <header>
        <p class="eyebrow">English Audio Generator</p>
        <h1>English Situation Training</h1>
      </header>

      <nav class="lesson-selector" aria-label="Delivery English lessons">
        <p class="lesson-label">Delivery English</p>
        <div class="lesson-buttons">
          ${renderLessonButtons('delivery')}
        </div>
      </nav>

      <nav class="lesson-selector" aria-label="Everyday English lessons">
        <p class="lesson-label">Everyday English</p>
        <div class="lesson-buttons">
          ${renderLessonButtons('everyday')}
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

  const activeRecallButtons = [
    ...app.querySelectorAll<HTMLButtonElement>('.active-recall-button'),
  ];

  const trainingStatus =
    app.querySelector<HTMLParagraphElement>('.training-status');

  const resumeDiagnostic =
    app.querySelector<HTMLPreElement>('.resume-diagnostic');

  if (
    !trainingButton ||
    activeRecallButtons.length !== 2 ||
    !trainingStatus ||
    !resumeDiagnostic
  ) {
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
  let runtimeKind: 'none' | 'active-recall' | 'training' = 'none';
  let runtimeQueueIndex: number | null = null;
  let audioPlayOwner:
    | 'none'
    | 'active-recall'
    | 'training'
    | 'phrase-tap'
    | 'media-session' = 'none';
  let expectedPhraseEnd: number | null = null;
  let lastAudioEvent = 'none';
  let lastPlayRequestSource = 'none';
  let lastPlayRejection = 'none';
  let lastPlayTrigger = 'none';
  let pendingPlayTrigger: string | null = null;
  let mediaSessionLastAction = 'none';
  let activeRecallStartAttemptCount = 0;
  let lastDiagnosticSecond = -1;
  let currentRound = 1;
  let lastCompletedRound = 0;
  let sessionClearedThisRound = false;
  let resumeDecisionLines = [
    'saved session: not-checked',
    'action: not-started',
  ];

  function getCurrentAudioLesson(): string {
    const match = /\/lessons\/([^/]+)\//.exec(audio.currentSrc || audio.src);

    return match?.[1] ?? 'unknown';
  }

  function updateResumeDiagnostic(): void {
    try {
      resumeDiagnostic.textContent = [
        'Resume diagnostic v2',
        ...resumeDecisionLines,
        `round: ${currentRound}`,
        `round phrase position: ${runtimeQueueIndex === null ? 'n/a' : `${runtimeQueueIndex + 1}/${activeRecallPhraseCount}`}`,
        `last completed round: ${lastCompletedRound || 'none'}`,
        `runtime active: ${trainingActive ? 'yes' : 'no'}`,
        `runtime kind: ${runtimeKind}`,
        `runtime queue index: ${runtimeQueueIndex ?? 'n/a'}`,
        `UI displayed position: ${runtimeQueueIndex === null ? 'n/a' : `${runtimeQueueIndex + 1}/${activeRecallPhraseCount}`}`,
        `audio owner: ${audioPlayOwner}`,
        `audio paused: ${audio.paused}`,
        `audio lesson: ${getCurrentAudioLesson()}`,
        `audio currentTime: ${audio.currentTime.toFixed(2)}`,
        `expected phrase end: ${expectedPhraseEnd?.toFixed(2) ?? 'n/a'}`,
        `last audio event: ${lastAudioEvent}`,
        `last play request source: ${lastPlayRequestSource}`,
        `last play rejection: ${lastPlayRejection}`,
        `last play trigger: ${lastPlayTrigger}`,
        `media session last action: ${mediaSessionLastAction}`,
        `Active Recall start attempts: ${activeRecallStartAttemptCount}`,
        `visibility state: ${document.visibilityState}`,
        `session cleared this round: ${sessionClearedThisRound ? 'yes' : 'no'}`,
      ].join('\n');
    } catch {
      // Diagnostics must not affect training playback.
    }
  }

  function recordPlayRequest(source: string, trigger: string): void {
    lastPlayRequestSource = source;
    lastPlayRejection = 'none';
    lastPlayTrigger = trigger;
    pendingPlayTrigger = trigger;
    updateResumeDiagnostic();
  }

  function recordPlayRejection(error: unknown): void {
    lastPlayRejection =
      error instanceof Error ? error.name : 'unknown-error';
    pendingPlayTrigger = null;
    updateResumeDiagnostic();
  }

  document.addEventListener('visibilitychange', () => {
    updateResumeDiagnostic();
  });

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
      audioPlayOwner = 'media-session';
      lastAudioEvent = 'media-session-play';
      mediaSessionLastAction = 'play';
      recordPlayRequest('media-session', 'media-session-play');
      void audio.play().catch((error: unknown) => {
        recordPlayRejection(error);
      });
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      lastAudioEvent = 'media-session-pause';
      mediaSessionLastAction = 'pause';
      updateResumeDiagnostic();
      audio.pause();
    });
  }

  audio.addEventListener('play', () => {
    if (pendingPlayTrigger === null) {
      lastPlayRequestSource = 'audio-native-control';
      lastPlayTrigger = 'audio-native-control';
    }

    pendingPlayTrigger = null;
    lastAudioEvent = 'play';
    setMediaSessionPlaybackState('playing');
    updateResumeDiagnostic();
  });
  audio.addEventListener('pause', () => {
    lastAudioEvent = 'pause';
    setMediaSessionPlaybackState('paused');
    updateResumeDiagnostic();
  });
  audio.addEventListener('timeupdate', () => {
    const currentSecond = Math.floor(audio.currentTime);

    if (currentSecond !== lastDiagnosticSecond) {
      lastDiagnosticSecond = currentSecond;
      lastAudioEvent = 'timeupdate';
      updateResumeDiagnostic();
    }
  });
  audio.addEventListener('ended', () => {
    lastAudioEvent = 'ended';
    updateResumeDiagnostic();

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

  function playSegment(
    segment: PhraseSegment,
    runId: number,
    owner: 'active-recall' | 'training',
  ): Promise<void> {
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
        audioPlayOwner = 'none';
        expectedPhraseEnd = null;
        updateResumeDiagnostic();
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
      audioPlayOwner = owner;
      expectedPhraseEnd = segment.end;
      lastAudioEvent = 'segment-play-requested';

      audio.currentTime = Math.max(0, segment.start - trainingSeekLeadSeconds);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      recordPlayRequest(owner, owner);
      updateResumeDiagnostic();

      void audio.play().catch((error: unknown) => {
        recordPlayRejection(error);
        lastAudioEvent =
          error instanceof Error
            ? `play-rejected:${error.name}`
            : 'play-rejected';
        updateResumeDiagnostic();

        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      });
    });
  }

  function getActiveRecallButtonLabel(mode: ActiveRecallQueueMode): string {
    return mode === 'sequential-category'
      ? 'Start Sequential Category Shuffle'
      : 'Start Global Shuffle Active Recall';
  }

  function resetActiveRecallButtons(): void {
    activeRecallButtons.forEach((button) => {
      const mode = button.dataset.activeRecallMode as ActiveRecallQueueMode;
      button.disabled = false;
      button.textContent = getActiveRecallButtonLabel(mode);
    });
  }

  async function runActiveRecall(
    mode: ActiveRecallQueueMode,
    activeButton: HTMLButtonElement,
  ): Promise<void> {
    trainingActive = true;
    runtimeKind = 'active-recall';
    trainingRunId += 1;

    const runId = trainingRunId;
    const activeRecallSessionStore = activeRecallSessionStores[mode];
    const activeRecallLessons =
      mode === 'sequential-category' ? lessonsByDomain : lessons;
    const storageAvailableBeforeLoad =
      activeRecallSessionStore.isAvailable();
    const storedSession = activeRecallSessionStore.load();
    let preparedSession = prepareActiveRecallSession(
      activeRecallLessons,
      storedSession,
      undefined,
      mode,
    );
    let { queue, session } = preparedSession;
    let roundState = preparedSession.resumed
      ? prepareActiveRecallRoundState(loadActiveRecallRoundState(mode))
      : prepareActiveRecallRoundState(null);

    currentRound = roundState.currentRound;
    lastCompletedRound = roundState.lastCompletedRound;
    sessionClearedThisRound = false;
    saveActiveRecallRoundState(roundState, mode);

    const initialCheckpointSaved = activeRecallSessionStore.save(session);
    const diagnosticReason =
      storageAvailableBeforeLoad && !activeRecallSessionStore.isAvailable()
        ? 'storage-read-failed'
        : preparedSession.diagnostic.reason;

    resumeDecisionLines = [
      `saved session: ${preparedSession.diagnostic.savedSession}`,
      `saved currentIndex: ${preparedSession.diagnostic.savedCurrentIndex ?? 'n/a'}`,
      `queue length: ${queue.length}`,
      `signature: ${preparedSession.diagnostic.signature}`,
      `queue validation: ${preparedSession.diagnostic.queueValidation}`,
      `action: ${preparedSession.diagnostic.action}`,
      `reason: ${diagnosticReason}`,
      `storage: ${activeRecallSessionStore.isAvailable() ? 'enabled' : 'disabled'}`,
      `checkpoint save: ${initialCheckpointSaved ? 'saved' : 'unavailable'}`,
    ];
    runtimeQueueIndex = session.currentIndex;
    updateResumeDiagnostic();

    loopBeforeTraining = audio.loop;
    audio.loop = false;

    trainingButton.disabled = true;
    activeRecallButtons.forEach((button) => {
      button.disabled = button !== activeButton;
    });
    activeButton.textContent = 'Stop Active Recall';

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

      while (trainingActive && trainingRunId === runId) {
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
            throw new Error(
              `Active Recall queue entry ${queueIndex} is missing.`,
            );
          }

          session.currentIndex = queueIndex;
          const checkpointSaved = activeRecallSessionStore.save(session);

          runtimeQueueIndex = queueIndex;
          resumeDecisionLines[8] =
            `checkpoint save: ${checkpointSaved ? 'saved' : 'unavailable'}`;
          updateResumeDiagnostic();

          const statusPrefix =
            mode === 'sequential-category'
              ? `Round ${currentRound} — Category: ${activeRecallLessons.find((lesson) => lesson.id === entry.lessonId)?.scenario ?? entry.lessonId}`
              : `Round ${currentRound}`;

          trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — Meaning`;

          await speakJapaneseCue(entry.ja);

          if (!trainingActive || trainingRunId !== runId) {
            break;
          }

          trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — Recall`;

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

          for (
            let repetition = 0;
            repetition < repetitions;
            repetition += 1
          ) {
            if (!trainingActive || trainingRunId !== runId) {
              break;
            }

            const phase =
              repetition === 0
                ? 'Answer'
                : repetition === 1
                  ? 'Repeat'
                  : 'Weak Repeat';

            trainingStatus.textContent = `${statusPrefix} — Phrase ${queueIndex + 1} / ${queue.length} — ${phase}`;

            await playSegment(segment, runId, 'active-recall');

            if (!trainingActive || trainingRunId !== runId) {
              break;
            }

            if (repetition < repetitions - 1) {
              await wait(repeatGapMilliseconds);
            }
          }
        }

        if (!trainingActive || trainingRunId !== runId) {
          break;
        }

        sessionClearedThisRound = true;
        updateResumeDiagnostic();
        activeRecallSessionStore.clear();

        const nextRound = createNextActiveRecallRound(
          activeRecallLessons,
          roundState,
          undefined,
          mode,
        );

        roundState = nextRound.roundState;
        preparedSession = nextRound.preparedSession;
        ({ queue, session } = preparedSession);
        currentRound = roundState.currentRound;
        lastCompletedRound = roundState.lastCompletedRound;
        saveActiveRecallRoundState(roundState, mode);

        sessionClearedThisRound = false;
        runtimeQueueIndex = session.currentIndex;
        const nextRoundCheckpointSaved =
          activeRecallSessionStore.save(session);
        resumeDecisionLines = [
          'saved session: created-after-round-completion',
          'saved currentIndex: 0',
          `queue length: ${queue.length}`,
          'signature: valid',
          'queue validation: valid',
          'action: fresh',
          'reason: normal-round-completion',
          `storage: ${activeRecallSessionStore.isAvailable() ? 'enabled' : 'disabled'}`,
          `checkpoint save: ${nextRoundCheckpointSaved ? 'saved' : 'unavailable'}`,
        ];
        updateResumeDiagnostic();
      }
    } catch (error) {
      console.error('Active Recall playback failed:', error);
    } finally {
      if (trainingRunId === runId) {
        trainingActive = false;
        runtimeKind = 'none';

        cancelJapaneseCue?.();
        cancelJapaneseCue = null;

        audio.pause();
        audio.loop = loopBeforeTraining;
        restoreLessonAudio();

        trainingButton.disabled = false;
        resetActiveRecallButtons();
        trainingStatus.textContent = 'Training stopped';
        updateResumeDiagnostic();
      }
    }
  }

  async function runTraining(): Promise<void> {
    const hasWeakPhrases = selectedLesson.phrases.some((_, index) =>
      weakPhrases.has(getWeakPhraseKey(selectedLesson.id, index)),
    );

    if (!hasWeakPhrases) {
      trainingActive = true;
      runtimeKind = 'training';
      trainingRunId += 1;
      loopBeforeTraining = audio.loop;
      audio.loop = false;
      audio.src = continuousTrainingAudioUrl;
      audioPlayOwner = 'training';
      expectedPhraseEnd = null;
      trainingButton.textContent = 'Stop Training';
      activeRecallButtons.forEach((button) => {
        button.disabled = true;
      });
      trainingStatus.textContent = 'Continuous Training playing';

      try {
        recordPlayRequest('training', 'training-button');
        await audio.play();
      } catch (error) {
        recordPlayRejection(error);
        console.error('Continuous Training playback failed:', error);
        stopTraining();
      }

      return;
    }

    await waitForAudioMetadata();

    trainingActive = true;
    runtimeKind = 'training';
    trainingRunId += 1;

    const runId = trainingRunId;
    const segments = getPhraseSegments(metadata);

    loopBeforeTraining = audio.loop;
    audio.loop = false;
    trainingButton.textContent = 'Stop Training';
    activeRecallButtons.forEach((button) => {
      button.disabled = true;
    });

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

          await playSegment(segment, runId, 'training');

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
        runtimeKind = 'none';
        audio.pause();
        audio.loop = loopBeforeTraining;
        trainingButton.textContent = 'Start Training';
        resetActiveRecallButtons();
        trainingStatus.textContent = 'Training stopped';
      }
    }
  }

  function stopTraining(): void {
    trainingActive = false;
    runtimeKind = 'none';
    trainingRunId += 1;

    cancelActiveSegment?.();
    cancelActiveSegment = null;

    cancelJapaneseCue?.();
    cancelJapaneseCue = null;

    cancelPendingWait?.();
    cancelPendingWait = null;

    audio.pause();
    audioPlayOwner = 'none';
    expectedPhraseEnd = null;
    lastAudioEvent = 'stop-training';
    audio.loop = loopBeforeTraining;
    restoreLessonAudio();

    trainingButton.disabled = false;
    trainingButton.textContent = 'Start Training';

    resetActiveRecallButtons();

    trainingStatus.textContent = 'Training stopped';
    updateResumeDiagnostic();
  }

  stopCurrentTraining = stopTraining;

  activeRecallButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (trainingActive) {
        stopTraining();
        return;
      }

      const mode = button.dataset.activeRecallMode;

      if (mode !== 'global' && mode !== 'sequential-category') {
        return;
      }

      activeRecallStartAttemptCount += 1;
      updateResumeDiagnostic();
      void runActiveRecall(mode, button);
    });
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
      audioPlayOwner = 'phrase-tap';
      expectedPhraseEnd = null;
      lastAudioEvent = 'phrase-tap-play-requested';
      updateResumeDiagnostic();

      try {
        recordPlayRequest('phrase-tap', 'phrase-tap');
        await audio.play();
      } catch (error) {
        recordPlayRejection(error);
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
