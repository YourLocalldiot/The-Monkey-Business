// CMS → Effects tab: the flashes that play in a quiz when a player picks a
// right (Correct) or a wrong (Incorrect) answer, or claims a quiz's rewards
// (Reward). Each effect has a kind, a
// text or emoji, a flash colour and how long the flash lasts. When there are
// several of a kind, the quiz picks one at random. The table is quiz_effects
// (docs/supabase-sql.md); moderators write it directly, Row Level Security
// does the guarding.
(function () {
  var P = window.CMS;
  var el = P.el;

  var KINDS = { correct: 'Correct effect', incorrect: 'Incorrect effect', reward: 'Reward effect' };
  var KIND_ORDER = { correct: 0, incorrect: 1, reward: 2 };
  var HEX = /^#[0-9a-f]{6}$/i;

  function blankEffect() {
    return { id: null, kind: 'correct', content: '', color: '#3fb56a', duration_seconds: 1 };
  }

  function seconds(value) {
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' s';
  }

  P.register('effects', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search effects',
      searchLabel: 'Search effects by text or by type (correct / incorrect / reward)',
      newLabel: 'New',
      onSearch: renderList,
      onNew: function () {
        selectedId = null;
        renderList();
        openEditor(blankEffect());
      },
      onSelect: function (id) {
        var row = effects.filter(function (e) { return e.id === id; })[0];
        if (row) {
          selectedId = id;
          renderList();
          openEditor({
            id: row.id, kind: row.kind, content: row.content,
            color: row.color, duration_seconds: Number(row.duration_seconds)
          });
        }
      }
    });

    var effects = [];
    var selectedId = null;
    var editorToken = 0;

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      editorToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick an effect on the left to edit it, or press New to add one.'
      }));
    }

    async function loadList() {
      md.setNote('Loading…');
      var result = await window.sb
        .from('quiz_effects')
        .select('id, kind, content, color, duration_seconds')
        .order('id');
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      effects = (result.data || []).slice().sort(function (a, b) {
        return (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || (a.id - b.id);
      });
      renderList();
    }

    function renderList() {
      var q = P.fold(md.search.value);
      var rows = effects.filter(function (e) {
        return !q || P.fold(e.content + ' ' + KINDS[e.kind] + ' ' + e.kind).indexOf(q) !== -1;
      });
      md.setItems(rows.map(function (e) {
        return { id: e.id, title: e.content, meta: KINDS[e.kind] + ' · ' + seconds(e.duration_seconds) + ' · ' + e.color };
      }), selectedId);
      if (!effects.length) md.setNote('No effects yet. Press New to add one. Without any, a quiz shows no flash.');
      else if (!rows.length) md.setNote('No effects match your search.');
      else md.setNote('');
    }

    function openEditor(state, message) {
      showPlaceholder();
      P.clear(md.editor);
      P.setDirty(false);

      var isNew = state.id === null;
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var kind = el('select', {
        onchange: function () { state.kind = kind.value; changed(); }
      },
        el('option', { value: 'correct', text: KINDS.correct }),
        el('option', { value: 'incorrect', text: KINDS.incorrect }),
        el('option', { value: 'reward', text: KINDS.reward }));
      kind.value = state.kind;

      var content = el('input', {
        type: 'text', maxlength: 40, value: state.content, placeholder: '✅',
        oninput: function () { state.content = content.value; changed(); }
      });

      var hex = el('span', { class: 'cms-fx-hex', text: state.color.toLowerCase() });
      var color = el('input', {
        type: 'color', value: state.color.toLowerCase(),
        oninput: function () { state.color = color.value; hex.textContent = color.value; changed(); }
      });

      var duration = el('input', {
        type: 'number', min: 0.2, max: 10, step: 0.1, inputmode: 'decimal', value: String(state.duration_seconds),
        oninput: function () { state.duration_seconds = duration.value === '' ? NaN : Number(duration.value); changed(); }
      });

      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: isNew ? 'Add effect' : 'Save changes' });
      var previewBtn = el('button', {
        type: 'button', class: 'btn-secondary',
        onclick: function () {
          var problem = validate(true);
          if (problem) { P.status(statusEl, problem, 'error'); return; }
          P.status(statusEl, '');
          window.Effects.play({ content: state.content.trim(), color: state.color, duration_seconds: state.duration_seconds });
        }
      }, 'Preview');
      var deleteBtn = isNew ? null : el('button', {
        type: 'button', class: 'btn-danger cms-actions-end', text: 'Delete effect', onclick: onDelete
      });

      function validate(quiet) {
        if (!state.content.trim()) {
          if (!quiet) content.focus();
          return 'Type the text or emoji to flash.';
        }
        if (!HEX.test(state.color)) return 'Pick a colour for the flash.';
        if (!(state.duration_seconds >= 0.2 && state.duration_seconds <= 10)) {
          if (!quiet) duration.focus();
          return 'The flash time must be between 0.2 and 10 seconds.';
        }
        return '';
      }

      async function onSubmit(event) {
        event.preventDefault();
        var problem = validate(false);
        if (problem) {
          P.status(statusEl, problem, 'error');
          return;
        }
        var values = {
          kind: state.kind,
          content: state.content.trim(),
          color: state.color.toLowerCase(),
          duration_seconds: Math.round(state.duration_seconds * 10) / 10
        };

        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, previewBtn, deleteBtn], function () {
          return isNew
            ? window.sb.from('quiz_effects').insert(values).select('id')
            : window.sb.from('quiz_effects').update(values).eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        if (!result.data || !result.data.length) {
          P.status(statusEl, 'Nothing was saved. This effect may have been deleted; reload the page.', 'error');
          return;
        }

        P.setDirty(false);
        var id = result.data[0].id;
        selectedId = id;
        await loadList();
        window.UI.toast(isNew ? 'Effect added.' : 'Effect saved.', { kind: 'success' });
        openEditor({ id: id, kind: values.kind, content: values.content, color: values.color, duration_seconds: values.duration_seconds }, 'Saved.');
      }

      async function onDelete() {
        var label = state.content.trim() || 'this effect';
        var yes = await window.UI.confirm('Delete the effect "' + label + '"? Quizzes will stop using it.', {
          title: 'Delete effect', confirmLabel: 'Delete', cancelLabel: 'Keep it', danger: true
        });
        if (!yes) return;
        P.status(statusEl, 'Deleting…');
        var result = await P.withBusy([saveBtn, previewBtn, deleteBtn], function () {
          return window.sb.from('quiz_effects').delete().eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        if (!result.data || !result.data.length) {
          P.status(statusEl, 'Nothing was deleted. It may already be gone; reload the page.', 'error');
          return;
        }
        P.setDirty(false);
        selectedId = null;
        showPlaceholder('Deleted "' + label + '".');
        await loadList();
        window.UI.toast('Effect deleted.', { kind: 'success' });
      }

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: isNew ? 'New effect' : 'Edit effect' }));
      md.editor.appendChild(el('p', { class: 'cms-editor-sub', text: 'Plays on the whole screen in a quiz: a Correct or Incorrect effect each time a player picks a right or a wrong answer (or runs out of time without answering, which counts as wrong), a Reward effect when they press Claim rewards (a banana is used if there is none). With several effects of the same type, one is picked at random.' }));
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        el('div', { class: 'field-row' },
          P.field('Type', kind),
          P.field('Text or emoji', content, 'Shown big in the middle of the screen.')),
        el('div', { class: 'field-row' },
          P.field('Flash colour', el('span', { class: 'cms-fx-swatch' }, color, hex)),
          P.field('Flash time (seconds)', duration, 'How long the flash lasts: 0.2 to 10.')),
        el('div', { class: 'cms-actions' }, saveBtn, previewBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
