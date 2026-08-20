/**
 * gabor.js
 * Renders Gabor patches: sinusoidal luminance gratings windowed by a
 * Gaussian envelope. This is the core visual stimulus used in the
 * Polat et al. (2012, Scientific Reports) perceptual-learning protocol.
 *
 * All functions draw directly into a canvas 2D context using raw pixel
 * manipulation for precise control over contrast and spatial frequency.
 */

const Gabor = (() => {

  /**
   * Draws a single Gabor patch centered at (cx, cy).
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} opts
   *  cx, cy            - center in canvas px
   *  radiusPx          - envelope radius (patch drawn within ~2.5x this)
   *  cyclesPerPatch     - number of grating cycles across the diameter (spatial frequency proxy)
   *  contrast          - Michelson contrast, 0..1
   *  orientationDeg    - grating orientation, 0 = vertical stripes
   *  phase             - radians
   *  bgLuminance       - 0..255, mid-gray background the patch is drawn on
   */
  function draw(ctx, opts) {
    const {
      cx, cy, radiusPx,
      cyclesPerPatch = 4,
      contrast = 0.5,
      orientationDeg = 0,
      phase = 0,
      bgLuminance = 128,
    } = opts;

    const size = Math.ceil(radiusPx * 5); // window big enough for gaussian tail
    const half = size / 2;
    const sigma = radiusPx * 0.55; // gaussian envelope sigma
    const theta = (orientationDeg * Math.PI) / 180;
    const freq = cyclesPerPatch / (radiusPx * 2); // cycles per pixel

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - half;
        const dy = y - half;

        // rotate coordinates
        const xr = dx * cosT + dy * sinT;

        // gaussian envelope
        const dist2 = dx * dx + dy * dy;
        const envelope = Math.exp(-dist2 / (2 * sigma * sigma));

        // sinusoidal carrier
        const grating = Math.sin(2 * Math.PI * freq * xr + phase);

        const luminance = bgLuminance + bgLuminance * contrast * grating * envelope;
        const v = Math.max(0, Math.min(255, luminance));

        const idx = (y * size + x) * 4;
        data[idx] = v;
        data[idx + 1] = v;
        data[idx + 2] = v;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, cx - half, cy - half);
  }

  /** Fills the whole canvas with flat mid-gray background luminance. */
  function fillBackground(ctx, canvas, luminance = 128) {
    ctx.fillStyle = `rgb(${luminance},${luminance},${luminance})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Draws a target Gabor plus two collinear flanking Gabors (lateral masking, "LM").
   * Flankers are positioned along the grating's own orientation axis, at
   * `separation` multiples of the patch radius from the target center.
   */
  function drawLateralMask(ctx, opts) {
    const {
      cx, cy, radiusPx, cyclesPerPatch, orientationDeg, bgLuminance,
      targetContrast, flankerContrast = 0.4, separation = 3, phase = 0,
    } = opts;

    const theta = (orientationDeg * Math.PI) / 180;
    // flankers offset perpendicular to the grating stripes (along the modulation axis)
    const offset = radiusPx * separation;
    const perpTheta = theta + Math.PI / 2;
    const ox = Math.cos(perpTheta) * offset;
    const oy = Math.sin(perpTheta) * offset;

    draw(ctx, { cx: cx - ox, cy: cy - oy, radiusPx, cyclesPerPatch, contrast: flankerContrast, orientationDeg, phase, bgLuminance });
    draw(ctx, { cx: cx + ox, cy: cy + oy, radiusPx, cyclesPerPatch, contrast: flankerContrast, orientationDeg, phase, bgLuminance });
    draw(ctx, { cx, cy, radiusPx, cyclesPerPatch, contrast: targetContrast, orientationDeg, phase, bgLuminance });
  }

  /**
   * Renders a small static "signature" Gabor ring texture used decoratively
   * in the UI (progress rings, icons, loading states). Returns a data URL.
   */
  function renderSwatch(size = 128, cyclesPerPatch = 5, contrast = 0.9, orientationDeg = 90) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    fillBackground(ctx, canvas, 20);
    draw(ctx, {
      cx: size / 2, cy: size / 2, radiusPx: size / 2.6,
      cyclesPerPatch, contrast, orientationDeg, phase: 0, bgLuminance: 140,
    });
    return canvas.toDataURL();
  }

  return { draw, fillBackground, drawLateralMask, renderSwatch };
})();
