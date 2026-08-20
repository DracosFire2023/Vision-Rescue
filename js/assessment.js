/**
 * assessment.js
 * The pre/post test battery mirrors what Polat et al. (2012) measured:
 *   - Near visual acuity (smallest readable letter size)
 *   - Reading speed (words/min at a fixed small size)
 *   - Contrast detection thresholds at 2, 4, 6 cycles/degree
 *   - Contrast discrimination (JND) at 30% and 60% pedestal contrast
 *
 * Letter sizes and spatial frequencies are converted to real-world visual
 * angle using the on-device calibration (Calibration module) so results are
 * at least self-consistent across sessions on the same device. This is a
 * consumer approximation of a clinical eye chart, not a diagnostic tool.
 */

const OPTOTYPES = ['D', 'E', 'F', 'P', 'N', 'C', 'V', 'O', 'Z', 'R'];

const Assessment = (() => {

  function randomLetter() {
    return OPTOTYPES[Math.floor(Math.random() * OPTOTYPES.length)];
  }

  /**
   * Descending method-of-limits acuity test. Shows one letter at a time,
   * shrinking after each correct identification, until two wrong answers
   * in a row. Returns the smallest arc-min letter size correctly read.
   */
  class AcuityTest {
    constructor(canvas, cal) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cal = cal;
      this.sizeArcmin = 60; // start large (~1 degree stroke-equivalent letter)
      this.misses = 0;
      this.smallestCorrect = null;
      this.trials = [];
    }

    currentLetterPx() {
      return Calibration.isCalibrated(this.cal)
        ? Calibration.arcminToPx(this.cal, this.sizeArcmin)
        : this.sizeArcmin * 2; // fallback: uncalibrated px scale
    }

    showNext() {
      const letter = randomLetter();
      this._current = letter;
      const px = this.currentLetterPx();
      const { width, height } = this.canvas;
      Gabor.fillBackground(this.ctx, this.canvas, 245);
      this.ctx.fillStyle = '#111';
      this.ctx.font = `${px}px "IBM Plex Mono", monospace`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(letter, width / 2, height / 2);
      return { letter, sizeArcmin: this.sizeArcmin, px };
    }

    /** @returns {done, smallestCorrect} */
    answer(chosenLetter) {
      const correct = chosenLetter === this._current;
      this.trials.push({ letter: this._current, chosen: chosenLetter, correct, sizeArcmin: this.sizeArcmin });

      if (correct) {
        this.smallestCorrect = this.sizeArcmin;
        this.misses = 0;
        this.sizeArcmin = Math.max(2, this.sizeArcmin * 0.85);
      } else {
        this.misses++;
        if (this.misses >= 2) {
          return { done: true, smallestCorrect: this.smallestCorrect };
        }
        this.sizeArcmin = this.sizeArcmin * 1.1; // step back up slightly
      }
      return { done: false, smallestCorrect: this.smallestCorrect };
    }
  }

  /**
   * Reading-speed test: shows a short passage at a fixed small size and
   * measures elapsed time from display to the user tapping "done".
   */
  class ReadingSpeedTest {
    constructor(canvas, cal, sizeArcmin) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cal = cal;
      this.sizeArcmin = sizeArcmin || 16;
      this.passage = ReadingSpeedTest.PASSAGES[Math.floor(Math.random() * ReadingSpeedTest.PASSAGES.length)];
    }

    start() {
      const px = Calibration.isCalibrated(this.cal)
        ? Calibration.arcminToPx(this.cal, this.sizeArcmin)
        : this.sizeArcmin * 1.6;
      const { width, height } = this.canvas;
      Gabor.fillBackground(this.ctx, this.canvas, 245);
      this.ctx.fillStyle = '#111';
      this.ctx.font = `${px}px "IBM Plex Sans", sans-serif`;
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'top';
      wrapText(this.ctx, this.passage, 24, 24, width - 48, px * 1.4);
      this.startTime = performance.now();
    }

    finish() {
      const elapsedMin = (performance.now() - this.startTime) / 60000;
      const words = this.passage.split(/\s+/).length;
      return { wordsPerMinute: Math.round(words / elapsedMin), words, elapsedSec: Math.round(elapsedMin * 60) };
    }
  }
  ReadingSpeedTest.PASSAGES = [
    "The morning light moved slowly across the kitchen table while the kettle began to hum. Outside, a light rain had started to fall on the quiet street, and somewhere a door closed gently in the wind.",
    "She read the letter twice before folding it back into its envelope. It had been years since she had heard from him, and the familiar handwriting brought back a flood of small, ordinary memories.",
    "The old bridge creaked under the weight of the delivery truck as it crossed the river at dawn. Fog clung to the water below, and the town on the far bank was only just beginning to wake.",
  ];

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxWidth && line !== '') {
        ctx.fillText(line, x, cy);
        line = word + ' ';
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
  }

  /**
   * Contrast detection threshold at a given spatial frequency (cycles/deg),
   * via a single-interval yes/no staircase presented as 2AFC (patch appears
   * left or right of center; person taps which side).
   */
  class ContrastSensitivityTest {
    constructor(canvas, cal, cpd) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cal = cal;
      this.cpd = cpd;
      this.staircase = new Staircase({ startContrast: 0.5, reversalsToStop: 8 });
    }

    _cyclesPerPatch(radiusPx) {
      if (!Calibration.isCalibrated(this.cal)) return this.cpd; // fallback proxy
      // radiusPx*2 is patch diameter in px; convert px -> deg using calibration
      const distMm = this.cal.viewingDistanceCm * 10;
      const patchDiameterMm = (radiusPx * 2) / this.cal.pxPerMm;
      const diameterDeg = 2 * Math.atan(patchDiameterMm / 2 / distMm) * (180 / Math.PI);
      return this.cpd * diameterDeg;
    }

    presentTrial() {
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const { width, height } = this.canvas;
      const radiusPx = Math.min(width, height) * 0.1;
      const cx = side === 'left' ? width * 0.3 : width * 0.7;
      const cy = height / 2;
      Gabor.fillBackground(this.ctx, this.canvas, 128);
      Gabor.draw(this.ctx, {
        cx, cy, radiusPx,
        cyclesPerPatch: this._cyclesPerPatch(radiusPx),
        contrast: this.staircase.contrast,
        orientationDeg: 90, bgLuminance: 128,
      });
      return { side };
    }

    answer(chosenSide, actualSide) {
      return this.staircase.update(chosenSide === actualSide);
    }
  }

  /**
   * Contrast discrimination (JND): two patches at pedestal contrast, one
   * incremented by delta; person picks the higher-contrast patch.
   */
  class ContrastDiscriminationTest {
    constructor(canvas, cal, pedestal) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.cal = cal;
      this.pedestal = pedestal; // 0.3 or 0.6
      this.staircase = new Staircase({ startContrast: pedestal * 0.3, minContrast: 0.01, maxContrast: 1 - pedestal, reversalsToStop: 8, stepDb: 3 });
    }

    presentTrial() {
      const higherSide = Math.random() < 0.5 ? 'left' : 'right';
      const { width, height } = this.canvas;
      const radiusPx = Math.min(width, height) * 0.1;
      const cyclesPerPatch = 4;
      Gabor.fillBackground(this.ctx, this.canvas, 128);
      const leftContrast = higherSide === 'left' ? this.pedestal + this.staircase.contrast : this.pedestal;
      const rightContrast = higherSide === 'right' ? this.pedestal + this.staircase.contrast : this.pedestal;
      Gabor.draw(this.ctx, { cx: width * 0.3, cy: height / 2, radiusPx, cyclesPerPatch, contrast: Math.min(0.98, leftContrast), orientationDeg: 90, bgLuminance: 128 });
      Gabor.draw(this.ctx, { cx: width * 0.7, cy: height / 2, radiusPx, cyclesPerPatch, contrast: Math.min(0.98, rightContrast), orientationDeg: 90, bgLuminance: 128 });
      return { higherSide };
    }

    answer(chosenSide, actualHigherSide) {
      return this.staircase.update(chosenSide === actualHigherSide);
    }
  }

  return { AcuityTest, ReadingSpeedTest, ContrastSensitivityTest, ContrastDiscriminationTest, OPTOTYPES };
})();
