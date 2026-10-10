// Panel → Playlists tab: create and edit playlists, including the ordered
// list of videos and quizzes inside each one. A save goes through the
// save_playlist() database function (docs/supabase-sql.md), so the
// playlist and its contents are written all-or-nothing.
(function () {
  var P = window.Panel;
  var el = P.el;

  var DETAIL_COLUMNS =
    'playlist_id, display_name_en, display_name_vn, description_en, description_vn, image_url, ' +
    'playlist_items(id, position, item_type, video_id, quiz_id, videos(display_name_en), quizzes(display_name))';

  function blankPlaylist() {
    return {
      playlist_id: null,
      display_name_en: '', display_name_vn: '',
      description_en: '', description_vn: '',
      image_url: '',
      items: []
    };
  }

  function isValidImageUrl(url) {
    return /^https?:\/\/\S+$/i.test(url) || /^assets\/\S+$/.test(url);
  }

  P.register('playlists', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search playlists',
      newLabel: 'New',
      onSearch: renderList,
      onNew: function () {
        selectedId = null;
        renderList();
        openEditor(blankPlaylist());
      },
      onSelect: function (id) { loadPlaylist(id); }
    });

    var playlists = [];
    var selectedId = null;
    var openToken = 0;   // bumped whenever the editor changes, so a slow load can't overwrite a newer one

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      openToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick a playlist on the left to edit it, or press New to start one.'
      }));
    }

    async function loadList() {
      md.setNote('Loading…');
      var result = await window.sb
        .from('playlists')
        .select('playlist_id, display_name_en, display_name_vn, playlist_items(count)')
        .order('playlist_id', { ascending: true });
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      playlists = result.data || [];
      renderList();
    }

    function countLabel(p) {
      var n = p.playlist_items && p.playlist_items[0] ? p.playlist_items[0].count : 0;
      return n === 1 ? '1 item' : n + ' items';
    }

    function renderList() {
      var q = P.fold(md.search.value);
      var rows = playlists.filter(function (p) {
        return !q || P.fold((p.display_name_en || '') + ' ' + (p.display_name_vn || '')).indexOf(q) !== -1;
      });
      md.setItems(rows.map(function (p) {
        return { id: p.playlist_id, title: p.display_name_en || '(untitled)', meta: countLabel(p) };
      }), selectedId);
      if (!playlists.length) md.setNote('No playlists yet. Press New to add the first one.');
      else if (!rows.length) md.setNote('No playlists match your search.');
      else md.setNote('');
    }

    async function loadPlaylist(id, message) {
      selectedId = id;
      renderList();
      showPlaceholder('Loading…');
      var token = openToken;

      var result = await window.sb
        .from('playlists')
        .select(DETAIL_COLUMNS)
        .eq('playlist_id', id)
        .single();
      if (token !== openToken) return;

      if (result.error) {
        P.clear(md.editor);
        md.editor.appendChild(el('p', { class: 'cms-status is-error', text: P.errorText(result.error) }));
        return;
      }

      var row = result.data;
      var items = (row.playlist_items || []).slice()
        .sort(function (a, b) { return (a.position - b.position) || (a.id - b.id); })
        .map(function (item) {
          var isQuiz = item.item_type === 'quiz';
          var target = isQuiz ? item.quizzes : item.videos;
          return {
            id: item.id,
            type: item.item_type,
            ref_id: isQuiz ? item.quiz_id : item.video_id,
            title: target ? (isQuiz ? target.display_name : target.display_name_en) : '(missing ' + item.item_type + ')'
          };
        });

      openEditor({
        playlist_id: row.playlist_id,
        display_name_en: row.display_name_en || '',
        display_name_vn: row.display_name_vn || '',
        description_en: row.description_en || '',
        description_vn: row.description_vn || '',
        image_url: row.image_url || '',
        items: items
      }, message);
    }

    function openEditor(state, message) {
      showPlaceholder();   // also invalidates any load still in flight
      P.clear(md.editor);
      P.setDirty(false);

      var isNew = state.playlist_id === null;
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var nameEn = el('input', {
        type: 'text', maxlength: 200, value: state.display_name_en,
        placeholder: 'Season 1: Business Model 101',
        oninput: function () { state.display_name_en = nameEn.value; changed(); }
      });
      var nameVn = el('input', {
        type: 'text', maxlength: 200, value: state.display_name_vn,
        oninput: function () { state.display_name_vn = nameVn.value; changed(); }
      });
      var descEn = el('textarea', {
        rows: 3, maxlength: 2000, value: state.description_en,
        oninput: function () { state.description_en = descEn.value; changed(); }
      });
      var descVn = el('textarea', {
        rows: 3, maxlength: 2000, value: state.description_vn,
        oninput: function () { state.description_vn = descVn.value; changed(); }
      });

      var preview = el('img', { class: 'cms-image-preview', alt: '', hidden: true });
      preview.addEventListener('error', function () { preview.hidden = true; });
      function updatePreview() {
        var url = state.image_url.trim();
        if (url && isValidImageUrl(url)) {
          preview.src = url;
          preview.hidden = false;
        } else {
          preview.hidden = true;
          preview.removeAttribute('src');
        }
      }
      var imageUrl = el('input', {
        type: 'text', value: state.image_url, placeholder: 'https://… (optional)',
        oninput: function () { state.image_url = imageUrl.value; updatePreview(); changed(); }
      });
      updatePreview();

      // ----- contents -----
      var contentsList = el('ol', { class: 'cms-contents' });

      function renderContents(focusIndex, focusAction) {
        P.clear(contentsList);
        if (!state.items.length) {
          contentsList.appendChild(el('li', { class: 'cms-empty', text: 'Nothing in this playlist yet. Add videos and quizzes below.' }));
          return;
        }
        state.items.forEach(function (item, index) {
          var up = P.iconButton('Move up', 'up', function () { move(index, -1); });
          var down = P.iconButton('Move down', 'down', function () { move(index, 1); });
          up.dataset.action = 'up';
          down.dataset.action = 'down';
          up.disabled = index === 0;
          down.disabled = index === state.items.length - 1;
          contentsList.appendChild(el('li', { class: 'cms-content-row' },
            el('span', { class: 'cms-index tnum', text: String(index + 1) }),
            el('span', { class: 'type-pill ' + item.type, text: item.type === 'quiz' ? 'Quiz' : 'Video' }),
            el('span', { class: 'cms-content-title', text: item.title }),
            up, down,
            P.iconButton('Remove from playlist', 'close', function () {
              state.items.splice(index, 1);
              renderContents();
              changed();
            }, 'danger')));
        });
        if (focusIndex !== undefined) {
          var row = contentsList.children[focusIndex];
          var wanted = row && row.querySelector('[data-action="' + focusAction + '"]');
          if (wanted && wanted.disabled) wanted = row.querySelector('[data-action="' + (focusAction === 'up' ? 'down' : 'up') + '"]');
          if (wanted && !wanted.disabled) wanted.focus();
        }
      }

      function move(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= state.items.length) return;
        var item = state.items.splice(index, 1)[0];
        state.items.splice(target, 0, item);
        renderContents(target, delta < 0 ? 'up' : 'down');
        changed();
      }

      var picker = buildPicker(function (item) {
        state.items.push(item);
        renderContents();
        changed();
      }, function () { return state.items; });

      renderContents();

      // ----- actions -----
      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: isNew ? 'Create playlist' : 'Save changes' });
      var deleteBtn = isNew ? null : el('button', {
        type: 'button', class: 'btn-danger cms-actions-end', text: 'Delete playlist', onclick: onDelete
      });

      function validate() {
        if (!state.display_name_en.trim()) {
          nameEn.focus();
          return 'Give the playlist an English name.';
        }
        var url = state.image_url.trim();
        if (url && !isValidImageUrl(url)) {
          imageUrl.focus();
          return 'The image link must start with https:// (or http://).';
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
        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.rpc('save_playlist', {
            p_playlist_id: state.playlist_id,
            p_display_name_en: state.display_name_en.trim(),
            p_display_name_vn: state.display_name_vn.trim(),
            p_description_en: state.description_en.trim(),
            p_description_vn: state.description_vn.trim(),
            p_image_url: state.image_url.trim(),
            p_items: state.items.map(function (item) {
              return { id: item.id, type: item.type, ref_id: item.ref_id };
            })
          });
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error, {
            '23503': 'One of the videos or quizzes in this playlist no longer exists. Remove it and try again.'
          }), 'error');
          return;
        }
        P.setDirty(false);
        await loadList();
        await loadPlaylist(result.data, 'Saved.');
      }

      async function onDelete() {
        var label = state.display_name_en.trim() || 'this playlist';
        if (!window.confirm('Delete "' + label + '"? Its list of contents goes with it; the videos and quizzes themselves are kept.')) return;
        P.status(statusEl, 'Deleting…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.from('playlists').delete().eq('playlist_id', state.playlist_id).select('playlist_id');
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
      }

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: isNew ? 'New playlist' : 'Edit playlist' }));
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        el('div', { class: 'field-row' },
          P.field('Name (English)', nameEn),
          P.field('Name (Vietnamese)', nameVn)),
        P.field('Description (English)', descEn),
        P.field('Description (Vietnamese)', descVn),
        P.field('Image link', imageUrl, 'Optional. A picture shown next to the playlist name.'),
        preview,
        el('section', { class: 'cms-section' },
          el('div', { class: 'cms-section-head' },
            el('h3', { text: 'Contents' }),
            el('span', { class: 'cms-hint', text: 'Played in this order' })),
          contentsList,
          picker),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }

    // The "add a video or quiz" box under a playlist's contents. Lists load
    // from the database the first time each kind is opened.
    function buildPicker(onAdd, getItems) {
      var kind = 'video';
      var cache = {};
      var token = 0;

      var query = el('input', {
        type: 'search', class: 'cms-search', autocomplete: 'off',
        placeholder: 'Search videos to add', 'aria-label': 'Search for something to add',
        oninput: function () { render(); }
      });
      var note = el('p', { class: 'cms-hint', hidden: true });
      var results = el('ul', { class: 'cms-picker-results' });
      var videoBtn = el('button', { type: 'button', text: 'Videos', 'aria-pressed': 'true', onclick: function () { setKind('video'); } });
      var quizBtn = el('button', { type: 'button', text: 'Quizzes', 'aria-pressed': 'false', onclick: function () { setKind('quiz'); } });

      function setKind(next) {
        kind = next;
        videoBtn.setAttribute('aria-pressed', next === 'video' ? 'true' : 'false');
        quizBtn.setAttribute('aria-pressed', next === 'quiz' ? 'true' : 'false');
        query.placeholder = next === 'video' ? 'Search videos to add' : 'Search quizzes to add';
        render();
      }

      async function load(k) {
        if (cache[k]) return cache[k];
        var result = k === 'video'
          ? await window.sb.from('videos').select('id, display_name_en').order('display_name_en', { ascending: true })
          : await window.sb.from('quizzes').select('id, display_name').order('display_name', { ascending: true });
        if (result.error) throw result.error;
        cache[k] = (result.data || []).map(function (row) {
          return { id: row.id, title: k === 'video' ? row.display_name_en : row.display_name };
        });
        return cache[k];
      }

      async function render() {
        var k = kind;
        var mine = ++token;
        if (!cache[k]) {
          note.textContent = 'Loading…';
          note.hidden = false;
          P.clear(results);
        }
        var rows;
        try {
          rows = await load(k);
        } catch (error) {
          if (mine !== token) return;
          note.textContent = P.errorText(error);
          note.hidden = false;
          return;
        }
        if (mine !== token) return;

        var q = P.fold(query.value);
        var matches = rows.filter(function (row) { return !q || P.fold(row.title).indexOf(q) !== -1; });
        P.clear(results);
        if (!matches.length) {
          note.textContent = rows.length
            ? 'No matches.'
            : (k === 'video' ? 'No videos yet. Add some in the Videos tab.' : 'No quizzes yet. Create one in the Quizzes tab.');
          note.hidden = false;
          return;
        }
        note.hidden = true;

        matches.slice(0, 40).forEach(function (row) {
          var added = el('span', { class: 'cms-hint', hidden: true });
          function refreshAdded() {
            var n = getItems().filter(function (item) { return item.type === k && item.ref_id === row.id; }).length;
            added.textContent = n ? 'in playlist' + (n > 1 ? ' ×' + n : '') : '';
            added.hidden = !n;
          }
          refreshAdded();
          results.appendChild(el('li', { class: 'cms-picker-row' },
            el('span', { class: 'cms-picker-name', text: row.title }),
            added,
            el('button', {
              type: 'button', class: 'btn-secondary btn-small', text: 'Add',
              onclick: function () {
                onAdd({ id: null, type: k, ref_id: row.id, title: row.title });
                refreshAdded();
              }
            })));
        });
        if (matches.length > 40) {
          results.appendChild(el('li', { class: 'cms-hint', text: 'Showing the first 40. Type to narrow it down.' }));
        }
      }

      render();

      return el('div', { class: 'cms-picker' },
        el('div', { class: 'cms-picker-top' },
          el('div', { class: 'cms-segmented', role: 'group', 'aria-label': 'What to add' }, videoBtn, quizBtn),
          query),
        note,
        results);
    }
  });
})();
