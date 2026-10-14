// The site's own notifications, in the project's colours and fonts, instead of
// the browser's. Loaded (deferred) on every page, before the page's own script.
//
//   UI.toast('Saved.', { kind: 'success' })     a small card that fades away
//                                               (kind: 'info' | 'success' | 'error')
//   await UI.confirm('Delete it?', { title, confirmLabel, cancelLabel, danger })
//                                               -> true / false, like window.confirm
//   await UI.alert('Something happened.')       -> resolves when dismissed
//
// It also takes over the browser's own form-validation bubbles ("Please fill
// out this field"): a field that fails its required / email / minlength /
// pattern check is explained in a toast, in the page's language.
//
// Not covered: the "Leave site?" prompt the browser shows for unsaved changes
// in the CMS. Browsers do not allow that one to be restyled.
(function () {
  var MAX_TOASTS = 4;

  function t(key, vars) {
    return window.I18N ? window.I18N.t(key, vars) : key;
  }

  function svg(path) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>';
  }
  // Static, hard-coded markup only.
  var ICONS = {
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    success: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
    error: svg('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>')
  };

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // ---------- toasts ----------

  var host = null;

  function toastHost() {
    if (!host || !host.isConnected) {
      host = make('div', 'ui-toasts');
      host.setAttribute('role', 'region');
      host.setAttribute('aria-label', t('ui.notifications'));
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, options) {
    options = options || {};
    var kind = ICONS[options.kind] ? options.kind : 'info';
    var container = toastHost();

    var card = make('div', 'ui-toast is-' + kind);
    card.setAttribute('role', kind === 'error' ? 'alert' : 'status');

    var icon = make('span', 'ui-toast-icon');
    icon.innerHTML = ICONS[kind];

    var body = make('span', 'ui-toast-text');
    if (options.title) body.appendChild(make('strong', 'ui-toast-title', options.title));
    body.appendChild(make('span', null, message));

    var close = make('button', 'ui-toast-close');
    close.type = 'button';
    close.setAttribute('aria-label', t('ui.close'));
    close.innerHTML = svg('<path d="M6 6l12 12M18 6L6 18"/>');

    card.appendChild(icon);
    card.appendChild(body);
    card.appendChild(close);
    container.appendChild(card);
    while (container.children.length > MAX_TOASTS) container.removeChild(container.firstChild);

    var timer = null;
    var left = options.duration || (kind === 'error' ? 7000 : 4500);
    var startedAt = 0;
    function dismiss() {
      clearTimeout(timer);
      if (!card.parentNode) return;
      card.classList.add('is-leaving');
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 200);
    }
    function start() {
      startedAt = Date.now();
      timer = setTimeout(dismiss, left);
    }
    function pause() {
      clearTimeout(timer);
      left = Math.max(1500, left - (Date.now() - startedAt));
    }
    close.addEventListener('click', dismiss);
    card.addEventListener('mouseenter', pause);
    card.addEventListener('mouseleave', start);
    card.addEventListener('focusin', pause);
    card.addEventListener('focusout', start);
    start();
    return { dismiss: dismiss };
  }

  // ---------- dialogs ----------

  function dialog(message, options, withCancel) {
    options = options || {};
    return new Promise(function (resolve) {
      var previous = document.activeElement;
      var uid = 'ui-dialog-' + Date.now() + Math.floor(Math.random() * 1000);

      var overlay = make('div', 'ui-overlay');
      var box = make('div', 'ui-dialog');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      box.setAttribute('aria-describedby', uid + '-text');
      if (options.title) {
        var title = make('h2', 'ui-dialog-title', options.title);
        title.id = uid + '-title';
        box.setAttribute('aria-labelledby', title.id);
        box.appendChild(title);
      }
      var text = make('p', 'ui-dialog-text', message);
      text.id = uid + '-text';
      box.appendChild(text);

      var actions = make('div', 'ui-dialog-actions');
      var cancel = null;
      if (withCancel) {
        cancel = make('button', 'btn-secondary', options.cancelLabel || t('ui.cancel'));
        cancel.type = 'button';
        actions.appendChild(cancel);
      }
      var ok = make('button', options.danger ? 'btn-danger' : 'btn-primary', options.confirmLabel || t('ui.ok'));
      ok.type = 'button';
      actions.appendChild(ok);
      box.appendChild(actions);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function finish(answer) {
        document.removeEventListener('keydown', onKey, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (previous && previous.focus && previous.isConnected) previous.focus();
        resolve(answer);
      }
      function onKey(event) {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        } else if (event.key === 'Tab') {
          // keep the focus inside the dialog
          var buttons = cancel ? [cancel, ok] : [ok];
          var at = buttons.indexOf(document.activeElement);
          var next = event.shiftKey ? at - 1 : at + 1;
          event.preventDefault();
          buttons[(next + buttons.length) % buttons.length].focus();
        }
      }
      document.addEventListener('keydown', onKey, true);
      ok.addEventListener('click', function () { finish(true); });
      if (cancel) cancel.addEventListener('click', function () { finish(false); });
      overlay.addEventListener('mousedown', function (event) {
        if (event.target === overlay && withCancel) finish(false);
      });

      // For a destructive question the safe answer has the focus.
      (options.danger && cancel ? cancel : ok).focus();
    });
  }

  // ---------- form validation ----------

  var invalidShown = false;

  function fieldLabel(input) {
    var field = input.closest && input.closest('.field');
    var label = field && field.querySelector(':scope > span');
    return label ? label.textContent.trim() : '';
  }

  function invalidText(input) {
    var v = input.validity;
    if (v.valueMissing) return t('ui.v.required');
    if (v.typeMismatch && input.type === 'email') return t('ui.v.email');
    if (v.typeMismatch) return t('ui.v.format');
    if (v.tooShort) return t('ui.v.tooShort', { min: input.minLength });
    if (v.tooLong) return t('ui.v.tooLong', { max: input.maxLength });
    if (v.patternMismatch) return input.name === 'username' ? t('signup.usernameHint') : t('ui.v.format');
    return input.validationMessage;
  }

  // 'invalid' fires on every failing field; the first one is explained and
  // focused, and the browser's own bubble is suppressed.
  document.addEventListener('invalid', function (event) {
    event.preventDefault();
    var input = event.target;
    input.classList.add('is-invalid');
    input.setAttribute('aria-invalid', 'true');
    if (invalidShown) return;
    invalidShown = true;
    setTimeout(function () { invalidShown = false; }, 0);
    if (input.focus) input.focus();
    var label = fieldLabel(input);
    toast(invalidText(input), { kind: 'error', title: label || undefined });
  }, true);

  document.addEventListener('input', function (event) {
    var input = event.target;
    if (input.classList && input.classList.contains('is-invalid')) {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
    }
  });

  window.UI = {
    toast: toast,
    confirm: function (message, options) { return dialog(message, options, true); },
    alert: function (message, options) { return dialog(message, options, false).then(function () {}); }
  };
})();
