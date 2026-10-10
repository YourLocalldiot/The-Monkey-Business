// CMS → Videos tab: the library of videos that playlists are built from.
// A video here is just a name (English + Vietnamese) and a YouTube link;
// the Playlists tab decides where each one is used.
(function () {
  var P = window.CMS;
  var el = P.el;

  // watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
  var YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i;

  function blankVideo() {
    return { id: null, display_name_en: '', display_name_vn: '', youtube_link: '' };
  }

  P.register('videos', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search videos',
      newLabel: 'New',
      onSearch: renderList,
      onNew: function () {
        selectedId = null;
        renderList();
        openEditor(blankVideo());
      },
      onSelect: function (id) {
        var row = videos.filter(function (v) { return v.id === id; })[0];
        if (row) {
          selectedId = id;
          renderList();
          openEditor({
            id: row.id,
            display_name_en: row.display_name_en || '',
            display_name_vn: row.display_name_vn || '',
            youtube_link: row.youtube_link || ''
          });
        }
      }
    });

    var videos = [];
    var selectedId = null;
    var editorToken = 0;

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      editorToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick a video on the left to edit it, or press New to add one.'
      }));
    }

    async function loadList() {
      md.setNote('Loading…');
      var result = await window.sb
        .from('videos')
        .select('id, display_name_en, display_name_vn, youtube_link')
        .order('id', { ascending: false });
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      videos = result.data || [];
      renderList();
    }

    function renderList() {
      var q = P.fold(md.search.value);
      var rows = videos.filter(function (v) {
        return !q || P.fold((v.display_name_en || '') + ' ' + (v.display_name_vn || '')).indexOf(q) !== -1;
      });
      md.setItems(rows.map(function (v) {
        return { id: v.id, title: v.display_name_en || '(untitled)', meta: v.display_name_vn || '' };
      }), selectedId);
      if (!videos.length) md.setNote('No videos yet. Press New to add the first one.');
      else if (!rows.length) md.setNote('No videos match your search.');
      else md.setNote('');
    }

    function openEditor(state, message) {
      showPlaceholder();
      P.clear(md.editor);
      P.setDirty(false);

      var isNew = state.id === null;
      var token = editorToken;
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var nameEn = el('input', {
        type: 'text', maxlength: 200, value: state.display_name_en,
        oninput: function () { state.display_name_en = nameEn.value; changed(); }
      });
      var nameVn = el('input', {
        type: 'text', maxlength: 200, value: state.display_name_vn,
        oninput: function () { state.display_name_vn = nameVn.value; changed(); }
      });
      var link = el('input', {
        type: 'text', inputmode: 'url', value: state.youtube_link,
        placeholder: 'https://www.youtube.com/watch?v=…',
        oninput: function () { state.youtube_link = link.value; changed(); }
      });

      var usage = el('p', { class: 'cms-editor-sub', hidden: isNew });
      if (!isNew) {
        usage.textContent = 'Checking where it is used…';
        P.playlistsUsing('video_id', state.id).then(function (names) {
          if (token !== editorToken) return;
          if (names === null) usage.textContent = '';
          else if (!names.length) usage.textContent = 'Not used in any playlist yet.';
          else usage.textContent = 'Used in: ' + names.join(', ');
        });
      }

      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: isNew ? 'Add video' : 'Save changes' });
      var deleteBtn = isNew ? null : el('button', {
        type: 'button', class: 'btn-danger cms-actions-end', text: 'Delete video', onclick: onDelete
      });

      function validate() {
        if (!state.display_name_en.trim()) {
          nameEn.focus();
          return 'Give the video an English name.';
        }
        if (!YOUTUBE.test(state.youtube_link.trim())) {
          link.focus();
          return 'Paste a YouTube link, like https://www.youtube.com/watch?v=… or https://youtu.be/…';
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

        var youtube = state.youtube_link.trim();
        if (!/^https?:\/\//i.test(youtube)) youtube = 'https://' + youtube;
        var values = {
          display_name_en: state.display_name_en.trim(),
          display_name_vn: state.display_name_vn.trim() || null,
          youtube_link: youtube
        };

        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return isNew
            ? window.sb.from('videos').insert(values).select('id')
            : window.sb.from('videos').update(values).eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        if (!result.data || !result.data.length) {
          P.status(statusEl, 'Nothing was saved. This video may have been deleted; reload the page.', 'error');
          return;
        }

        P.setDirty(false);
        var id = result.data[0].id;
        selectedId = id;
        await loadList();
        var saved = videos.filter(function (v) { return v.id === id; })[0];
        openEditor({
          id: id,
          display_name_en: saved ? saved.display_name_en || '' : values.display_name_en,
          display_name_vn: saved ? saved.display_name_vn || '' : '',
          youtube_link: saved ? saved.youtube_link || '' : values.youtube_link
        }, 'Saved.');
      }

      async function onDelete() {
        var label = state.display_name_en.trim() || 'this video';
        if (!window.confirm('Delete "' + label + '"? This cannot be undone.')) return;
        P.status(statusEl, 'Deleting…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.from('videos').delete().eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error, {
            '23503': 'This video is still in a playlist. Remove it from the playlist first, then delete it.'
          }), 'error');
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
      }

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: isNew ? 'New video' : 'Edit video' }));
      md.editor.appendChild(usage);
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        el('div', { class: 'field-row' },
          P.field('Name (English)', nameEn),
          P.field('Name (Vietnamese)', nameVn)),
        P.field('YouTube link', link),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
