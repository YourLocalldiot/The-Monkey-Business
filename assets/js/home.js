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
// open it (the button doesn't do anything yet).

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
    popup.style.top = (openPiece.offsetTop + openPiece.offsetHeight + 18) + 'px';
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

    // Not wired to anything yet.
    var action = document.createElement('button');
    action.type = 'button';
    action.className = 'path-popup-action';
    action.dataset.itemType = item.type;
    action.dataset.itemId = item.refId;
    action.textContent = isQuiz ? 'Play Quiz' : 'Watch Video';

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
      note.textContent = 'Nothing in this playlist yet.';
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
      piece.setAttribute('aria-label', (item.type === 'quiz' ? 'Quiz: ' : 'Video: ') + item.name);
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
      message.textContent = "Couldn't remember that choice, so it may switch back next time.";
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

  var result = await loadPlaylists(
    'display_name_en, playlist_items(position, item_type, video_id, quiz_id, videos(display_name_en), quizzes(display_name))');

  // The CMS tables aren't there yet (docs/supabase-sql.md): still show the
  // playlists, just without the path of pieces.
  if (result.error && ['PGRST200', 'PGRST205', '42P01'].indexOf(result.error.code) !== -1) {
    result = await loadPlaylists('display_name_en');
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
        name: row.playlists.display_name_en || 'Untitled playlist',
        items: !contents ? null : contents.slice()
          .sort(function (a, b) { return a.position - b.position; })
          .map(function (entry) {
            var isQuiz = entry.item_type === 'quiz';
            var target = isQuiz ? entry.quizzes : entry.videos;
            if (!target) return null;
            return {
              type: entry.item_type,
              refId: isQuiz ? entry.quiz_id : entry.video_id,
              name: (isQuiz ? target.display_name : target.display_name_en) || 'Untitled'
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
