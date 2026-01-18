(() => {
  const sels = [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[id$="helper-text"]',
    '[data-testid*="error"]',
    '.error',
    '.helper-text',
  ];
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) return el.innerText.trim();
  }
  return '';
})();

