document.addEventListener('DOMContentLoaded', async function () {
  var listEl = document.getElementById('playlistList');
  var message = document.getElementById('playlistsMessage');

  function showMessage(text, isError) {
    if (!message) return;
    message.textContent = text;
    message.hidden = false;
    message.classList.toggle('is-error', !!isError);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // One list entry per video/quiz in a playlist, in the order a moderator
  // arranged them in the CMS. Video titles link out to YouTube.
  function contentItem(item) {
    var isQuiz = item.item_type === 'quiz';
    var target = isQuiz ? item.quizzes : item.videos;
    if (!target) return '';

    var title = escapeHtml(isQuiz
      ? I18N.pick(target.display_name_vn, target.display_name)
      : I18N.pick(target.display_name_vn, target.display_name_en));
    var pill = '<span class="type-pill ' + (isQuiz ? 'quiz' : 'video') + '">' + I18N.t(isQuiz ? 'type.quiz' : 'type.video') + '</span>';
    var link = !isQuiz && /^https?:\/\//i.test(target.youtube_link || '') ? target.youtube_link : '';
    var label = link
      ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>'
      : '<span class="playlist-item-title">' + title + '</span>';
    return '<li>' + pill + label + '</li>';
  }

  if (!window.sb) {
    showMessage(I18N.t('err.noService'), true);
    return;
  }

  // The fullest query first. If the database doesn't have something yet
  // (the CMS or Vietnamese-content SQL in docs/supabase-sql.md hasn't been
  // run), fall back to a simpler one instead of showing nothing.
  var PLAYLIST_COLUMNS = 'playlist_id, display_name_en, display_name_vn, description_en, description_vn, image_url';
  var ATTEMPTS = [
    PLAYLIST_COLUMNS + ', playlist_items(position, item_type, videos(display_name_en, display_name_vn, youtube_link), quizzes(display_name, display_name_vn))',
    PLAYLIST_COLUMNS + ', playlist_items(position, item_type, videos(display_name_en, display_name_vn, youtube_link), quizzes(display_name))',
    PLAYLIST_COLUMNS
  ];
  var RETRY_CODES = ['42703', 'PGRST200', 'PGRST205', '42P01'];
  var result;
  for (var attempt = 0; attempt < ATTEMPTS.length; attempt++) {
    result = await window.sb
      .from('playlists')
      .select(ATTEMPTS[attempt])
      .order('playlist_id', { ascending: true });
    if (!result.error || RETRY_CODES.indexOf(result.error.code) === -1) break;
  }

  if (result.error) {
    showMessage(I18N.t('browse.loadFail', { message: result.error.message }), true);
    return;
  }

  var playlists = result.data || [];
  if (playlists.length === 0) {
    listEl.innerHTML = '<p class="goal-caption">' + I18N.t('browse.none') + '</p>';
    return;
  }

  listEl.innerHTML = playlists.map(function (p) {
    var icon = p.image_url
      ? '<img class="playlist-icon" src="' + escapeHtml(p.image_url) + '" alt="">'
      : '<img class="playlist-icon" src="assets/images/files.png" alt="">';

    var descriptionText = I18N.pick(p.description_vn, p.description_en);
    var description = descriptionText
      ? '<p>' + escapeHtml(descriptionText) + '</p>'
      : '<p class="playlist-contents-note">' + I18N.t('browse.noDescription') + '</p>';

    var contentRows = (p.playlist_items || []).slice()
      .sort(function (a, b) { return a.position - b.position; })
      .map(contentItem)
      .filter(Boolean);
    var contents = contentRows.length
      ? '<ol class="playlist-contents">' + contentRows.join('') + '</ol>'
      : '<p class="playlist-contents-note">' + I18N.t('browse.contentsSoon') + '</p>';

    // Sits between the title row and the description.
    var addPlaylist =
      '<div class="playlist-actions">' +
        '<button type="button" class="btn-primary btn-small add-playlist" data-playlist-id="' + escapeHtml(p.playlist_id) + '">' + I18N.t('browse.add') + '</button>' +
      '</div>';

    return (
      '<div class="playlist-row" data-open="false">' +
        '<button type="button" class="playlist-toggle" aria-expanded="false">' +
          icon +
          '<span class="playlist-name">' + escapeHtml(I18N.pick(p.display_name_vn, p.display_name_en)) + '</span>' +
          '<svg class="playlist-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="playlist-body" hidden>' + addPlaylist + description + contents + '</div>' +
      '</div>'
    );
  }).join('');

  listEl.querySelectorAll('.playlist-row').forEach(function (row) {
    var toggle = row.querySelector('.playlist-toggle');
    var body = row.querySelector('.playlist-body');
    toggle.addEventListener('click', function () {
      var willOpen = row.dataset.open !== 'true';
      row.dataset.open = willOpen ? 'true' : 'false';
      toggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
      body.hidden = !willOpen;
    });
  });

  // ---- Add playlist ----
  // Saves the playlist to the signed-in user's list (user_playlists, see
  // docs/supabase-sql.md); that's what the Home page shows. A visitor who
  // isn't signed in is sent to log in first.
  var session = (await window.sb.auth.getSession()).data.session;

  function markAdded(button) {
    button.textContent = I18N.t('browse.added');
    button.disabled = true;
  }

  if (session) {
    var mine = await window.sb.from('user_playlists').select('playlist_id');
    if (!mine.error) {
      var added = {};
      (mine.data || []).forEach(function (row) { added[row.playlist_id] = true; });
      listEl.querySelectorAll('.add-playlist').forEach(function (button) {
        if (added[button.dataset.playlistId]) markAdded(button);
      });
    }
  }

  listEl.addEventListener('click', async function (event) {
    var button = event.target.closest('.add-playlist');
    if (!button || button.disabled) return;

    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    button.disabled = true;
    button.textContent = I18N.t('browse.adding');
    var inserted = await window.sb
      .from('user_playlists')
      .insert({ playlist_id: Number(button.dataset.playlistId) });

    // 23505: it was already in their list, which is what they wanted.
    if (inserted.error && inserted.error.code !== '23505') {
      console.error('browse-playlists.js: could not add playlist', inserted.error);
      button.disabled = false;
      button.textContent = I18N.t('browse.add');
      showMessage(I18N.t('browse.addFail'), true);
      return;
    }
    message.hidden = true;
    markAdded(button);
  });
});
