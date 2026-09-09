(() => {
  const now = new Date();
  const schoolYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearLabel = document.getElementById('school-year-label');
  if (yearLabel) yearLabel.textContent = `${schoolYear}–${String(schoolYear + 1).slice(-2)}`;
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
