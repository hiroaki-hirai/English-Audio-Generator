import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root was not found.');
}

app.innerHTML = `
  <section class="app-shell">
    <header>
      <p class="eyebrow">English Audio Generator</p>
      <h1>Delivery English Training</h1>
    </header>

    <section class="lesson-card">
      <p class="lesson-label">Basic Training</p>

      <h2>Cash Payment</h2>
      <p class="scenario-ja">現金払い</p>

      <div class="player">
        <audio
          controls
          loop
          preload="metadata"
          src="/lessons/cash-payment/lesson.mp3"
        ></audio>
      </div>

      <ol class="phrases">
        <li>
          <strong>Here's your order first.</strong>
          <span>まずはご注文の品をどうぞ。</span>
        </li>

        <li>
          <strong>The total is 2,350 yen.</strong>
          <span>合計2,350円になります。</span>
        </li>

        <li>
          <strong>I'll take the cash now.</strong>
          <span>それでは現金をお預かりします。</span>
        </li>

        <li>
          <strong>Here's your change.</strong>
          <span>こちらがお釣りです。</span>
        </li>

        <li>
          <strong>Is everything okay?</strong>
          <span>問題ありませんか？</span>
        </li>
      </ol>
    </section>
  </section>
`;
