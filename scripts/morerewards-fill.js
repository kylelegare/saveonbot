(() => {
  const u = atob('USER_B64');
  const p = atob('PASS_B64');
  const q = (s) => document.querySelector(s);
  const pick = (arr) => arr.map(q).find(Boolean);
  const fill = (el, v) => {
    if (!el) return;
    el.focus();
    el.value = '';
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const email = pick(['#email', 'input[type=email]', 'input[name=email]', 'input[id*=email i]']);
  const pass = pick(['#password', 'input[type=password]', 'input[name=password]', 'input[id*=password i]']);
  fill(email, u);
  fill(pass, p);
  const btn = [...document.querySelectorAll('button[type=submit]')]
    .find((b) => /sign\s*in/i.test(b.innerText) && !b.disabled);
  if (btn) {
    btn.click();
    return 'clicked';
  }
  return 'no-btn';
})();

