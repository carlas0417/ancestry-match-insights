// Capture the rendered DOM without running site scripts in the saved snapshot.
// This function is self-contained because Chrome serializes it for injection.
globalThis.captureLoadedPage = function captureLoadedPage() {
  const root = document.documentElement.cloneNode(true);
  const liveFields = document.querySelectorAll('textarea, input, select');
  root.querySelectorAll('textarea, input, select').forEach((copy, index) => {
    const live = liveFields[index];
    if (copy.tagName === 'TEXTAREA') copy.textContent = live.value;
    else if (copy.tagName === 'SELECT') [...copy.options].forEach((option, i) => option.toggleAttribute('selected', live.options[i].selected));
    else if (!['password', 'hidden', 'file'].includes(live.type)) {
      copy.setAttribute('value', live.value);
      copy.toggleAttribute('checked', live.checked);
    }
  });
  root.querySelectorAll('script, noscript, iframe, object, embed, link, base, meta, input[type="hidden"], input[type="password"], input[type="file"]').forEach(el => el.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || /^(?:src|srcset|srcdoc|nonce|action|formaction|ping)$/i.test(attr.name) || /token|authorization|csrf/i.test(attr.name)) el.removeAttribute(attr.name);
    }
  }
  const head = root.querySelector('head') || root.insertBefore(document.createElement('head'), root.firstChild);
  const charset = document.createElement('meta'); charset.setAttribute('charset', 'utf-8');
  const policy = document.createElement('meta'); policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
  head.prepend(charset, policy);
  root.setAttribute('data-captured-path', location.pathname);
  return { title: document.title, html: '<!doctype html>\n' + root.outerHTML };
};
