/**
 * session.js
 * Implements the four training conditions from Polat et al. (2012):
 *   T      - target Gabor alone
 *   LM     - target + two collinear flanking Gabors (lateral masking)
 *   BM-T   - target followed, after a variable ISI, by a backward mask
 *   BM-LM  - LM configuration followed, after a variable ISI, by a backward mask
 *
 * Each trial is a two-interval forced choice (2AFC): the target appears in
 * one of two temporal intervals, and the person indicates which one.
 * Timing uses setTimeout scheduling — accurate to roughly a display frame
 * on typical phones/tablets, not lab-grade tachistoscope precision. That
 * limitation is disclosed in the app's About screen.
 */

const CONDITIONS = ['T', 'LM', 'BM-T', 'BM-LM'];
const CONDITION_LABELS = {
  T: 'Target detection',
  LM: 'Lateral masking',
  'BM-T': 'Backward masking (target)',
  'BM-LM': 'Backward masking (lateral mask)',
};

function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

class TrialRunner {
  /**
   * @param canvas HTMLCanvasElement, already sized
   * @param cal    calibration object from Calibration.load()
   */
  constructor(canvas, cal) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cal = cal;
    this.bg = 128;
  }

  clear() {
    Gabor.fillBackground(this.ctx, this.canvas, this.bg);
  }

  showFixation(ms) {
    this.clear();
    const { width, height } = this.canvas;
    const cx = width / 2, cy = height / 2;
    this.ctx.strokeStyle = '#5FD9C8';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    this.ctx.stroke();
    return wait(ms);
  }

  /** Renders one interval's stimulus per the given condition. */
  _drawStimulus(condition, params, showTarget, targetContrast) {
    const { width, height } = this.canvas;
    const cx = width / 2, cy = height / 2;
    const radiusPx = Math.min(width, height) * 0.12;
    const orientationDeg = 90; // vertical gratings, matches study default
    const { cyclesPerPatch, separation } = params;

    this.clear();

    if (condition === 'T' || condition === 'BM-T') {
      if (showTarget) {
        Gabor.draw(this.ctx, { cx, cy, radiusPx, cyclesPerPatch, contrast: targetContrast, orientationDeg, bgLuminance: this.bg });
      }
    } else if (condition === 'LM' || condition === 'BM-LM') {
      // flankers always present as context; target only in the target interval
      const theta = (orientationDeg * Math.PI) / 180;
      const offset = radiusPx * (separation || 3);
      const perpTheta = theta + Math.PI / 2;
      const ox = Math.cos(perpTheta) * offset;
      const oy = Math.sin(perpTheta) * offset;
      Gabor.draw(this.ctx, { cx: cx - ox, cy: cy - oy, radiusPx, cyclesPerPatch, contrast: 0.4, orientationDeg, bgLuminance: this.bg });
      Gabor.draw(this.ctx, { cx: cx + ox, cy: cy + oy, radiusPx, cyclesPerPatch, contrast: 0.4, orientationDeg, bgLuminance: this.bg });
      if (showTarget) {
        Gabor.draw(this.ctx, { cx, cy, radiusPx, cyclesPerPatch, contrast: targetContrast, orientationDeg, bgLuminance: this.bg });
      }
    }
  }

  _drawMask(condition, params) {
    const { width, height } = this.canvas;
    const cx = width / 2, cy = height / 2;
    const radiusPx = Math.min(width, height) * 0.12;
    const orientationDeg = 90;
    const { cyclesPerPatch, separation } = params;

    this.clear();
    const theta = (orientationDeg * Math.PI) / 180;
    const offset = radiusPx * (separation || 3);
    const perpTheta = theta + Math.PI / 2;
    const ox = Math.cos(perpTheta) * offset;
    const oy = Math.sin(perpTheta) * offset;
    Gabor.draw(this.ctx, { cx: cx - ox, cy: cy - oy, radiusPx, cyclesPerPatch, contrast: 0.4, orientationDeg, bgLuminance: this.bg });
    Gabor.draw(this.ctx, { cx: cx + ox, cy: cy + oy, radiusPx, cyclesPerPatch, contrast: 0.4, orientationDeg, bgLuminance: this.bg });
  }

  /**
   * Runs one full 2AFC trial.
   * @returns {Promise<{targetInterval:1|2, correctAnswer:1|2}>} caller supplies response separately
   */
  async presentTrial(condition, params, targetContrast) {
    const targetInterval = Math.random() < 0.5 ? 1 : 2;
    const isMasked = condition === 'BM-T' || condition === 'BM-LM';
    const jitter = 250 + Math.random() * 500;

    await this.showFixation(200);

    for (let interval = 1; interval <= 2; interval++) {
      this.clear();
      await wait(300 + jitter);

      const showTarget = interval === targetInterval;
      this._drawStimulus(condition, params, showTarget, targetContrast);
      await wait(params.durationMs || 100);

      if (isMasked) {
        this._drawMask(condition, params);
        await wait(params.isiMs || 240);
      }

      this.clear();
      if (interval === 1) await wait(500); // gap between intervals
    }

    return { targetInterval };
  }
}

/**
 * Runs a full staircase block for one condition: repeatedly presents trials
 * and expects the caller to supply the user's response via `getResponse()`.
 */
class ConditionBlock {
  constructor({ runner, condition, params, staircaseOpts, onTrial }) {
    this.runner = runner;
    this.condition = condition;
    this.params = params;
    this.staircase = new Staircase(staircaseOpts);
    this.onTrial = onTrial || (() => {});
  }

  /**
   * @param {Function} getResponse - async (targetInterval) => 1|2 chosen by user
   */
  async run(getResponse) {
    while (!this.staircase.done) {
      const { targetInterval } = await this.runner.presentTrial(
        this.condition, this.params, this.staircase.contrast
      );
      const response = await getResponse();
      const correct = response === targetInterval;
      const state = this.staircase.update(correct);
      this.onTrial({ condition: this.condition, correct, response, targetInterval, ...state });
    }
    return this.staircase.summary();
  }
}

/**
 * Adjusts a condition's difficulty parameters for the *next* session based
 * on how the *last* session went, one parameter at a time — mirroring the
 * study's between-session progression rule.
 */
function adaptParamsForNextSession(prevParams, lastThreshold, startingContrast) {
  const next = { ...prevParams };
  const improved = lastThreshold != null && lastThreshold < startingContrast * 0.6;

  if (improved) {
    // make it harder: shorten ISI first (down to a floor), then shorten duration
    if (next.isiMs > 60) {
      next.isiMs = Math.max(60, next.isiMs - 30);
    } else if (next.durationMs > 60) {
      next.durationMs = Math.max(60, next.durationMs - 10);
    }
  } else if (lastThreshold != null && lastThreshold > startingContrast * 0.85) {
    // make it a bit easier
    next.isiMs = Math.min(240, next.isiMs + 20);
  }
  return next;
}
