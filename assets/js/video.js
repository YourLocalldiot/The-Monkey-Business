// Watch page (video.html?id=<videos.id>): a top bar with an [x] back to Home
// and the video's name, the YouTube player in the middle, and a "Next" button
// at the bottom (not wired to anything yet).
//
// The video is looked up in the videos table. Visitors can read a video that
// sits in a playlist (see docs/supabase-sql.md), moderators any video.
document.addEventListener('DOMContentLoaded', async function () {
  var titleEl = document.getElementById('videoTitle');
  var frame = document.getElementById('videoFrame');
  var note = document.getElementById('videoNote');
  if (!titleEl || !frame || !note) return;

  // watch?v=ID, youtu.be/ID, /embed/ID, /shorts/ID, /live/ID
  var YOUTUBE = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/i;

  function showNote(text, isError) {
    note.textContent = text;
    note.classList.toggle('is-error', !!isError);
    note.hidden = false;
  }

  var id = Number(new URLSearchParams(window.location.search).get('id'));
  if (!Number.isInteger(id) || id < 1) {
    showNote(I18N.t('video.notFound'), true);
    return;
  }
  if (!window.sb) {
    showNote(I18N.t('err.noService'), true);
    return;
  }

  var result = await window.sb
    .from('videos')
    .select('id, display_name_en, display_name_vn, youtube_link')
    .eq('id', id)
    .maybeSingle();

  if (result.error) {
    console.error('video.js: could not load the video', result.error);
    showNote(I18N.t('video.loadFail'), true);
    return;
  }
  if (!result.data) {
    showNote(I18N.t('video.notFound'), true);
    return;
  }

  var video = result.data;
  var name = I18N.pick(video.display_name_vn, video.display_name_en) || I18N.t('home.untitledItem');
  titleEl.textContent = name;
  document.title = name + ' — The Monkey Business';

  var match = YOUTUBE.exec(String(video.youtube_link || '').trim());
  if (!match) {
    showNote(I18N.t('video.badLink'), true);
    return;
  }

  var player = document.createElement('iframe');
  player.src = 'https://www.youtube-nocookie.com/embed/' + match[1] + '?rel=0&playsinline=1';
  player.title = name;
  player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen';
  player.allowFullscreen = true;
  player.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.textContent = '';
  frame.appendChild(player);
});
