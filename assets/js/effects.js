// Quiz effects: when a player picks a right or a wrong answer, a coloured,
// blurred cloud billows across the whole screen and a text or emoji pops up in
// the middle. Moderators manage the effects in CMS > Effects (the quiz_effects
// table, docs/supabase-sql.md). Each effect has a kind ('correct' or
// 'incorrect'), the text/emoji, the flash colour (#rrggbb) and how long it
// lasts, in seconds. When there are several of a kind, one is picked at random.
//
//   await Effects.load()            fetch the effects once (falls back to the defaults below)
//   Effects.play(Effects.pick('correct'))
//   Effects.play({ content, color, duration_seconds })     e.g. the CMS preview
//
// The look is in css/styles.css ("Quiz effects").
(function () {
  // Used until the quiz_effects table exists (or when it can't be read).
  var DEFAULTS = [
    { kind: 'correct', content: '✅', color: '#3fb56a', duration_seconds: 0.8 },
    { kind: 'incorrect', content: '💩', color: '#7b4a2a', duration_seconds: 1.5 }
  ];

  var loaded = null;   // the list, once fetched

  async function load() {
    if (loaded) return loaded;
    if (!window.sb) return DEFAULTS;
    try {
      var result = await window.sb.from('quiz_effects').select('kind, content, color, duration_seconds').order('id');
      loaded = result.error ? DEFAULTS : (result.data || []);
      if (result.error) console.warn('effects.js: using the default effects', result.error);
    } catch (e) {
      loaded = DEFAULTS;
    }
    return loaded;
  }

  function pick(kind) {
    var list = (loaded || DEFAULTS).filter(function (effect) { return effect.kind === kind; });
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }

  function play(effect) {
    if (!effect) return;
    var seconds = Math.min(10, Math.max(0.2, Number(effect.duration_seconds) || 1));
    var color = /^#[0-9a-f]{6}$/i.test(effect.color || '') ? effect.color : '#888888';

    var layer = document.createElement('div');
    layer.className = 'fx';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.setProperty('--fx-color', color);
    layer.style.setProperty('--fx-dur', seconds + 's');

    var cloud = document.createElement('div');
    cloud.className = 'fx-cloud';
    var text = document.createElement('div');
    text.className = 'fx-text';
    text.textContent = effect.content;
    if (Array.from(String(effect.content)).length > 4) text.classList.add('is-long');

    layer.appendChild(cloud);
    layer.appendChild(text);
    document.body.appendChild(layer);
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, seconds * 1000 + 150);
  }

  window.Effects = { DEFAULTS: DEFAULTS, load: load, pick: pick, play: play };
})();
