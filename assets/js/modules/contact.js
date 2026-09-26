const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TIMEOUT_MS = 20000;

/** "Copy address" button, only offered where the Clipboard API is available. */
function initCopy(ui) {
  const button = document.querySelector('[data-copy]');
  const live = document.querySelector('[data-copy-status]');
  if (!button || !ui || !navigator.clipboard || !window.isSecureContext) return;

  const label = button.querySelector('[data-copy-text]');
  let timer;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch {
      return;
    }
    label.textContent = ui.copied;
    button.classList.add('is-done');
    if (live) live.textContent = ui.copied;
    clearTimeout(timer);
    timer = setTimeout(() => {
      label.textContent = ui.copy;
      button.classList.remove('is-done');
      if (live) live.textContent = '';
    }, 2400);
  });
}

/**
 * Contact form sent to the owner's inbox through FormSubmit's AJAX endpoint.
 * Without JS the form still posts to FormSubmit's regular endpoint.
 */
export function initContact(form, ui) {
  initCopy(ui);
  if (!form || !ui) return;

  const t = ui.form;
  const endpoint = form.dataset.endpoint;
  const status = form.querySelector('[data-form-status]');
  const summary = form.querySelector('[data-form-summary]');
  const submit = form.querySelector('[data-submit]');
  const submitLabel = form.querySelector('[data-submit-label]');
  const fields = {
    name: form.elements.namedItem('nom'),
    email: form.elements.namedItem('email'),
    message: form.elements.namedItem('message'),
  };
  const rules = {
    name: (value) => (value ? '' : t.errors.required),
    email: (value) => (!value ? t.errors.required : EMAIL_PATTERN.test(value) ? '' : t.errors.email),
    message: (value) => (!value ? t.errors.required : value.length < 10 ? t.errors.short : ''),
  };
  let sending = false;

  form.noValidate = true; // our messages are translated and announced; the browser's are not

  const validate = (key) => {
    const input = fields[key];
    const message = rules[key](input.value.trim());
    const output = document.getElementById(input.getAttribute('aria-describedby'));
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    output.textContent = message;
    return !message;
  };

  for (const key of Object.keys(fields)) {
    const input = fields[key];
    input.addEventListener('blur', () => {
      if (input.value.trim()) validate(key);
    });
    input.addEventListener('input', () => {
      if (input.getAttribute('aria-invalid') === 'true') validate(key);
    });
  }

  const setSending = (value) => {
    sending = value;
    submit.setAttribute('aria-busy', String(value));
    submit.setAttribute('aria-disabled', String(value));
    submitLabel.textContent = value ? t.sending : t.submit;
  };

  const showStatus = (kind) => {
    const title = document.createElement('strong');
    const text = document.createElement('p');
    if (kind === 'success') {
      title.textContent = t.successTitle;
      text.textContent = t.successText;
    } else {
      title.textContent = t.errorTitle;
      const mail = document.createElement('a');
      mail.href = ui.mailto;
      mail.textContent = ui.email;
      text.append(`${t.errorText} `, mail, '.');
    }
    status.className = `form-status is-${kind}`;
    status.replaceChildren(title, text);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;

    const invalid = Object.keys(fields).filter((key) => !validate(key));
    if (invalid.length) {
      summary.textContent = t.errorSummary;
      summary.hidden = false;
      fields[invalid[0]].focus();
      return;
    }
    summary.hidden = true;

    const data = Object.fromEntries(new FormData(form));
    if (data._honey) return; // filled by a bot: silently ignore
    data._subject = `${ui.subject} — ${data.nom.trim()}`.slice(0, 180);

    status.className = 'form-status';
    status.replaceChildren();
    setSending(true);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(data),
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !(body.success === true || body.success === 'true')) {
        throw new Error(body.message || `HTTP ${response.status}`);
      }
      form.reset();
      showStatus('success');
    } catch {
      showStatus('error');
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  });
}
