(() => {
  const mode = document.getElementById('rain-mode');
  try { if (mode) mode.value = localStorage.getItem('rain-glass-mode') || 'auto'; } catch {}
  mode?.addEventListener('change', () => window.RainGlass?.setMode(mode.value));
  const now = new Date();
  const schoolYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearLabel = document.getElementById('school-year-label');
  if (yearLabel) yearLabel.textContent = `${schoolYear}–${String(schoolYear + 1).slice(-2)}`;
  const feeds = new Map();
  const names = { school: 'School', letter: 'Letter days', hockey: 'Hockey' };
  const urls = {
    school: 'https://www.lmsd.org/bala-cynwyd/about/calendar',
    letter: 'https://www.lmsd.org/bala-cynwyd/academics/letter-day',
    hockey: 'https://www.lowermerionihc.com/calendar',
  };
  window.CalendarHealth = {
    report(source, data) {
      if (!names[source]) return;
      feeds.set(source, data);
      const host = document.getElementById('feed-health');
      if (!host) return;
      host.replaceChildren();
      for (const [key, label] of Object.entries(names)) {
        const feed = feeds.get(key);
        const future = feed?.events?.some(event => event.startDate >= `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`);
        const status = !feed ? 'Loading' : feed.unavailable ? 'Unavailable' : feed.stale ? 'Saved copy · refresh failed' : !future ? 'No future dates' : 'Up to date';
        const link = document.createElement('a');
        link.href = urls[key]; link.target = '_blank'; link.rel = 'noopener';
        link.className = 'feed-badge';
        link.dataset.warning = Boolean(feed && (feed.unavailable || feed.stale || !future));
        link.textContent = `${label}: ${status}`;
        link.title = feed?.fetchedAt ? `Last synced ${new Date(feed.fetchedAt).toLocaleString()}. Open official calendar.` : 'Open official calendar';
        host.appendChild(link);
      }
    },
  };
  // Keep keyboard focus inside any existing sign-in/event/task dialog.
  let previousFocus = null;
  document.querySelectorAll('.modal').forEach(modal => {
    new MutationObserver(() => {
      if (modal.classList.contains('is-open')) {
        previousFocus = document.activeElement;
        modal.querySelector('input, button, select, textarea')?.focus();
      } else if (previousFocus?.isConnected) previousFocus.focus();
    }).observe(modal, { attributes: true, attributeFilter: ['aria-hidden'] });
    modal.addEventListener('keydown', event => {
      if (event.key === 'Escape') { modal.querySelector('[data-close-modal]')?.click(); return; }
      if (event.key !== 'Tab') return;
      const fields = [...modal.querySelectorAll('button, input, textarea, select, a[href]')].filter(el => !el.disabled && el.getClientRects().length);
      const first = fields[0], last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { last?.focus(); event.preventDefault(); }
      if (!event.shiftKey && document.activeElement === last) { first?.focus(); event.preventDefault(); }
    });
  });
})();
