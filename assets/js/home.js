// Home page: the box showing the playlist the signed-in user is on.
//
// Playlists come from user_playlists (added with "Add playlist" on Browse
// playlists; see docs/supabase-sql.md). The one with the latest
// last_opened_at is the current one. The box collapses to just its name;
// opened, it offers the user's other playlists, or a nudge to find more
// when they only have one, plus a link to Browse playlists. Anyone with no
// playlists (including visitors who aren't signed in) sees the original
// "You currently have no playlists" box instead.
//
// Under the box, the current playlist's videos and quizzes ("pieces") are
// drawn as round buttons along a path that curves like Duolingo's lesson
// path. Pressing a piece opens a small box with its name and a button to
// open it: a video opens on the watch page (video.html), a quiz on the quiz
// page (quiz.html).

// How far each piece sits from the centre line, in piece widths, for a
// curve of 5, 4 or 3 pieces. Every curve starts and ends on the centre line.
var PATH_SHAPES = { 5: [0, 0.7, 1.05, 0.7, 0], 4: [0, 0.9, 0.9, 0], 3: [0, 0.95, 0] };
// true: successive curves bulge left, then right, then left... (like
// Duolingo). false: they all bulge left.
var PATH_ALTERNATES = true;

// Horizontal offsets (negative = left) for a playlist of `count` pieces.
// Curves of 5 are laid end to end, sharing the centred piece where they
// meet; what's left over becomes a curve of 3 or 4, or one extra centred
// piece. So 9 is 5+5, 7 is 5+3, and 10 is 5+5+1.
function pathOffsets(count) {
  var offsets = [0];
  var sign = -1;
  while (offsets.length < count) {
    var remaining = count - offsets.length + 1;   // counting the shared piece
    if (remaining === 2) {
      offsets.push(0);
      break;
    }
    var size = remaining >= 5 ? 5 : remaining;
    var shape = PATH_SHAPES[size];
    for (var k = 1; k < size; k++) offsets.push(sign * shape[k]);
    if (PATH_ALTERNATES) sign = -sign;
  }
  return offsets.slice(0, count);
}

// Static, hard-coded markup: a rounded play triangle and a rounded star.
var PIECE_ICONS = {
  video: '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 6v12l10-6z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>',
  quiz: '<svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>'
};

document.addEventListener('DOMContentLoaded', async function () {
  var box = document.getElementById('currentPlaylist');
  var empty = document.getElementById('noPlaylists');
  if (!box || !empty) return;

  var nameEl = document.getElementById('currentPlaylistName');
  var toggle = document.getElementById('currentPlaylistToggle');
  var menu = document.getElementById('currentPlaylistMenu');
  var hint = document.getElementById('currentPlaylistHint');
  var others = document.getElementById('otherPlaylists');
  var message = document.getElementById('currentPlaylistMessage');
  var pathEl = document.getElementById('playlistPath');

  var playlists = [];   // [{ id, name, items }], current one first
  var popup = null;     // the open piece box, and the piece it belongs to
  var openPiece = null;

  function showEmpty() {
    box.hidden = true;
    if (pathEl) pathEl.hidden = true;
    empty.hidden = false;
  }

  // ---- the path of pieces ----

  function closePopup() {
    if (popup) popup.parentNode.removeChild(popup);
    if (openPiece) {
      openPiece.setAttribute('aria-expanded', 'false');
      openPiece.parentNode.style.minHeight = '';
    }
    popup = null;
    openPiece = null;
  }

  // Puts the box just under its piece, centred on it but kept inside the
  // track, with its little arrow pointing back at the piece.
  function placePopup() {
    if (!popup) return;
    var track = openPiece.parentNode;
    var width = Math.min(280, track.clientWidth);
    var center = openPiece.offsetLeft + openPiece.offsetWidth / 2;
    var left = Math.max(0, Math.min(center - width / 2, track.clientWidth - width));
    popup.style.width = width + 'px';
    popup.style.left = left + 'px';
    popup.style.top = (openPiece.offsetTop + openPiece.offsetWidth + 14) + 'px';   // below face + ledge
    popup.style.setProperty('--arrow-x', (center - left) + 'px');
    // keep the box inside the track even for the last piece
    track.style.minHeight = '';
    var needed = popup.offsetTop + popup.offsetHeight + 16;
    if (needed > track.clientHeight) track.style.minHeight = needed + 'px';
  }

  function openPopup(piece, item) {
    closePopup();
    var isQuiz = item.type === 'quiz';

    popup = document.createElement('div');
    popup.className = 'path-popup';
    popup.setAttribute('role', 'group');
    popup.setAttribute('aria-label', item.name);

    var title = document.createElement('p');
    title.className = 'path-popup-title';
    title.textContent = item.name;

    var action = document.createElement('button');
    action.type = 'button';
    action.className = 'path-popup-action';
    action.dataset.itemType = item.type;
    action.dataset.itemId = item.refId;
    action.textContent = I18N.t(isQuiz ? 'home.path.playQuiz' : 'home.path.watchVideo');
    action.addEventListener('click', function () {
      window.location.href = (isQuiz ? 'quiz.html?id=' : 'video.html?id=') + encodeURIComponent(item.refId);
    });

    popup.appendChild(title);
    popup.appendChild(action);
    piece.parentNode.insertBefore(popup, piece.nextSibling);   // keeps tab order sensible
    openPiece = piece;
    piece.setAttribute('aria-expanded', 'true');
    placePopup();
  }

  function renderPath() {
    closePopup();
    while (pathEl.firstChild) pathEl.removeChild(pathEl.firstChild);

    var items = playlists[0].items;
    if (!items) {          // contents couldn't be loaded: show nothing
      pathEl.hidden = true;
      return;
    }
    pathEl.hidden = false;

    if (!items.length) {
      var note = document.createElement('p');
      note.className = 'path-empty';
      note.textContent = I18N.t('home.path.empty');
      pathEl.appendChild(note);
      return;
    }

    var offsets = pathOffsets(items.length);
    var track = document.createElement('div');
    track.className = 'path-track';
    track.style.setProperty('--rows', items.length);

    items.forEach(function (item, index) {
      var piece = document.createElement('button');
      piece.type = 'button';
      piece.className = 'path-piece ' + item.type;
      piece.style.setProperty('--row', index);
      piece.style.setProperty('--off', offsets[index]);
      piece.setAttribute('aria-label', I18N.t(item.type === 'quiz' ? 'type.quiz' : 'type.video') + ': ' + item.name);
      piece.setAttribute('aria-expanded', 'false');
      piece.innerHTML = PIECE_ICONS[item.type];
      piece.addEventListener('click', function () {
        if (openPiece === piece) closePopup();
        else openPopup(piece, item);
      });
      track.appendChild(piece);
    });
    pathEl.appendChild(track);
  }

  document.addEventListener('click', function (event) {
    if (!popup) return;
    if (popup.contains(event.target) || openPiece.contains(event.target)) return;
    closePopup();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !popup) return;
    var piece = openPiece;
    closePopup();
    piece.focus();
  });
  window.addEventListener('resize', placePopup);

  function setOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.hidden = !open;
  }

  function render() {
    nameEl.textContent = playlists[0].name;

    var rest = playlists.slice(1);
    hint.hidden = rest.length > 0;
    while (others.firstChild) others.removeChild(others.firstChild);
    rest.forEach(function (playlist) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn-secondary';
      button.textContent = playlist.name;
      button.addEventListener('click', function () { choose(playlist.id); });
      others.appendChild(button);
    });

    empty.hidden = true;
    box.hidden = false;
    renderPath();
  }

  // Makes a playlist the current one: the box switches straight away, and
  // the choice is saved so it's still current next time.
  async function choose(id) {
    var index = playlists.findIndex(function (p) { return p.id === id; });
    if (index < 1) return;
    playlists.unshift(playlists.splice(index, 1)[0]);
    message.hidden = true;
    render();
    setOpen(false);

    var result = await window.sb.rpc('open_playlist', { p_playlist_id: id });
    if (result.error) {
      console.error('home.js: could not save the current playlist', result.error);
      message.textContent = I18N.t('home.saveFail');
      message.hidden = false;
      setOpen(true);
    }
  }

  toggle.addEventListener('click', function () {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  if (!window.sb) {
    showEmpty();
    return;
  }

  var session = (await window.sb.auth.getSession()).data.session;
  if (!session) {
    showEmpty();
    return;
  }

  function loadPlaylists(playlistColumns) {
    return window.sb
      .from('user_playlists')
      .select('playlist_id, playlists(' + playlistColumns + ')')
      .order('last_opened_at', { ascending: false })
      .order('added_at', { ascending: false });
  }

  // The fullest query first. If the database doesn't have something yet
  // (the CMS or Vietnamese-content SQL in docs/supabase-sql.md hasn't been
  // run), fall back to a simpler one: fewer translations, or no path.
  var ATTEMPTS = [
    'display_name_en, display_name_vn, playlist_items(position, item_type, video_id, quiz_id, videos(display_name_en, display_name_vn), quizzes(display_name, display_name_vn))',
    'display_name_en, display_name_vn, playlist_items(position, item_type, video_id, quiz_id, videos(display_name_en, display_name_vn), quizzes(display_name))',
    'display_name_en, display_name_vn'
  ];
  var RETRY_CODES = ['42703', 'PGRST200', 'PGRST205', '42P01'];
  var result;
  for (var attempt = 0; attempt < ATTEMPTS.length; attempt++) {
    result = await loadPlaylists(ATTEMPTS[attempt]);
    if (!result.error || RETRY_CODES.indexOf(result.error.code) === -1) break;
  }

  if (result.error) {
    console.error('home.js: could not load your playlists', result.error);
    showEmpty();
    return;
  }

  playlists = (result.data || [])
    .filter(function (row) { return row.playlists; })
    .map(function (row) {
      var contents = row.playlists.playlist_items;
      return {
        id: row.playlist_id,
        name: I18N.pick(row.playlists.display_name_vn, row.playlists.display_name_en) || I18N.t('home.untitled'),
        items: !contents ? null : contents.slice()
          .sort(function (a, b) { return a.position - b.position; })
          .map(function (entry) {
            var isQuiz = entry.item_type === 'quiz';
            var target = isQuiz ? entry.quizzes : entry.videos;
            if (!target) return null;
            return {
              type: entry.item_type,
              refId: isQuiz ? entry.quiz_id : entry.video_id,
              name: (isQuiz
                ? I18N.pick(target.display_name_vn, target.display_name)
                : I18N.pick(target.display_name_vn, target.display_name_en)) || I18N.t('home.untitledItem')
            };
          })
          .filter(Boolean)
      };
    });

  if (!playlists.length) {
    showEmpty();
    return;
  }
  render();
});
