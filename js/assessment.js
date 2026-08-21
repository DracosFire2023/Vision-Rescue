/**
 * app.js — screen router and UI glue code.
 */

const App = (() => {
  const root = document.getElementById('app');
  let cal = Calibration.load();
  let state = {};

  function h(strings, ...vals) {
    return strings.reduce((acc, s, i) => acc + s + (vals[i] ?? ''), '');
  }

  function go(screen, data = {}) {
    state = { screen, ...data };
    render();
    window.scrollTo(0, 0);
  }

  function render() {
    switch (state.screen) {
      case 'home': return renderHome();
      case 'calibrate': return renderCalibrate();
      case 'train-intro': return renderTrainIntro();
      case 'train-run': return renderTrainRun();
      case 'train-summary': return renderTrainSummary();
      case 'assess-intro': return renderAssessIntro();
      case 'assess-acuity': return renderAssessAcuity();
      case 'assess-reading': return renderAssessReading();
      case 'assess-contrast': return renderAssessContrast();
      case 'assess-discrim': return renderAssessDiscrim();
      case 'assess-summary': return renderAssessSummary();
      case 'progress': return renderProgress();
      case 'about': return renderAbout();
      default: return renderHome();
    }
  }

  // ---------- HOME ----------
  function renderHome() {
    const profile = Store.getProfile();
    const sessions = Store.getSessions();
    const ringSwatch = Gabor.renderSwatch(160, 6, 0.85, 90);

    root.innerHTML = h`
      <header class="topbar">
        <div class="brand">
          <img src="${ringSwatch}" class="brand-mark" alt="" />
          <span>Deblur</span>
        </div>
        <button class="icon-btn" onclick="App.go('about')" aria-label="About">?</button>
      </header>

      <section class="hero">
        <div class="ring-wrap">
          <img src="${ringSwatch}" class="ring-img" alt="" />
          <div class="ring-center">
            <div class="ring-number">${profile.streakDays || 0}</div>
            <div class="ring-label">day streak</div>
          </div>
        </div>
        <p class="hero-sub">${profile.totalSessions || 0} sessions completed</p>
      </section>

      <section class="actions">
        <button class="btn btn-primary" onclick="App.go('train-intro')">Start today's training</button>
        <button class="btn btn-secondary" onclick="App.go('assess-intro')">Run vision check</button>
        <button class="btn btn-ghost" onclick="App.go('progress')">View progress</button>
        ${!Calibration.isCalibrated(cal) ? '<p class="hint">Tip: calibrate your screen for accurate results — <a href="#" onclick="App.go(\'calibrate\'); return false;">set it up</a>.</p>' : ''}
      </section>

      <footer class="foot-note">
        Not a medical device. See <a href="#" onclick="App.go('about'); return false;">About</a> for what this app can and can't do.
      </footer>
    `;
  }

  // ---------- CALIBRATION ----------
  function renderCalibrate() {
    root.innerHTML = h`
      <header class="topbar"><button class="icon-btn" onclick="App.go('home')">←</button><span>Calibrate screen</span></header>
      <section class="panel">
        <p>Hold a credit card (or similar ID card, 85.6mm wide) flat against your screen. Drag the slider until the bar below exactly matches the card's width.</p>
        <div class="cal-box">
          <div id="cal-bar" style="height:56px;width:200px;background:#5FD9C8;border-radius:6px;margin:24px auto;"></div>
        </div>
        <input id="cal-slider" type="range" min="100" max="500" value="200" style="width:100%" oninput="App._calDrag(this.value)" />
        <label class="field">
          <span>Viewing distance (cm)</span>
          <input id="cal-dist" type="number" value="${cal.viewingDistanceCm || Calibration.DEFAULT_VIEWING_DISTANCE_CM}" />
        </label>
        <p class="hint">The original study trained at 40cm — roughly a comfortable reading distance for a phone or book. On a laptop or desktop monitor your natural distance is usually more like 50–70cm — measure it and enter the real number rather than leaving the default. Keep it consistent between sessions either way.</p>
        <button class="btn btn-primary" onclick="App._saveCalibration()">Save calibration</button>
        <button class="btn btn-ghost" onclick="App.go('home')">Skip for now</button>
      </section>
    `;
  }
  function _calDrag(px) {
    document.getElementById('cal-bar').style.width = px + 'px';
  }
  function _saveCalibration() {
    const px = parseFloat(document.getElementById('cal-bar').style.width);
    const dist = parseFloat(document.getElementById('cal-dist').value) || Calibration.DEFAULT_VIEWING_DISTANCE_CM;
    cal = { pxPerMm: px / Calibration.CREDIT_CARD_WIDTH_MM, viewingDistanceCm: dist };
    Calibration.save(cal);
    go('home');
  }

  // ---------- TRAINING ----------
  function renderTrainIntro() {
    root.innerHTML = h`
      <header class="topbar"><button class="icon-btn" onclick="App.go('home')">←</button><span>Training session</span></header>
      <section class="panel">
        <p>This session runs four short blocks, about 25–30 minutes total, matching the original study's protocol. Find a dim room and hold your device about 40cm away.</p>
        <ul class="protocol-list">
          <li><strong>Target detection</strong> — spot a faint pattern.</li>
          <li><strong>Lateral masking</strong> — spot it among flanking patterns.</li>
          <li><strong>Backward masking</strong> — spot it before a masking flash.</li>
          <li><strong>Combined masking</strong> — both together.</li>
        </ul>
        <p class="warn">⚠ This task uses brief, flashing high-contrast visual stimuli. Stop and consult a doctor first if you have a history of seizures or photosensitivity.</p>
        <button class="btn btn-primary" onclick="App._startTraining()">Begin session</button>
      </section>
    `;
  }

  function _startTraining() {
    go('train-run', { conditionIndex: 0, results: [] });
    _runTrainingBlock();
  }

  async function _runTrainingBlock() {
    const conditionParams = Store.getConditionParams();
    const condition = CONDITIONS[state.conditionIndex];
    const params = conditionParams[condition];

    root.innerHTML = h`
      <header class="topbar"><span>${CONDITION_LABELS[condition]}</span><span class="counter">${state.conditionIndex + 1}/4</span></header>
      <div class="canvas-wrap"><canvas id="stim-canvas"></canvas></div>
      <div class="response-row" id="response-row" style="visibility:hidden">
        <button class="btn btn-half" onclick="App._respond(1)">1st interval</button>
        <button class="btn btn-half" onclick="App._respond(2)">2nd interval</button>
      </div>
      <p class="progress-text" id="progress-text">Get ready…</p>
    `;

    const canvas = document.getElementById('stim-canvas');
    _fitCanvas(canvas);
    const runner = new TrialRunner(canvas, cal);
    runner.clear();

    const block = new ConditionBlock({
      runner, condition, params,
      staircaseOpts: { startContrast: 0.6, reversalsToStop: 8 },
      onTrial: (info) => {
        document.getElementById('progress-text').textContent =
          `Trial ${info.trialCount} · ${info.reversalCount}/8 reversals`;
      },
    });

    state.currentBlock = block;

    block.run(() => new Promise(resolve => {
      document.getElementById('response-row').style.visibility = 'visible';
      state._resolveResponse = resolve;
    })).then(summary => {
      state.results.push({ condition, ...summary });
      const nextIndex = state.conditionIndex + 1;
      if (nextIndex < CONDITIONS.length) {
        state.conditionIndex = nextIndex;
        _runTrainingBlock();
      } else {
        _finishTraining();
      }
    });
  }

  function _respond(interval) {
    document.getElementById('response-row').style.visibility = 'hidden';
    if (state._resolveResponse) {
      const r = state._resolveResponse;
      state._resolveResponse = null;
      r(interval);
    }
  }

  function _finishTraining() {
    const conditionParams = Store.getConditionParams();
    const updated = { ...conditionParams };
    state.results.forEach(r => {
      updated[r.condition] = adaptParamsForNextSession(
        conditionParams[r.condition], r.threshold, 0.6
      );
    });
    Store.setConditionParams(updated);
    Store.addSession({ date: new Date().toISOString(), results: state.results });
    const profile = Store.recordSessionCompletion();
    go('train-summary', { results: state.results, profile });
  }

  function renderTrainSummary() {
    const rows = state.results.map(r => h`
      <tr><td>${CONDITION_LABELS[r.condition]}</td><td>${r.threshold ? (r.threshold * 100).toFixed(1) + '%' : '—'}</td></tr>
    `).join('');
    root.innerHTML = h`
      <header class="topbar"><span>Session complete</span></header>
      <section class="panel">
        <div class="ring-wrap small">
          <div class="ring-number">${state.profile.streakDays}</div>
          <div class="ring-label">day streak</div>
        </div>
        <table class="results-table">
          <thead><tr><th>Condition</th><th>Threshold contrast</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="hint">Lower contrast threshold = better sensitivity. Come back tomorrow — consistency matters more than any single session.</p>
        <button class="btn btn-primary" onclick="App.go('home')">Done</button>
      </section>
    `;
  }

  // ---------- ASSESSMENT ----------
  function renderAssessIntro() {
    root.innerHTML = h`
      <header class="topbar"><button class="icon-btn" onclick="App.go('home')">←</button><span>Vision check</span></header>
      <section class="panel">
        <p>A short battery (about 8 minutes) to track acuity, reading speed, and contrast sensitivity over time. Run this before your first session and every few weeks after.</p>
        <p class="hint">This is a self-administered screening tool for tracking your own progress — it is not a substitute for an eye exam.</p>
        <button class="btn btn-primary" onclick="App.go('assess-acuity')">Begin</button>
      </section>
    `;
  }

  function renderAssessAcuity() {
    root.innerHTML = h`
      <header class="topbar"><span>Letter size</span><span class="counter">1/4</span></header>
      <div class="canvas-wrap"><canvas id="stim-canvas"></canvas></div>
      <p class="progress-text">Type the letter you see.</p>
      <div class="letter-grid" id="letter-grid"></div>
    `;
    const canvas = document.getElementById('stim-canvas');
    _fitCanvas(canvas);
    const test = new Assessment.AcuityTest(canvas, cal);
    state.acuityTest = test;

    const grid = document.getElementById('letter-grid');
    grid.innerHTML = Assessment.OPTOTYPES.map(l => `<button class="btn btn-letter" onclick="App._acuityAnswer('${l}')">${l}</button>`).join('');
    test.showNext();
  }
  function _acuityAnswer(letter) {
    const { done, smallestCorrect } = state.acuityTest.answer(letter);
    if (done) {
      state.acuityResult = smallestCorrect;
      go('assess-reading', { acuityResult: smallestCorrect });
    } else {
      state.acuityTest.showNext();
    }
  }

  function renderAssessReading() {
    root.innerHTML = h`
      <header class="topbar"><span>Reading speed</span><span class="counter">2/4</span></header>
      <div class="canvas-wrap tall"><canvas id="stim-canvas"></canvas></div>
      <p class="progress-text">Read the passage aloud or silently, then tap Done as soon as you finish.</p>
      <button class="btn btn-primary" onclick="App._finishReading()">Done reading</button>
    `;
    const canvas = document.getElementById('stim-canvas');
    _fitCanvas(canvas);
    const sizeArcmin = state.acuityResult ? state.acuityResult * 1.3 : 16;
    const test = new Assessment.ReadingSpeedTest(canvas, cal, sizeArcmin);
    state.readingTest = test;
    test.start();
  }
  function _finishReading() {
    state.readingResult = state.readingTest.finish();
    go('assess-contrast', { cpds: [2, 4, 6], cpdIndex: 0, contrastResults: [] });
  }

  function renderAssessContrast() {
    root.innerHTML = h`
      <header class="topbar"><span>Contrast sensitivity</span><span class="counter">3/4</span></header>
      <div class="canvas-wrap"><canvas id="stim-canvas"></canvas></div>
      <p class="progress-text" id="progress-text">Which side shows a pattern?</p>
      <div class="response-row">
        <button class="btn btn-half" onclick="App._contrastAnswer('left')">Left</button>
        <button class="btn btn-half" onclick="App._contrastAnswer('right')">Right</button>
      </div>
    `;
    _runContrastTrial();
  }
  function _updateContrastProgress() {
    const el = document.getElementById('progress-text');
    if (el && state.contrastTest) {
      const s = state.contrastTest.staircase.summary();
      el.textContent = `Which side shows a pattern? · frequency ${state.cpdIndex + 1}/3 · trial ${s.trialCount} · ${s.reversalCount}/6 reversals`;
    }
  }
  function _runContrastTrial() {
    const canvas = document.getElementById('stim-canvas');
    if (!canvas) return;
    _fitCanvas(canvas);
    const cpd = state.cpds[state.cpdIndex];
    if (!state.contrastTest || state._lastCpd !== cpd) {
      state.contrastTest = new Assessment.ContrastSensitivityTest(canvas, cal, cpd);
      state._lastCpd = cpd;
    }
    state._trialInfo = state.contrastTest.presentTrial();
    _updateContrastProgress();
  }
  function _contrastAnswer(side) {
    const result = state.contrastTest.answer(side, state._trialInfo.side);
    if (result.done) {
      state.contrastResults.push({ cpd: state.cpds[state.cpdIndex], threshold: result.threshold });
      const nextIdx = state.cpdIndex + 1;
      if (nextIdx < state.cpds.length) {
        state.cpdIndex = nextIdx;
        state.contrastTest = null;
        go('assess-contrast', state);
      } else {
        go('assess-discrim', { ...state, pedestals: [0.3, 0.6], pedIndex: 0, discrimResults: [] });
      }
    } else {
      _runContrastTrial();
    }
  }

  function renderAssessDiscrim() {
    root.innerHTML = h`
      <header class="topbar"><span>Contrast discrimination</span><span class="counter">4/4</span></header>
      <div class="canvas-wrap"><canvas id="stim-canvas"></canvas></div>
      <p class="progress-text" id="progress-text">Which side is higher contrast (more visible)?</p>
      <div class="response-row">
        <button class="btn btn-half" onclick="App._discrimAnswer('left')">Left</button>
        <button class="btn btn-half" onclick="App._discrimAnswer('right')">Right</button>
      </div>
    `;
    _runDiscrimTrial();
  }
  function _updateDiscrimProgress() {
    const el = document.getElementById('progress-text');
    if (el && state.discrimTest) {
      const s = state.discrimTest.staircase.summary();
      el.textContent = `Which side is higher contrast? · level ${state.pedIndex + 1}/2 · trial ${s.trialCount} · ${s.reversalCount}/6 reversals`;
    }
  }
  function _runDiscrimTrial() {
    const canvas = document.getElementById('stim-canvas');
    if (!canvas) return;
    _fitCanvas(canvas);
    const pedestal = state.pedestals[state.pedIndex];
    if (!state.discrimTest || state._lastPed !== pedestal) {
      state.discrimTest = new Assessment.ContrastDiscriminationTest(canvas, cal, pedestal);
      state._lastPed = pedestal;
    }
    state._discrimInfo = state.discrimTest.presentTrial();
    _updateDiscrimProgress();
  }
  function _discrimAnswer(side) {
    const result = state.discrimTest.answer(side, state._discrimInfo.higherSide);
    if (result.done) {
      state.discrimResults.push({ pedestal: state.pedestals[state.pedIndex], jnd: result.threshold });
      const nextIdx = state.pedIndex + 1;
      if (nextIdx < state.pedestals.length) {
        state.pedIndex = nextIdx;
        state.discrimTest = null;
        go('assess-discrim', state);
      } else {
        _finishAssessment();
      }
    } else {
      _runDiscrimTrial();
    }
  }

  function _finishAssessment() {
    const record = {
      date: new Date().toISOString(),
      acuityArcmin: state.acuityResult,
      readingWpm: state.readingResult?.wordsPerMinute,
      contrastSensitivity: state.contrastResults,
      contrastDiscrimination: state.discrimResults,
    };
    Store.addAssessment(record);
    go('assess-summary', { record });
  }

  function renderAssessSummary() {
    const r = state.record;
    root.innerHTML = h`
      <header class="topbar"><span>Vision check complete</span></header>
      <section class="panel">
        <div class="stat-grid">
          <div class="stat"><div class="stat-val">${r.acuityArcmin ? r.acuityArcmin.toFixed(1) : '—'}</div><div class="stat-label">arcmin acuity</div></div>
          <div class="stat"><div class="stat-val">${r.readingWpm || '—'}</div><div class="stat-label">words/min</div></div>
        </div>
        <p class="hint">Saved to your progress history. Run this again in a few weeks to see change over time.</p>
        <button class="btn btn-primary" onclick="App.go('progress')">View progress</button>
        <button class="btn btn-ghost" onclick="App.go('home')">Home</button>
      </section>
    `;
  }

  // ---------- PROGRESS ----------
  function renderProgress() {
    const assessments = Store.getAssessments();
    root.innerHTML = h`
      <header class="topbar"><button class="icon-btn" onclick="App.go('home')">←</button><span>Progress</span></header>
      <section class="panel">
        <h3>Near acuity over time</h3>
        <canvas id="chart-acuity" height="160"></canvas>
        <h3>Reading speed over time</h3>
        <canvas id="chart-reading" height="160"></canvas>
        ${assessments.length === 0 ? '<p class="hint">Run a vision check to start tracking.</p>' : ''}
      </section>
    `;
    if (assessments.length > 0) {
      _drawLineChart('chart-acuity', assessments.map(a => a.acuityArcmin).filter(v => v != null), '#5FD9C8', true);
      _drawLineChart('chart-reading', assessments.map(a => a.readingWpm).filter(v => v != null), '#E8A65C', false);
    }
  }

  function _drawLineChart(canvasId, values, color, invertGood) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || values.length < 1) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = hgt * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, hgt);
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 20) + 10;
      const norm = (v - min) / range;
      const y = invertGood ? norm * (hgt - 20) + 10 : (1 - norm) * (hgt - 20) + 10;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    values.forEach((v, i) => {
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * (w - 20) + 10;
      const norm = (v - min) / range;
      const y = invertGood ? norm * (hgt - 20) + 10 : (1 - norm) * (hgt - 20) + 10;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ---------- ABOUT ----------
  function renderAbout() {
    root.innerHTML = h`
      <header class="topbar"><button class="icon-btn" onclick="App.go('home')">←</button><span>About</span></header>
      <section class="panel prose">
        <h3>What this is</h3>
        <p>This app implements a perceptual-learning training protocol adapted from Polat et al. (2012), <em>"Training the brain to overcome the effect of aging on the human eye,"</em> published in <em>Scientific Reports</em>. That study found that repeated practice on a visual detection task improved near visual acuity, contrast sensitivity, and reading speed in a group of 30 presbyopic adults — with no measured change in the eye's optics, suggesting the improvement happened in visual processing rather than the eye itself.</p>
        <h3>What it isn't</h3>
        <p>This app is not a medical device and has not been clinically validated on its own. It's a training tool inspired by the published protocol, running on consumer hardware with consumer-grade timing precision — not the lab equipment used in the original research. Individual results vary, and this is not a substitute for a comprehensive eye exam, which can catch conditions (cataracts, glaucoma, macular degeneration) that training cannot address.</p>
        <h3>Timing precision</h3>
        <p>Stimulus timing is scheduled in software and is accurate to roughly one display frame (about 16ms on a 60Hz screen), not tachistoscope precision. This is a meaningful but not exact approximation of the lab protocol.</p>
        <h3>Photosensitivity</h3>
        <p>Training involves brief, flashing high-contrast visual patterns. If you have a history of seizures or photosensitivity, talk to a doctor before using this app.</p>
        <h3>Your data</h3>
        <p>All training and assessment data stays on your device in local storage. Nothing is uploaded anywhere.</p>
        <button class="btn btn-ghost" onclick="if(confirm('Erase all local data? This cannot be undone.')) { Store.wipeAll(); App.go('home'); }">Erase my data</button>
      </section>
    `;
  }

  // ---------- utils ----------
  function _fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  return {
    go, render,
    _calDrag, _saveCalibration,
    _startTraining, _respond,
    _acuityAnswer, _finishReading, _contrastAnswer, _discrimAnswer,
  };
})();

document.addEventListener('DOMContentLoaded', () => App.go('home'));
