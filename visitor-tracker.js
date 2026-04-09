(function () {
  'use strict';

  var ENDPOINT = 'https://alon09.app.n8n.cloud/webhook/visitor-track';
  var SESSION_KEY = 'vt_session';
  var SENT_KEY = 'vt_sent';
  var startTime = Date.now();
  var pages = [window.location.pathname];

  // ── Session ID ──────────────────────────────────────────────────────────────
  function getSessionId() {
    var id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  // ── UTM params ──────────────────────────────────────────────────────────────
  function getUtm(key) {
    return new URLSearchParams(window.location.search).get(key) || '';
  }

  // ── Device / Browser detection ──────────────────────────────────────────────
  function detectDevice() {
    var ua = navigator.userAgent;
    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) {
      return /iPad|Tablet/i.test(ua) ? 'tablet' : 'mobile';
    }
    return 'desktop';
  }

  function detectBrowser() {
    var ua = navigator.userAgent;
    if (/Edg\//i.test(ua)) return 'Edge';
    if (/Chrome/i.test(ua)) return 'Chrome';
    if (/Firefox/i.test(ua)) return 'Firefox';
    if (/Safari/i.test(ua)) return 'Safari';
    if (/OPR|Opera/i.test(ua)) return 'Opera';
    return 'Other';
  }

  // ── Track page changes (SPA support) ────────────────────────────────────────
  var origPush = history.pushState;
  history.pushState = function () {
    origPush.apply(history, arguments);
    var p = window.location.pathname;
    if (pages[pages.length - 1] !== p) pages.push(p);
  };
  window.addEventListener('popstate', function () {
    var p = window.location.pathname;
    if (pages[pages.length - 1] !== p) pages.push(p);
  });

  // ── Build payload ────────────────────────────────────────────────────────────
  function buildPayload() {
    return JSON.stringify({
      session_id:   getSessionId(),
      landing_page: pages[0],
      referrer:     document.referrer || '',
      utm_source:   getUtm('utm_source'),
      utm_medium:   getUtm('utm_medium'),
      utm_campaign: getUtm('utm_campaign'),
      device_type:  detectDevice(),
      browser:      detectBrowser(),
      time_on_site: Math.round((Date.now() - startTime) / 1000),
      pages_visited: pages,
      screen_width: window.screen.width
    });
  }

  // ── Send via sendBeacon (fire-and-forget) ────────────────────────────────────
  function send() {
    // Don't send if user already converted (submitted lead form)
    if (sessionStorage.getItem('lead_submitted')) return;
    // Don't send twice in the same session
    if (sessionStorage.getItem(SENT_KEY)) return;

    var payload = buildPayload();
    // Use text/plain to avoid CORS preflight (simple request)
    var blob = new Blob([payload], { type: 'text/plain' });
    var ok = navigator.sendBeacon ? navigator.sendBeacon(ENDPOINT, blob) : false;

    if (!ok) {
      // Fallback: async XHR with no-cors
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', ENDPOINT, true);
        xhr.setRequestHeader('Content-Type', 'text/plain');
        xhr.send(payload);
      } catch (e) {}
    }

    sessionStorage.setItem(SENT_KEY, '1');
  }

  // ── Fire on tab close / navigation away ─────────────────────────────────────
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') send();
  });
  window.addEventListener('beforeunload', send);

  // ── Expose helper for lead form: call window.vtMarkConverted() on form submit ─
  window.vtMarkConverted = function () {
    sessionStorage.setItem('lead_submitted', '1');
  };
})();
