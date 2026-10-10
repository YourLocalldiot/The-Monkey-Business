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

    var title = escapeHtml(isQuiz ? target.display_name : target.display_name_en);
    var pill = '<span class="type-pill ' + (isQuiz ? 'quiz' : 'video') + '">' + (isQuiz ? 'Quiz' : 'Video') + '</span>';
    var link = !isQuiz && /^https?:\/\//i.test(target.youtube_link || '') ? target.youtube_link : '';
    var label = link
      ? '<a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">' + title + '</a>'
      : '<span class="playlist-item-title">' + title + '</span>';
    return '<li>' + pill + label + '</li>';
  }

  if (!window.sb) {
    showMessage('Could not reach the service. Check your connection and try again.', true);
    return;
  }

  var COLUMNS = 'playlist_id, display_name_en, description_en, image_url';
  var result = await window.sb
    .from('playlists')
    .select(COLUMNS + ', playlist_items(position, item_type, videos(display_name_en, youtube_link), quizzes(display_name))')
    .order('playlist_id', { ascending: true });

  // The CMS tables don't exist yet (the CMS queries in docs/supabase-sql.md
  // haven't been run): still list the playlists, just without contents.
  if (result.error && (result.error.code === 'PGRST200' || result.error.code === 'PGRST205' || result.error.code === '42P01')) {
    result = await window.sb
      .from('playlists')
      .select(COLUMNS)
      .order('playlist_id', { ascending: true });
  }

  if (result.error) {
    showMessage('Could not load playlists: ' + result.error.message, true);
    return;
  }

  var playlists = result.data || [];
  if (playlists.length === 0) {
    listEl.innerHTML = '<p class="goal-caption">No playlists yet — check back soon.</p>';
    return;
  }

  listEl.innerHTML = playlists.map(function (p) {
    var icon = p.image_url
      ? '<img class="playlist-icon" src="' + escapeHtml(p.image_url) + '" alt="">'
      : '<img class="playlist-icon" src="assets/images/files.png" alt="">';

    var description = p.description_en
      ? '<p>' + escapeHtml(p.description_en) + '</p>'
      : '<p class="playlist-contents-note">No description yet.</p>';

    var contentRows = (p.playlist_items || []).slice()
      .sort(function (a, b) { return a.position - b.position; })
      .map(contentItem)
      .filter(Boolean);
    var contents = contentRows.length
      ? '<ol class="playlist-contents">' + contentRows.join('') + '</ol>'
      : '<p class="playlist-contents-note">Contents coming soon.</p>';

    // Sits between the title row and the description. Not wired to anything
    // yet: there's no per-user "my courses" data to add the playlist to.
    var addCourse =
      '<div class="playlist-actions">' +
        '<button type="button" class="btn-primary btn-small add-course" data-playlist-id="' + escapeHtml(p.playlist_id) + '">Add course</button>' +
      '</div>';

    return (
      '<div class="playlist-row" data-open="false">' +
        '<button type="button" class="playlist-toggle" aria-expanded="false">' +
          icon +
          '<span class="playlist-name">' + escapeHtml(p.display_name_en) + '</span>' +
          '<svg class="playlist-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="playlist-body" hidden>' + addCourse + description + contents + '</div>' +
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
});
