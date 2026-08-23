import './style.css';

import basicDelivery from '../../training-scripts/basic-delivery.json';
import cashPayment from '../../training-scripts/cash-payment.json';
import changeHandling from '../../training-scripts/change-handling.json';
import orderVerification from '../../training-scripts/order-verification.json';
import pinVerification from '../../training-scripts/pin-verification.json';

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

const lessons: TrainingScript[] = [
  basicDelivery,
  cashPayment,
  changeHandling,
  orderVerification,
  pinVerification,
];

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

function renderLesson(selectedLesson: TrainingScript): void {
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
      (phrase) => `
        <li>
          <strong>${phrase.en}</strong>
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
        src="/lessons/${selectedLesson.id}/lesson.mp3"
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
        renderLesson(lesson);
      }
    });
  });
}

renderLesson(cashPayment);
