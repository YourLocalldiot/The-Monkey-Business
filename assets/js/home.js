// Home page: the box showing the playlist the signed-in user is on.
//
// Playlists come from user_playlists (added with "Add playlist" on Browse
// playlists; see docs/supabase-sql.md). The one with the latest
// last_opened_at is the current one. The box collapses to just its name;
// opened, it offers the user's other playlists, or a nudge to find more
// when they only have one, plus a link to Browse playlists. Anyone with no
// playlists (including visitors who aren't signed in) sees the original
// "You currently have no playlists" box instead.
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

  var playlists = [];   // [{ id, name }], current one first

  function showEmpty() {
    box.hidden = true;
    empty.hidden = false;
  }

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

  var result = await window.sb
    .from('user_playlists')
    .select('playlist_id, playlists(display_name_en)')
    .order('last_opened_at', { ascending: false })
    .order('added_at', { ascending: false });

  if (result.error) {
    console.error('home.js: could not load your playlists', result.error);
    showEmpty();
    return;
  }

  playlists = (result.data || [])
    .filter(function (row) { return row.playlists; })
    .map(function (row) {
      return { id: row.playlist_id, name: row.playlists.display_name_en || 'Untitled playlist' };
    });

  if (!playlists.length) {
    showEmpty();
    return;
  }
  render();
});
