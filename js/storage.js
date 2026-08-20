/**
 * storage.js
 * All data stays on-device (localStorage). Nothing is sent anywhere —
 * relevant for a health-adjacent app with no backend and no accounts.
 */

const Store = (() => {
  const KEY_SESSIONS = 'vt_sessions';
  const KEY_ASSESSMENTS = 'vt_assessments';
  const KEY_PROFILE = 'vt_profile';
  const KEY_PARAMS = 'vt_condition_params';

  function _get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Storage read error', key, e);
      return fallback;
    }
  }
  function _set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error('Storage write error', key, e);
      return false;
    }
  }

  // ---- Sessions (training) ----
  function getSessions() { return _get(KEY_SESSIONS, []); }
  function addSession(sessionRecord) {
    const sessions = getSessions();
    sessions.push(sessionRecord);
    _set(KEY_SESSIONS, sessions);
    return sessions;
  }

  // ---- Assessments (pre/post test batteries) ----
  function getAssessments() { return _get(KEY_ASSESSMENTS, []); }
  function addAssessment(record) {
    const list = getAssessments();
    list.push(record);
    _set(KEY_ASSESSMENTS, list);
    return list;
  }

  // ---- Profile ----
  function getProfile() {
    return _get(KEY_PROFILE, {
      createdAt: new Date().toISOString(),
      lastSessionAt: null,
      streakDays: 0,
      totalSessions: 0,
    });
  }
  function updateProfile(patch) {
    const p = { ...getProfile(), ...patch };
    _set(KEY_PROFILE, p);
    return p;
  }

  function recordSessionCompletion() {
    const profile = getProfile();
    const now = new Date();
    const last = profile.lastSessionAt ? new Date(profile.lastSessionAt) : null;
    let streak = profile.streakDays || 0;

    if (last) {
      const daysSince = Math.floor((now - last) / 86400000);
      if (daysSince === 0) {
        // same day, streak unchanged
      } else if (daysSince === 1) {
        streak += 1;
      } else {
        streak = 1;
      }
    } else {
      streak = 1;
    }

    return updateProfile({
      lastSessionAt: now.toISOString(),
      streakDays: streak,
      totalSessions: (profile.totalSessions || 0) + 1,
    });
  }

  // ---- Per-condition adaptive difficulty parameters (persist across sessions) ----
  function getConditionParams() {
    return _get(KEY_PARAMS, {
      T:     { isiMs: 240, durationMs: 100, cyclesPerPatch: 4 },
      LM:    { isiMs: 240, durationMs: 100, cyclesPerPatch: 4, separation: 3 },
      'BM-T':  { isiMs: 240, durationMs: 100, cyclesPerPatch: 4 },
      'BM-LM': { isiMs: 240, durationMs: 100, cyclesPerPatch: 4, separation: 3 },
    });
  }
  function setConditionParams(params) { _set(KEY_PARAMS, params); }

  function exportAll() {
    return {
      profile: getProfile(),
      sessions: getSessions(),
      assessments: getAssessments(),
      conditionParams: getConditionParams(),
      exportedAt: new Date().toISOString(),
    };
  }

  function wipeAll() {
    [KEY_SESSIONS, KEY_ASSESSMENTS, KEY_PROFILE, KEY_PARAMS, 'vt_calibration'].forEach(k => localStorage.removeItem(k));
  }

  return {
    getSessions, addSession,
    getAssessments, addAssessment,
    getProfile, updateProfile, recordSessionCompletion,
    getConditionParams, setConditionParams,
    exportAll, wipeAll,
  };
})();
