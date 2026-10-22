// CMS → Videos tab: the library of videos that playlists are built from.
// A video here is a name (English + Vietnamese), a YouTube link and the
// rewards for finishing it (EXP and bananas, the first time and on a rewatch);
// the Playlists tab decides where each one is used. The reward columns come
// with the video-rewards SQL in docs/supabase-sql.md; until it has been run
// the Rewards boxes are switched off.
(function () {
  var P = window.CMS;
  var el = P.el;

  // watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
  var YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i;

  var REWARD_COLUMNS = ', reward_first_exp, reward_first_bananas, reward_repeat_exp, reward_repeat_bananas';
  var DEFAULT_REWARDS = { first_exp: 40, first_bananas: 20, repeat_exp: 10, repeat_bananas: 5 };
  var REWARD_MAX = 100000;

  function blankVideo() {
    return { id: null, display_name_en: '', display_name_vn: '', youtube_link: '', rewards: Object.assign({}, DEFAULT_REWARDS) };
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
            youtube_link: row.youtube_link || '',
            rewards: rewardsOf(row)
          });
        }
      }
    });

    var videos = [];
    var rewardsSupported = true;   // false until the video-rewards SQL has been run
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

    function rewardsOf(row) {
      if (!rewardsSupported) return Object.assign({}, DEFAULT_REWARDS);
      return {
        first_exp: row.reward_first_exp, first_bananas: row.reward_first_bananas,
        repeat_exp: row.reward_repeat_exp, repeat_bananas: row.reward_repeat_bananas
      };
    }

    async function loadList() {
      md.setNote('Loading…');
      var columns = 'id, display_name_en, display_name_vn, youtube_link';
      rewardsSupported = true;
      var result = await window.sb.from('videos').select(columns + REWARD_COLUMNS).order('id', { ascending: false });
      if (result.error && result.error.code === '42703') {
        rewardsSupported = false;
        result = await window.sb.from('videos').select(columns).order('id', { ascending: false });
      }
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

      // ----- rewards -----
      function rewardField(key, label) {
        var input = el('input', {
          type: 'number', min: 0, max: REWARD_MAX, step: 1, inputmode: 'numeric',
          value: String(state.rewards[key]), disabled: !rewardsSupported,
          oninput: function () {
            state.rewards[key] = input.value === '' ? NaN : Number(input.value);
            changed();
          }
        });
        return P.field(label, input);
      }

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
        if (rewardsSupported && Object.keys(state.rewards).some(function (k) {
          var v = state.rewards[k];
          return !(Number.isInteger(v) && v >= 0 && v <= REWARD_MAX);
        })) {
          return 'The EXP and banana rewards must be whole numbers from 0 to ' + REWARD_MAX + '.';
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
        if (rewardsSupported) {
          values.reward_first_exp = state.rewards.first_exp;
          values.reward_first_bananas = state.rewards.first_bananas;
          values.reward_repeat_exp = state.rewards.repeat_exp;
          values.reward_repeat_bananas = state.rewards.repeat_bananas;
        }

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
          youtube_link: saved ? saved.youtube_link || '' : values.youtube_link,
          rewards: saved ? rewardsOf(saved) : Object.assign({}, state.rewards)
        }, 'Saved.');
      }

      async function onDelete() {
        var label = state.display_name_en.trim() || 'this video';
        var yes = await window.UI.confirm('Delete "' + label + '"? This cannot be undone.', {
          title: 'Delete video', confirmLabel: 'Delete', cancelLabel: 'Keep it', danger: true
        });
        if (!yes) return;
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
        el('section', { class: 'cms-section' },
          el('div', { class: 'cms-section-head' },
            el('div', { class: 'cms-section-title' },
              el('h3', { text: 'Rewards' }),
              el('span', { class: 'cms-hint', text: 'Paid when a player watches the video to the end' })),
            rewardsSupported ? null : el('span', { class: 'cms-hint', text: 'Needs a database update (docs/pending-supabase-sql.md)' })),
          el('div', { class: 'cms-reward-group' },
            el('strong', { class: 'cms-reward-title', text: 'The first time a player finishes this video' }),
            el('div', { class: 'field-row' },
              rewardField('first_exp', 'EXP'),
              rewardField('first_bananas', 'Bananas'))),
          el('div', { class: 'cms-reward-group' },
            el('strong', { class: 'cms-reward-title', text: 'Every time after that (paid at most once a day)' }),
            el('div', { class: 'field-row' },
              rewardField('repeat_exp', 'EXP'),
              rewardField('repeat_bananas', 'Bananas')))),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
