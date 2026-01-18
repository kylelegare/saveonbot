(() => {
  const notLogin = !/\/login(\b|\/|\?|#)/i.test(location.pathname);
  const sels = [
    '[role="alert"]',
    '[aria-live="assertive"]',
    '[id$="helper-text"]',
    '[data-testid*="error"]',
    '.error',
    '.helper-text',
  ];
  let err = '';
  for (const s of sels) {
    const el = document.querySelector(s);
    if (el) { err = el.innerText.trim(); break; }
  }
  return { notLogin, err };
})();

