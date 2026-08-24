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

const lessons = lessonsData as TrainingScript[];

const app = document.querySelector<HTMLDivElement>('#app');

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
    .map(
      (phrase, index) => `
        <li>
          <button
            class="phrase-button"
            type="button"
            data-phrase-index="${index}"
          >
            <strong>${phrase.en}</strong>
          </button>
          <span>${phrase.ja}</span>
        </li>
      `,
    )
    .join('');

  const player = `
    <div class="player">
      <audio
        controls
        loop
        preload="metadata"
        src="${import.meta.env.BASE_URL}lessons/${selectedLesson.id}/lesson.mp3"
      ></audio>
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
        void renderLesson(lesson);
      }
    });
  });

  const audio = app.querySelector<HTMLAudioElement>('audio');

  if (!audio) {
    throw new Error('Audio player was not found.');
  }

  const phraseButtons =
    app.querySelectorAll<HTMLButtonElement>('.phrase-button');

  phraseButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const phraseIndex = Number(button.dataset.phraseIndex);
      const phraseMetadata = metadata.phrases.find(
        (candidate) => candidate.index === phraseIndex,
      );

      if (!phraseMetadata) {
        return;
      }

      const seekLeadSeconds = 4;

      audio.currentTime = Math.max(0, phraseMetadata.start - seekLeadSeconds);

      try {
        await audio.play();
      } catch (error) {
        console.error('Failed to play lesson audio:', error);
      }
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
