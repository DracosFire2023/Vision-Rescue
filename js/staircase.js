/**
 * staircase.js
 * A 3-down / 1-up adaptive staircase in log-contrast space, converging on
 * ~79% correct detection threshold — the standard psychophysical procedure
 * used in perceptual-learning contrast studies (Polat et al. 2012 and
 * related work). Two consecutive incorrect responses is treated as the
 * reversal trigger for stepping up (matching the "3-down/1-up" family used
 * for this kind of masked detection task).
 */

class Staircase {
  /**
   * @param {Object} opts
   *  startContrast   - initial Michelson contrast, 0..1
   *  minContrast     - floor
   *  maxContrast     - ceiling
   *  stepDb          - initial step size in dB of contrast
   *  minStepDb       - step size floor (staircase stops shrinking below this)
   *  reversalsToStop - how many reversals before threshold is considered found
   *  correctToStepDown - consecutive correct trials required to decrease contrast
   *  maxTrials       - hard cap; staircase force-completes here even without
   *                    enough reversals (e.g. the person's true threshold is
   *                    at or beyond the contrast floor/ceiling, so direction
   *                    never flips). Without this, that case never ends.
   */
  constructor(opts = {}) {
    this.contrast = opts.startContrast ?? 0.5;
    this.minContrast = opts.minContrast ?? 0.01;
    this.maxContrast = opts.maxContrast ?? 0.95;
    this.stepDb = opts.stepDb ?? 4;
    this.minStepDb = opts.minStepDb ?? 1;
    this.reversalsToStop = opts.reversalsToStop ?? 8;
    this.correctToStepDown = opts.correctToStepDown ?? 3;
    this.maxTrials = opts.maxTrials ?? 40;
    this.hitFloorOrCeiling = false;

    this.consecutiveCorrect = 0;
    this.direction = null; // 'up' | 'down'
    this.reversals = [];
    this.trials = [];
    this.done = false;
  }

  get trialCount() {
    return this.trials.length;
  }

  /** Converts current contrast to/from decibels for stepping. */
  _dbToLinearStep(currentContrast, db, goingUp) {
    const factor = Math.pow(10, db / 20);
    return goingUp ? currentContrast * factor : currentContrast / factor;
  }

  /**
   * Record a trial response.
   * @param {boolean} correct
   * @returns {Object} state after update: {contrast, done, threshold}
   */
  update(correct) {
    if (this.done) return this.summary();

    this.trials.push({ contrast: this.contrast, correct });

    let newDirection = this.direction;
    let stepped = false;

    if (correct) {
      this.consecutiveCorrect++;
      if (this.consecutiveCorrect >= this.correctToStepDown) {
        this.consecutiveCorrect = 0;
        newDirection = 'down';
        this.contrast = this._dbToLinearStep(this.contrast, this.stepDb, false);
        stepped = true;
      }
    } else {
      this.consecutiveCorrect = 0;
      newDirection = 'up';
      this.contrast = this._dbToLinearStep(this.contrast, this.stepDb, true);
      stepped = true;
    }

    const preClamp = this.contrast;
    this.contrast = Math.max(this.minContrast, Math.min(this.maxContrast, this.contrast));
    this.hitFloorOrCeiling = preClamp !== this.contrast;

    if (stepped) {
      if (this.direction && newDirection !== this.direction) {
        this.reversals.push(this.contrast);
        // shrink step size after each reversal, down to a floor
        this.stepDb = Math.max(this.minStepDb, this.stepDb * 0.75);
      }
      this.direction = newDirection;
    }

    if (this.reversals.length >= this.reversalsToStop) {
      this.done = true;
    }

    // Safety net: without this, a person who can always detect the pattern
    // even at the contrast floor (direction never flips, so no reversal is
    // ever logged) would run this staircase forever. Force-complete instead.
    if (this.trialCount >= this.maxTrials) {
      this.done = true;
    }

    return this.summary();
  }

  /** Geometric mean of the last N reversal contrasts = threshold estimate. */
  threshold(lastN = 6) {
    const relevant = this.reversals.slice(-lastN);
    if (relevant.length === 0) return this.contrast;
    const logSum = relevant.reduce((s, c) => s + Math.log(c), 0);
    return Math.exp(logSum / relevant.length);
  }

  summary() {
    return {
      contrast: this.contrast,
      done: this.done,
      trialCount: this.trialCount,
      reversalCount: this.reversals.length,
      threshold: this.done ? this.threshold() : null,
    };
  }
}
