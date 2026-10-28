// CMS → Quiz leaderboards tab: pick a quiz and see every player it has had,
// with their scores. (The public leaderboard on the quiz page shows only the
// top 10 plus your own row, and no scores.) Read-only.
//
// The players come from admin_quiz_players() and the counts in the list from
// admin_quiz_player_counts() (docs/supabase-sql.md, "Quiz leaderboards for
// moderators"): quiz_players can't be read directly, and both functions refuse
// anyone who isn't a moderator. Guests are tagged; so is a guest result that has
// expired (it is off the public leaderboard but kept here). Players who started
// without finishing come last, without a place.
(function () {
  var P = window.CMS;
  var el = P.el;

  function plural(count, one, many) { return count + ' ' + (count === 1 ? one : many); }

  function when(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  P.register('leaderboards', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search quizzes',
      searchLabel: 'Search quizzes by name',
      onSearch: renderList,
      onSelect: function (id) {
        selectedId = id;
        renderList();
        openQuiz(id);
      }
    });

    var quizzes = [];
    var counts = {};          // quiz id -> { players, finished, guests }
    var selectedId = null;
    var openToken = 0;

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      openToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick a quiz on the left to see all of its players and their scores.'
      }));
    }

    async function loadList() {
      md.setNote('Loading…');
      var asked = await Promise.all([
        window.sb.from('quizzes').select('id, display_name, display_name_vn').order('id', { ascending: false }),
        window.sb.rpc('admin_quiz_player_counts')
      ]);
      var list = asked[0];
      var tally = asked[1];
      if (list.error) {
        md.setNote(P.errorText(list.error), true);
        return;
      }
      quizzes = list.data || [];
      counts = {};
      // without the counts (the SQL hasn't been run) the list still works; opening a quiz says what is missing
      (tally.data || []).forEach(function (row) { counts[row.quiz_id] = row; });
      renderList();
    }

    function renderList() {
      var q = P.fold(md.search.value);
      var rows = quizzes.filter(function (quiz) {
        return !q || P.fold(quiz.display_name + ' ' + (quiz.display_name_vn || '')).indexOf(q) !== -1;
      });
      md.setItems(rows.map(function (quiz) {
        var c = counts[quiz.id];
        return {
          id: quiz.id,
          title: quiz.display_name || '(untitled)',
          meta: 'ID ' + quiz.id + (c ? ' · ' + plural(c.players, 'player', 'players') : '')
        };
      }), selectedId);
      if (!quizzes.length) md.setNote('There are no quizzes yet.');
      else if (!rows.length) md.setNote('No quizzes match your search.');
      else md.setNote('');
    }

    async function openQuiz(id) {
      var quiz = quizzes.filter(function (x) { return x.id === id; })[0];
      var token = ++openToken;
      P.clear(md.editor);
      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: quiz ? quiz.display_name : 'Quiz ' + id }));
      md.editor.appendChild(el('p', { class: 'cms-editor-sub', text: 'Loading the players…' }));

      var result = await window.sb.rpc('admin_quiz_players', { p_quiz_id: id });
      if (token !== openToken) return;   // another quiz was picked meanwhile
      if (result.error) {
        P.clear(md.editor);
        md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: quiz ? quiz.display_name : 'Quiz ' + id }));
        md.editor.appendChild(el('p', { class: 'cms-status is-error', text: P.errorText(result.error) }));
        return;
      }
      render(quiz, id, result.data || []);
    }

    function render(quiz, id, players) {
      P.clear(md.editor);

      var finished = players.filter(function (p) { return p.score !== null; }).length;
      var guests = players.filter(function (p) { return p.is_guest; }).length;
      var expired = players.filter(function (p) { return p.expired; }).length;

      var summary = plural(players.length, 'player', 'players') + ' · ' + finished + ' finished';
      if (guests) summary += ' · ' + plural(guests, 'guest result', 'guest results') + (expired ? ' (' + expired + ' expired)' : '');

      var filter = el('input', {
        type: 'search', class: 'cms-search', placeholder: 'Filter players by name', 'aria-label': 'Filter players by name',
        autocomplete: 'off', oninput: P.debounce(draw, 150)
      });
      var refresh = el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Refresh', onclick: function () { openQuiz(id); } });
      var tableHost = el('div');

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: quiz ? quiz.display_name : 'Quiz ' + id }));
      md.editor.appendChild(el('p', { class: 'cms-editor-sub', text: 'Quiz ID ' + id + ' · ' + summary }));
      if (players.length) md.editor.appendChild(el('div', { class: 'cms-lb-tools', style: 'margin-top: 16px;' }, filter, refresh));
      md.editor.appendChild(el('div', { style: 'margin-top: 14px;' }, tableHost));

      function draw() {
        P.clear(tableHost);
        var q = P.fold(filter.value);
        var rows = players.filter(function (p) { return !q || P.fold(p.player).indexOf(q) !== -1; });

        if (!players.length) {
          tableHost.appendChild(el('p', { class: 'cms-empty', text: 'Nobody has played this quiz yet.' }));
          return;
        }
        if (!rows.length) {
          tableHost.appendChild(el('p', { class: 'cms-empty', text: 'No player matches that name.' }));
          return;
        }

        var body = el('tbody');
        rows.forEach(function (p) {
          var tags = [];
          if (p.is_guest) tags.push(el('span', { class: 'cms-tag', text: 'Guest' }));
          if (p.expired) tags.push(el('span', { class: 'cms-tag is-expired', text: 'Expired' }));
          body.appendChild(el('tr', { class: p.score === null ? 'is-unfinished' : '' },
            el('td', { class: 'num', text: p.place === null ? '–' : String(p.place) }),
            el('td', { class: 'cms-player' }, p.player, tags),
            el('td', { class: 'num', text: p.score === null ? 'not finished' : p.score.toLocaleString('en-US') }),
            el('td', { class: 'num', text: String(p.completions) }),
            el('td', { class: 'when', text: when(p.last_played) })));
        });
        tableHost.appendChild(el('div', { class: 'cms-table-wrap' },
          el('table', { class: 'cms-table' },
            el('thead', null, el('tr', null,
              el('th', { class: 'num', text: 'Place' }),
              el('th', { text: 'Player' }),
              el('th', { class: 'num', text: 'Best score' }),
              el('th', { class: 'num', text: 'Times finished' }),
              el('th', { text: 'Last played' }))),
            body)));
      }
      draw();
    }
  });
})();
