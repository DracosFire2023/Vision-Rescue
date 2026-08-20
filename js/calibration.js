/**
 * calibration.js
 * Converts between visual angle (degrees / arcmin) and screen pixels using
 * a user-measured px-per-mm value and an assumed viewing distance.
 * The original study trained subjects at 40cm — we default to that and
 * let the user override it.
 */

const Calibration = (() => {
  const DEFAULT_VIEWING_DISTANCE_CM = 40;
  const CREDIT_CARD_WIDTH_MM = 85.6; // ISO/IEC 7810 ID-1

  function load() {
    const raw = localStorage.getItem('vt_calibration');
    if (raw) return JSON.parse(raw);
    return { pxPerMm: null, viewingDistanceCm: DEFAULT_VIEWING_DISTANCE_CM };
  }

  function save(cal) {
    localStorage.setItem('vt_calibration', JSON.stringify(cal));
  }

  /** cal.pxPerMm must be set (via the card-calibration screen) before use. */
  function degToPx(cal, degrees) {
    const distMm = cal.viewingDistanceCm * 10;
    const sizeMm = 2 * distMm * Math.tan((degrees * Math.PI) / 180 / 2);
    return sizeMm * cal.pxPerMm;
  }

  function arcminToPx(cal, arcmin) {
    return degToPx(cal, arcmin / 60);
  }

  function isCalibrated(cal) {
    return !!cal && !!cal.pxPerMm && cal.pxPerMm > 0;
  }

  return { load, save, degToPx, arcminToPx, isCalibrated, DEFAULT_VIEWING_DISTANCE_CM, CREDIT_CARD_WIDTH_MM };
})();
