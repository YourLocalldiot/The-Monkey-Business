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

  if (!window.sb) {
    showMessage('Could not reach the service. Check your connection and try again.', true);
    return;
  }

  var result = await window.sb
    .from('playlists')
    .select('playlist_id, display_name_en, description_en, contents_ids, image_url')
    .order('playlist_id', { ascending: true });

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

    var contentsNote = (p.contents_ids && p.contents_ids.length)
      ? ''
      : '<p class="playlist-contents-note">Contents coming soon.</p>';

    return (
      '<div class="playlist-row" data-open="false">' +
        '<button type="button" class="playlist-toggle" aria-expanded="false">' +
          icon +
          '<span class="playlist-name">' + escapeHtml(p.display_name_en) + '</span>' +
          '<svg class="playlist-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>' +
        '</button>' +
        '<div class="playlist-body" hidden>' + description + contentsNote + '</div>' +
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
