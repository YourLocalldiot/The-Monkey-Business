// CMS → Quizzes tab: search quizzes, and edit a quiz's name, description,
// questions, answers (with one or more marked correct) and per-question
// time limit. A save goes through the save_quiz() database function
// (docs/supabase-sql.md), so the whole quiz is written all-or-nothing.
(function () {
  var P = window.CMS;
  var el = P.el;

  var DETAIL_COLUMNS =
    'id, display_name, description, ' +
    'quiz_questions(id, position, prompt, time_limit_seconds, ' +
    'quiz_options(id, position, option_text, is_correct))';

  function byPosition(a, b) {
    return (a.position - b.position) || (a.id - b.id);
  }

  function blankOption() {
    return { id: null, option_text: '', is_correct: false };
  }

  function blankQuestion() {
    return {
      id: null,
      prompt: '',
      time_limit_seconds: null,
      open: true,   // editor-only: whether the card is expanded
      options: [blankOption(), blankOption(), blankOption(), blankOption()]
    };
  }

  function blankQuiz() {
    return { id: null, display_name: '', description: '', questions: [blankQuestion()] };
  }

  // Empty, unticked answer rows are placeholders, not answers.
  function isFilled(option) {
    return option.option_text.trim() !== '' || option.is_correct;
  }

  var cardCounter = 0;   // gives each question card a unique body id

  P.register('quizzes', function (pane) {
    var md = P.masterDetail(pane, {
      searchPlaceholder: 'Search quizzes',
      searchLabel: 'Search quizzes by name, description or question text',
      newLabel: 'New',
      onSearch: function () { loadList(); },
      onNew: function () {
        selectedId = null;
        renderList();
        openEditor(blankQuiz());
      },
      onSelect: function (id) { loadQuiz(id); }
    });

    var rows = [];         // last search result
    var searchedFor = '';
    var selectedId = null;
    var listToken = 0;     // a newer search makes an older, slower one irrelevant
    var editorToken = 0;   // same for the editor

    showPlaceholder();
    loadList();

    function showPlaceholder(text) {
      editorToken++;
      P.clear(md.editor);
      md.editor.appendChild(el('p', {
        class: 'cms-editor-sub',
        text: text || 'Pick a quiz on the left to edit it, or press New to start one.'
      }));
    }

    async function loadList() {
      var mine = ++listToken;
      md.setNote('Loading…');
      var term = md.search.value.trim();
      var result = await window.sb.rpc('search_quizzes', { p_query: term });
      if (mine !== listToken) return;
      if (result.error) {
        md.setNote(P.errorText(result.error), true);
        return;
      }
      rows = result.data || [];
      searchedFor = term;
      renderList();
    }

    function renderList() {
      md.setItems(rows.map(function (q) {
        var count = q.question_count === 1 ? '1 question' : q.question_count + ' questions';
        return {
          id: q.id,
          title: q.display_name,
          meta: q.description ? count + ' · ' + q.description : count
        };
      }), selectedId);
      if (rows.length) md.setNote('');
      else md.setNote(searchedFor ? 'No quizzes match your search.' : 'No quizzes yet. Press New to start the first one.');
    }

    async function loadQuiz(id, message, openIndexes) {
      selectedId = id;
      renderList();
      showPlaceholder('Loading…');
      var token = editorToken;

      var result = await window.sb
        .from('quizzes')
        .select(DETAIL_COLUMNS)
        .eq('id', id)
        .single();
      if (token !== editorToken) return;

      if (result.error) {
        P.clear(md.editor);
        md.editor.appendChild(el('p', { class: 'cms-status is-error', text: P.errorText(result.error) }));
        return;
      }

      var row = result.data;
      openEditor({
        id: row.id,
        display_name: row.display_name || '',
        description: row.description || '',
        questions: (row.quiz_questions || []).slice().sort(byPosition).map(function (q, i) {
          return {
            id: q.id,
            prompt: q.prompt,
            time_limit_seconds: q.time_limit_seconds,
            open: !!openIndexes && openIndexes.indexOf(i) !== -1,
            options: (q.quiz_options || []).slice().sort(byPosition).map(function (o) {
              return { id: o.id, option_text: o.option_text, is_correct: o.is_correct };
            })
          };
        })
      }, message);
    }

    function openEditor(state, message) {
      showPlaceholder();   // also invalidates any load still in flight
      P.clear(md.editor);
      P.setDirty(false);

      var isNew = state.id === null;
      var token = editorToken;
      function changed() { P.setDirty(true, function () { showPlaceholder(); }); }

      var nameInput = el('input', {
        type: 'text', maxlength: 200, value: state.display_name,
        placeholder: 'What a P/E ratio really says',
        oninput: function () { state.display_name = nameInput.value; changed(); }
      });
      var descInput = el('textarea', {
        rows: 2, maxlength: 2000, value: state.description,
        oninput: function () { state.description = descInput.value; changed(); }
      });

      var usage = el('p', { class: 'cms-editor-sub', hidden: isNew });
      if (!isNew) {
        usage.textContent = 'Checking where it is used…';
        P.playlistsUsing('quiz_id', state.id).then(function (names) {
          if (token !== editorToken) return;
          if (names === null) usage.textContent = '';
          else if (!names.length) usage.textContent = 'Not used in any playlist yet. Visitors only see a quiz once it is in a playlist.';
          else usage.textContent = 'Used in: ' + names.join(', ');
        });
      }

      // ----- questions -----
      var questionsBox = el('div', { class: 'cms-questions' });

      function renderQuestions(focusIndex, focusAction) {
        P.clear(questionsBox);
        if (!state.questions.length) {
          questionsBox.appendChild(el('p', { class: 'cms-empty', text: 'No questions yet.' }));
        }
        state.questions.forEach(function (question, index) {
          questionsBox.appendChild(questionCard(question, index));
        });
        if (focusIndex !== undefined) {
          var card = questionsBox.children[focusIndex];
          var wanted = card && card.querySelector('[data-action="' + focusAction + '"]');
          if (wanted && wanted.disabled) wanted = card.querySelector('[data-action="' + (focusAction === 'up' ? 'down' : 'up') + '"]');
          if (wanted && !wanted.disabled) wanted.focus();
        }
      }

      function moveQuestion(index, delta) {
        var target = index + delta;
        if (target < 0 || target >= state.questions.length) return;
        var moved = state.questions.splice(index, 1)[0];
        state.questions.splice(target, 0, moved);
        renderQuestions(target, delta < 0 ? 'up' : 'down');
        changed();
      }

      function removeQuestion(index) {
        var q = state.questions[index];
        var hasContent = q.prompt.trim() || q.options.some(isFilled);
        if (hasContent && !window.confirm('Delete question ' + (index + 1) + '?')) return;
        state.questions.splice(index, 1);
        renderQuestions();
        changed();
      }

      function setAllOpen(open) {
        state.questions.forEach(function (q) { q.open = open; });
        renderQuestions();
      }

      function questionCard(q, index) {
        var kind = el('span', { class: 'cms-q-kind' });
        var title = el('span', { class: 'cms-q-title' });
        var meta = el('span', { class: 'cms-q-meta' });
        // Keeps the one-line summary (shown when the card is collapsed) and
        // the single/multiple-answer label in step with the fields.
        function refresh() {
          var correct = q.options.filter(function (o) { return o.is_correct; }).length;
          kind.textContent = correct > 1 ? 'Select all that apply' : correct === 1 ? 'Single answer' : 'No correct answer yet';
          var answers = q.options.filter(isFilled).length;
          title.textContent = q.prompt.trim() || 'No question text yet';
          meta.textContent = answers + (answers === 1 ? ' answer' : ' answers') +
            (q.time_limit_seconds !== null ? ' · ' + q.time_limit_seconds + ' s' : '');
        }

        var bodyId = 'quiz-q-body-' + (++cardCounter);
        var body = el('div', { class: 'cms-q-body', id: bodyId, hidden: !q.open });
        var chevron = P.icon('chevron', 16);
        chevron.setAttribute('class', 'cms-q-chevron');
        var toggle = el('button', {
          type: 'button', class: 'cms-q-toggle',
          'aria-expanded': q.open ? 'true' : 'false', 'aria-controls': bodyId,
          onclick: function () {
            q.open = !q.open;
            card.dataset.open = q.open ? 'true' : 'false';
            body.hidden = !q.open;
            toggle.setAttribute('aria-expanded', q.open ? 'true' : 'false');
          }
        }, chevron, el('span', { class: 'cms-q-num', text: 'Question ' + (index + 1) }), title, meta);

        var up = P.iconButton('Move question up', 'up', function () { moveQuestion(index, -1); });
        var down = P.iconButton('Move question down', 'down', function () { moveQuestion(index, 1); });
        up.dataset.action = 'up';
        down.dataset.action = 'down';
        up.disabled = index === 0;
        down.disabled = index === state.questions.length - 1;

        var prompt = el('textarea', {
          rows: 2, maxlength: 1000, value: q.prompt, placeholder: 'Type the question',
          oninput: function () { q.prompt = prompt.value; refresh(); changed(); }
        });
        var time = el('input', {
          type: 'number', min: 1, max: 3600, step: 1, inputmode: 'numeric', placeholder: 'No limit',
          value: q.time_limit_seconds === null ? '' : String(q.time_limit_seconds),
          oninput: function () {
            q.time_limit_seconds = time.value === '' ? null : Number(time.value);
            refresh();
            changed();
          }
        });

        var optionsBox = el('div', { class: 'cms-options-list' });
        function renderOptions(focusIndex) {
          P.clear(optionsBox);
          q.options.forEach(function (option, i) {
            var row = el('div', { class: 'cms-opt' + (option.is_correct ? ' is-correct' : '') });
            var check = el('input', {
              type: 'checkbox', checked: option.is_correct,
              onchange: function () {
                option.is_correct = check.checked;
                row.classList.toggle('is-correct', option.is_correct);
                refresh();
                changed();
              }
            });
            var text = el('input', {
              type: 'text', class: 'cms-opt-text', maxlength: 500, value: option.option_text,
              placeholder: 'Answer ' + (i + 1),
              'aria-label': 'Answer ' + (i + 1) + ' of question ' + (index + 1),
              oninput: function () { option.option_text = text.value; refresh(); changed(); },
              // Enter moves to the next answer (adding one after the last)
              // instead of submitting the whole quiz.
              onkeydown: function (e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                if (i === q.options.length - 1) {
                  q.options.push(blankOption());
                  renderOptions(i + 1);
                  changed();
                } else {
                  optionsBox.children[i + 1].querySelector('.cms-opt-text').focus();
                }
              }
            });
            row.appendChild(el('label', { class: 'cms-opt-correct' }, check, 'Correct'));
            row.appendChild(text);
            row.appendChild(P.iconButton('Remove this answer', 'close', function () {
              q.options.splice(i, 1);
              renderOptions();
              changed();
            }, 'danger'));
            optionsBox.appendChild(row);
          });
          refresh();
          if (focusIndex !== undefined && optionsBox.children[focusIndex]) {
            optionsBox.children[focusIndex].querySelector('.cms-opt-text').focus();
          }
        }
        renderOptions();

        body.appendChild(P.field('Question', prompt));
        body.appendChild(P.field('Time limit (seconds)', time, 'Leave empty for no time limit.', 'cms-q-time'));
        body.appendChild(el('div', { class: 'cms-options' },
          el('div', { class: 'cms-options-head' },
            el('span', { class: 'cms-options-label', text: 'Answers (tick every correct one)' }),
            kind),
          optionsBox,
          el('button', {
            type: 'button', class: 'btn-secondary btn-small cms-add-row',
            onclick: function () {
              q.options.push(blankOption());
              renderOptions(q.options.length - 1);
              changed();
            }
          }, P.icon('plus', 14), 'Add answer')));

        var card = el('div', { class: 'cms-q', 'data-open': q.open ? 'true' : 'false' },
          el('div', { class: 'cms-q-head' },
            toggle,
            el('div', { class: 'cms-q-tools' },
              up, down,
              P.iconButton('Delete question', 'trash', function () { removeQuestion(index); }, 'danger'))),
          body);
        return card;
      }

      renderQuestions();

      // ----- actions -----
      var statusEl = el('span', { class: 'cms-status', role: 'status', hidden: true });
      var saveBtn = el('button', { type: 'submit', class: 'btn-primary', text: isNew ? 'Create quiz' : 'Save changes' });
      var deleteBtn = isNew ? null : el('button', {
        type: 'button', class: 'btn-danger cms-actions-end', text: 'Delete quiz', onclick: onDelete
      });

      // Returns null when the quiz is fine, else { message, index? } where
      // index is the question to point at.
      function validate() {
        if (!state.display_name.trim()) {
          nameInput.focus();
          return { message: 'Give the quiz a name.' };
        }
        for (var i = 0; i < state.questions.length; i++) {
          var q = state.questions[i];
          var n = i + 1;
          var filled = q.options.filter(isFilled);
          if (!q.prompt.trim()) {
            return { message: 'Question ' + n + ' needs some text.', index: i };
          }
          if (q.time_limit_seconds !== null &&
              !(Number.isInteger(q.time_limit_seconds) && q.time_limit_seconds >= 1 && q.time_limit_seconds <= 3600)) {
            return { message: 'Question ' + n + ': the time limit must be a whole number of seconds from 1 to 3600, or empty.', index: i };
          }
          if (filled.some(function (o) { return o.option_text.trim() === ''; })) {
            return { message: 'Question ' + n + ' has a ticked answer with no text.', index: i };
          }
          if (filled.length < 2) {
            return { message: 'Question ' + n + ' needs at least two answers.', index: i };
          }
          if (!filled.some(function (o) { return o.is_correct; })) {
            return { message: 'Question ' + n + ' needs at least one correct answer. Tick the box next to it.', index: i };
          }
        }
        return null;
      }

      function showProblem(problem) {
        Array.prototype.forEach.call(questionsBox.children, function (card) {
          card.classList.remove('has-error');
        });
        if (problem.index !== undefined) {
          state.questions[problem.index].open = true;
          renderQuestions();
          var card = questionsBox.children[problem.index];
          if (card) {
            card.classList.add('has-error');
            card.scrollIntoView({ block: 'center' });
          }
        }
        P.status(statusEl, problem.message, 'error');
      }

      async function onSubmit(event) {
        event.preventDefault();
        var problem = validate();
        if (problem) {
          showProblem(problem);
          return;
        }
        Array.prototype.forEach.call(questionsBox.children, function (card) {
          card.classList.remove('has-error');
        });

        var openIndexes = [];
        state.questions.forEach(function (q, i) { if (q.open) openIndexes.push(i); });

        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.rpc('save_quiz', {
            p_quiz_id: state.id,
            p_display_name: state.display_name.trim(),
            p_description: state.description.trim(),
            p_questions: state.questions.map(function (q) {
              return {
                id: q.id,
                prompt: q.prompt.trim(),
                time_limit_seconds: q.time_limit_seconds,
                options: q.options.filter(isFilled).map(function (o) {
                  return { id: o.id, text: o.option_text.trim(), is_correct: !!o.is_correct };
                })
              };
            })
          });
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error), 'error');
          return;
        }
        // Reload from the database so new questions and answers pick up
        // their ids; otherwise saving twice would add them twice.
        P.setDirty(false);
        await loadList();
        await loadQuiz(result.data, 'Saved.', openIndexes);
      }

      async function onDelete() {
        var label = state.display_name.trim() || 'this quiz';
        if (!window.confirm('Delete "' + label + '" and all of its questions? This cannot be undone.')) return;
        P.status(statusEl, 'Deleting…');
        var result = await P.withBusy([saveBtn, deleteBtn], function () {
          return window.sb.from('quizzes').delete().eq('id', state.id).select('id');
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error, {
            '23503': 'This quiz is still in a playlist. Remove it from the playlist first, then delete it.'
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
        loadList();
      }

      md.editor.appendChild(el('h2', { class: 'cms-editor-title', text: isNew ? 'New quiz' : 'Edit quiz' }));
      md.editor.appendChild(usage);
      md.editor.appendChild(el('form', { class: 'cms-form', novalidate: true, onsubmit: onSubmit },
        P.field('Name', nameInput),
        P.field('Description', descInput, 'Optional. A short summary, shown under the name in the quiz list.'),
        el('section', { class: 'cms-section' },
          el('div', { class: 'cms-section-head' },
            el('div', { class: 'cms-section-title' },
              el('h3', { text: 'Questions' }),
              el('span', { class: 'cms-hint', text: 'Asked in this order' })),
            el('div', { class: 'cms-section-actions' },
              el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Expand all', onclick: function () { setAllOpen(true); } }),
              el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Collapse all', onclick: function () { setAllOpen(false); } }))),
          questionsBox,
          el('button', {
            type: 'button', class: 'btn-secondary cms-add-row',
            onclick: function () {
              state.questions.push(blankQuestion());
              renderQuestions();
              changed();
              var cards = questionsBox.children;
              var last = cards[cards.length - 1];
              if (last) {
                last.scrollIntoView({ block: 'nearest' });
                last.querySelector('textarea').focus();
              }
            }
          }, P.icon('plus', 14), 'Add question')),
        el('div', { class: 'cms-actions' }, saveBtn, statusEl, deleteBtn)));

      if (message) P.status(statusEl, message, 'ok');
    }
  });
})();
