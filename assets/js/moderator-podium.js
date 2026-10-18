// CMS → Podium talk tab: the things a player on a quiz's podium (the top 3 of
// its leaderboard) can choose to say. Each option is an emoji or a short
// phrase, with an optional Vietnamese version (Vietnamese-language viewers see
// that one instead). Whatever a podium holder picks appears in a speech bubble
// next to their name. The table is podium_talk (docs/supabase-sql.md);
// moderators write it directly, Row Level Security does the guarding.
(function () {
  var P = window.CMS;
  var el = P.el;

  function blankOption(nextPosition) {
    return { id: null, position: nextPosition, content: '', content_vn: '' };
  }

  P.register('podium', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search podium talk',
      searchLabel: 'Search the things a podium holder can say',
      newLabel: 'New',
      onSearch: renderList,
      onNew: function () {
        selectedId = null;
        renderList();
        openEditor(blankOption(options.length ? options[options.length - 1].position + 10 : 10));
      },
      onSelect: function (id) {
        var row = options.filter(function (o) { return o.id === id; })[0];
        if (row) {
          selectedId = id;
          renderList();
          openEditor({ id: row.id, position: row.position, content: row.content, content_vn: row.content_vn || '' });
        }
      }
    });

    var options = [];
    var selectedId = null;
    var editorToken = 0;

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      editorToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick one on the left to edit it, or press New to add an emoji or a phrase.'
      }));
    }

    async function loadList() {
      md.setNote('Loading…');
      var result = await window.sb
        .from('podium_talk')
        .select('id, position, content, content_vn')
        .order('position')
        .order('id');
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      options = result.data || [];
      renderList();
    }

    function renderList() {
      var q = P.fold(md.search.value);
      var rows = options.filter(function (o) {
        return !q || P.fold(o.content + ' ' + (o.content_vn || '')).indexOf(q) !== -1;
      });
      md.setItems(rows.map(function (o) {
        return { id: o.id, title: o.content, meta: o.content_vn ? 'Vietnamese: ' + o.content_vn : 'Order ' + o.position };
      }), selectedId);
      if (!options.length) md.setNote('Nothing to choose from yet: podium holders can not say anything. Press New to add something.');
      else if (!rows.length) md.setNote('Nothing matches your search.');
      else md.setNote('');
    }

    function openEditor(state, message) {
      showPlaceholder();
      P.clear(md.editor);
      P.setDirty(false);

      var isNew = state.id === null;
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var content = el('input', {
        type: 'text', maxlength: 40, value: state.content, placeholder: '🎉 or GG!',
        oninput: function () { state.content = content.value; refreshPreview(); changed(); }
      });
      var contentVn = el('input', {
        type: 'text', maxlength: 40, value: state.content_vn, placeholder: 'Dễ ợm!',
        oninput: function () { state.content_vn = contentVn.value; refreshPreview(); changed(); }
      });
      var position = el('input', {
        type: 'number', min: 0, max: 9999, step: 1, inputmode: 'numeric', value: String(state.position),
        oninput: function () { state.position = position.value === '' ? NaN : Number(position.value); changed(); }
      });

      // How it looks on the leaderboard, as the viewer would see it.
      var previewEn = el('span', { class: 'quiz-board-talk' });
      var previewVn = el('span', { class: 'quiz-board-talk' });
      function fill(node, text) {
        node.textContent = text;
        node.classList.toggle('is-phrase', /[\p{L}\p{N}]/u.test(text));
        node.style.animation = 'none';
      }
      function refreshPreview() {
        var en = state.content.trim() || '…';
        fill(previewEn, en);
        fill(previewVn, state.content_vn.trim() || en);
      }
      refreshPreview();

      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: isNew ? 'Add' : 'Save changes' });
      var deleteBtn = isNew ? null : el('button', {
        type: 'button', class: 'btn-danger cms-actions-end', text: 'Delete', onclick: onDelete
      });

      function validate() {
        if (!state.content.trim()) {
          content.focus();
          return 'Type an emoji or a short phrase.';
        }
        if (!(Number.isInteger(state.position) && state.position >= 0 && state.position <= 9999)) {
          position.focus();
          return 'The order must be a whole number from 0 to 9999.';
        }
        return '';
      }

      async function onSubmit(event) {
        event.preventDefault();
        var problem = validate();
        if (problem) {
          P.status(statusEl, problem, 'error');
          return;
        }
        var values = {
          position: state.position,
          content: state.content.trim(),
          content_vn: state.content_vn.trim() || null
        };

        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return isNew
            ? window.sb.from('podium_talk').insert(values).select('id')
            : window.sb.from('podium_talk').update(values).eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        if (!result.data || !result.data.length) {
          P.status(statusEl, 'Nothing was saved. This option may have been deleted; reload the page.', 'error');
          return;
        }

        P.setDirty(false);
        var id = result.data[0].id;
        selectedId = id;
        await loadList();
        window.UI.toast(isNew ? 'Added.' : 'Saved.', { kind: 'success' });
        openEditor({ id: id, position: values.position, content: values.content, content_vn: values.content_vn || '' }, 'Saved.');
      }

      async function onDelete() {
        var label = state.content.trim() || 'this option';
        var yes = await window.UI.confirm('Delete "' + label + '"? Podium holders who chose it will stop showing it.', {
          title: 'Delete podium talk', confirmLabel: 'Delete', cancelLabel: 'Keep it', danger: true
        });
        if (!yes) return;
        P.status(statusEl, 'Deleting…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.from('podium_talk').delete().eq('id', state.id).select('id');
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
        window.UI.toast('Deleted.', { kind: 'success' });
      }

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: isNew ? 'New podium talk' : 'Edit podium talk' }));
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: 'What a player on a quiz\'s podium (the top 3 of its leaderboard) can choose to say. It shows in a speech bubble next to their name. Add emojis or short phrases.'
      }));
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        el('div', { class: 'field-row' },
          P.field('Emoji or phrase', content, 'Up to 40 characters.'),
          P.field('In Vietnamese (optional)', contentVn, 'Shown instead to players using the site in Vietnamese. Leave empty to show the same.')),
        P.field('Order', position, 'Smaller numbers are listed first.', 'cms-q-time'),
        el('div', { class: 'cms-podium-preview' },
          el('span', { class: 'cms-podium-preview-label', text: 'Preview' }),
          el('div', { class: 'cms-podium-preview-row' }, el('span', { class: 'cms-podium-preview-lang', text: 'English' }), previewEn),
          el('div', { class: 'cms-podium-preview-row' }, el('span', { class: 'cms-podium-preview-lang', text: 'Vietnamese' }), previewVn)),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
