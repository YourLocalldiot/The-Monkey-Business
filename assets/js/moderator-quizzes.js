// CMS → Quizzes tab: search quizzes, and edit a quiz's name, description,
// questions, answers (with one or more marked correct) and per-question
// time limit, each in English and (optionally) Vietnamese, plus whether the
// questions and the answers are shuffled when the quiz is played. Questions
// can also be added in bulk from a spreadsheet (assets/js/quiz-import.js).
// A save goes through the save_quiz() database function
// (docs/supabase-sql.md), so the whole quiz is written all-or-nothing.
(function () {
  var P = window.CMS;
  var el = P.el;

  var DETAIL_BASE =
    'id, display_name, display_name_vn, description, description_vn, ';
  var SHUFFLE_COLUMNS = 'shuffle_questions, shuffle_answers, ';

  // Reads a quiz with or without the columns that later SQL added (shuffle
  // switches; a picture link per question).
  function fetchQuiz(id, withShuffle, withImage) {
    var questions =
      'quiz_questions(id, position, prompt, prompt_vn, ' + (withImage ? 'image_url, ' : '') + 'time_limit_seconds, ' +
      'quiz_options(id, position, option_text, option_text_vn, is_correct))';
    return window.sb.from('quizzes')
      .select(DETAIL_BASE + (withShuffle ? SHUFFLE_COLUMNS : '') + questions)
      .eq('id', id)
      .single();
  }

  // A picture link has to be a plain http(s) address (the database checks the same).
  var IMAGE_LINK = /^https?:\/\/\S+$/i;
  function badImageLink(link) {
    return link !== '' && (link.length > 2000 || !IMAGE_LINK.test(link));
  }

  // Makes a textarea as tall as its text, so long questions and answers wrap
  // and stay fully visible instead of scrolling sideways or being cut off.
  // Does nothing while the textarea is hidden (there is nothing to measure).
  function autoGrow(box) {
    if (!box.getClientRects().length) return;
    box.style.height = 'auto';
    box.style.height = (box.scrollHeight + box.offsetHeight - box.clientHeight) + 'px';
  }

  function growWithin(root) {
    Array.prototype.forEach.call(root.querySelectorAll('textarea.cms-grow'), autoGrow);
  }

  function byPosition(a, b) {
    return (a.position - b.position) || (a.id - b.id);
  }

  function blankOption() {
    return { id: null, option_text: '', option_text_vn: '', is_correct: false };
  }

  function blankQuestion() {
    return {
      id: null,
      prompt: '',
      prompt_vn: '',
      image_url: '',
      time_limit_seconds: null,
      open: true,   // editor-only: whether the card is expanded
      options: [blankOption(), blankOption(), blankOption(), blankOption()]
    };
  }

  function blankQuiz() {
    return {
      id: null,
      display_name: '', display_name_vn: '', description: '', description_vn: '',
      shuffle_questions: false, shuffle_answers: false,
      shuffle_supported: true,   // unknown until the first save for a new quiz
      image_supported: true,
      questions: [blankQuestion()]
    };
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

      // The shuffle and picture columns come from SQL in docs/pending-supabase-sql.md.
      // Until it has been run, load the quiz without them rather than not at all.
      var result;
      var support = [true, true];   // [shuffle, picture]
      var tiers = [[true, true], [true, false], [false, false]];
      for (var t = 0; t < tiers.length; t++) {
        support = tiers[t];
        result = await fetchQuiz(id, support[0], support[1]);
        if (!result.error || result.error.code !== '42703') break;
      }
      var shuffleSupported = support[0];
      var imageSupported = support[1];
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
        display_name_vn: row.display_name_vn || '',
        description: row.description || '',
        description_vn: row.description_vn || '',
        shuffle_questions: !!row.shuffle_questions,
        shuffle_answers: !!row.shuffle_answers,
        shuffle_supported: shuffleSupported,
        image_supported: imageSupported,
        questions: (row.quiz_questions || []).slice().sort(byPosition).map(function (q, i) {
          return {
            id: q.id,
            prompt: q.prompt,
            prompt_vn: q.prompt_vn || '',
            image_url: q.image_url || '',
            time_limit_seconds: q.time_limit_seconds,
            open: !!openIndexes && openIndexes.indexOf(i) !== -1,
            options: (q.quiz_options || []).slice().sort(byPosition).map(function (o) {
              return { id: o.id, option_text: o.option_text, option_text_vn: o.option_text_vn || '', is_correct: o.is_correct };
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
      var nameVnInput = el('input', {
        type: 'text', maxlength: 200, value: state.display_name_vn,
        oninput: function () { state.display_name_vn = nameVnInput.value; changed(); }
      });
      var descInput = el('textarea', {
        rows: 2, maxlength: 2000, value: state.description,
        oninput: function () { state.description = descInput.value; changed(); }
      });
      var descVnInput = el('textarea', {
        rows: 2, maxlength: 2000, value: state.description_vn,
        oninput: function () { state.description_vn = descVnInput.value; changed(); }
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
      // Text wraps differently when the width changes (window resized, tab
      // shown, sidebar collapsed), so re-measure then.
      if (window.ResizeObserver) {
        var lastWidth = 0;
        new ResizeObserver(function () {
          if (questionsBox.clientWidth === lastWidth) return;
          lastWidth = questionsBox.clientWidth;
          growWithin(questionsBox);
        }).observe(questionsBox);
      }

      function renderQuestions(focusIndex, focusAction) {
        P.clear(questionsBox);
        if (!state.questions.length) {
          questionsBox.appendChild(el('p', { class: 'cms-empty', text: 'No questions yet.' }));
        }
        state.questions.forEach(function (question, index) {
          questionsBox.appendChild(questionCard(question, index));
        });
        growWithin(questionsBox);
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
        var hasContent = q.prompt.trim() || q.image_url.trim() || q.options.some(isFilled);
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
            if (q.open) growWithin(body);
          }
        }, chevron, el('span', { class: 'cms-q-num', text: 'Question ' + (index + 1) }), title, meta);

        var up = P.iconButton('Move question up', 'up', function () { moveQuestion(index, -1); });
        var down = P.iconButton('Move question down', 'down', function () { moveQuestion(index, 1); });
        up.dataset.action = 'up';
        down.dataset.action = 'down';
        up.disabled = index === 0;
        down.disabled = index === state.questions.length - 1;

        var prompt = el('textarea', {
          rows: 2, class: 'cms-grow', maxlength: 1000, value: q.prompt, placeholder: 'Type the question',
          oninput: function () { q.prompt = prompt.value; autoGrow(prompt); refresh(); changed(); }
        });
        var promptVn = el('textarea', {
          rows: 2, class: 'cms-grow', maxlength: 1000, value: q.prompt_vn, placeholder: 'Câu hỏi bằng tiếng Việt (optional)',
          oninput: function () { q.prompt_vn = promptVn.value; autoGrow(promptVn); changed(); }
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

        // Picture: a link, with a small preview so a wrong link is obvious.
        var imageInput = el('input', {
          type: 'url', maxlength: 2000, value: q.image_url, disabled: !state.image_supported,
          placeholder: 'https://example.com/picture.jpg', autocomplete: 'off',
          oninput: function () { q.image_url = imageInput.value; showImage(); changed(); }
        });
        var imagePreview = el('img', { class: 'cms-q-image', alt: '', referrerpolicy: 'no-referrer', hidden: true });
        var imageNote = el('span', { class: 'field-hint is-error', hidden: true });
        var showImage = P.debounce(function () {
          var link = q.image_url.trim();
          imageNote.hidden = true;
          imagePreview.hidden = true;
          if (!link) return;
          if (badImageLink(link)) {
            imageNote.textContent = 'The link must start with http:// or https:// and have no spaces.';
            imageNote.hidden = false;
            return;
          }
          imagePreview.src = link;
        }, 350);
        imagePreview.addEventListener('load', function () { imagePreview.hidden = false; imageNote.hidden = true; });
        imagePreview.addEventListener('error', function () {
          imagePreview.hidden = true;
          imageNote.textContent = "A picture couldn't be loaded from this link.";
          imageNote.hidden = false;
        });
        if (q.image_url.trim()) showImage();

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
            // Enter moves to the next answer (adding one after the last)
            // instead of submitting the whole quiz.
            function nextAnswer(e) {
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
            // Textareas that grow with their text (one line to start with), so
            // a long answer wraps instead of being cut off.
            var text = el('textarea', {
              rows: 1, class: 'cms-opt-text cms-grow', maxlength: 500, value: option.option_text,
              placeholder: 'Answer ' + (i + 1),
              'aria-label': 'Answer ' + (i + 1) + ' of question ' + (index + 1),
              oninput: function () { option.option_text = text.value; autoGrow(text); refresh(); changed(); },
              onkeydown: nextAnswer
            });
            var textVn = el('textarea', {
              rows: 1, class: 'cms-opt-text cms-grow vn', maxlength: 500, value: option.option_text_vn,
              placeholder: 'Đáp án ' + (i + 1) + ' bằng tiếng Việt (optional)',
              'aria-label': 'Answer ' + (i + 1) + ' of question ' + (index + 1) + ' in Vietnamese',
              oninput: function () { option.option_text_vn = textVn.value; autoGrow(textVn); changed(); },
              onkeydown: nextAnswer
            });
            row.appendChild(el('label', { class: 'cms-opt-correct' }, check, 'Correct'));
            row.appendChild(el('div', { class: 'cms-opt-texts' }, text, textVn));
            row.appendChild(P.iconButton('Remove this answer', 'close', function () {
              q.options.splice(i, 1);
              renderOptions();
              changed();
            }, 'danger'));
            optionsBox.appendChild(row);
          });
          refresh();
          growWithin(optionsBox);
          if (focusIndex !== undefined && optionsBox.children[focusIndex]) {
            optionsBox.children[focusIndex].querySelector('.cms-opt-text').focus();
          }
        }
        renderOptions();

        body.appendChild(P.field('Question (English)', prompt));
        body.appendChild(P.field('Question (Vietnamese)', promptVn));
        body.appendChild(P.field('Picture link (optional)', imageInput,
          state.image_supported ? 'A link to an image (https://…). Shown above the question when the quiz is played.' : 'Needs a database update (docs/pending-supabase-sql.md).'));
        body.appendChild(imageNote);
        body.appendChild(imagePreview);
        body.appendChild(P.field('Time limit (seconds)', time, 'Leave empty for the default of 30 seconds.', 'cms-q-time'));
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

      // ----- add questions from a spreadsheet -----
      var importBox = el('div', { class: 'cms-import', role: 'status', hidden: true });

      // kind: 'info' | 'ok' | 'error'. problems: [{ row, message }]
      function showImport(kind, text, problems) {
        P.clear(importBox);
        importBox.hidden = false;
        importBox.className = 'cms-import is-' + kind;
        importBox.setAttribute('role', kind === 'error' ? 'alert' : 'status');
        importBox.appendChild(el('p', { class: 'cms-import-text', text: text }));
        if (problems && problems.length) {
          var shown = problems.slice(0, 25);
          importBox.appendChild(el('ul', { class: 'cms-import-list' }, shown.map(function (p) {
            return el('li', null, p.row ? el('strong', { text: 'Row ' + p.row + ': ' }) : null, p.message);
          })));
          if (problems.length > shown.length) {
            importBox.appendChild(el('p', { class: 'cms-hint', text: '…and ' + (problems.length - shown.length) + ' more.' }));
          }
        }
      }

      var fileInput = el('input', {
        type: 'file', accept: '.csv,text/csv', hidden: true, tabindex: '-1', 'aria-hidden': 'true',
        onchange: onFileChosen
      });
      var uploadBtn = el('button', {
        type: 'button', class: 'btn-secondary btn-small',
        onclick: function () { fileInput.click(); }
      }, P.icon('upload', 14), 'Upload questions');
      var templateLink = el('a', {
        class: 'btn-secondary btn-small', href: window.QuizImport.TEMPLATE_URL,
        download: 'TheMonkeyBusinessQuizTemplate.csv'
      }, P.icon('download', 14), 'Download template');

      // A question nobody has typed into yet (the empty one a new quiz starts with).
      function isUntouched(q) {
        return q.id === null && !q.prompt.trim() && !q.prompt_vn.trim() && !q.image_url.trim() &&
          !q.options.some(function (o) { return isFilled(o) || o.option_text_vn.trim() !== ''; });
      }

      async function onFileChosen() {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';   // so choosing the same file again still fires
        if (!file) return;

        showImport('info', 'Reading ' + file.name + '…');
        uploadBtn.disabled = true;
        var result = await window.QuizImport.parseFile(file);
        uploadBtn.disabled = false;
        if (token !== editorToken) return;   // another quiz was opened meanwhile

        if (result.problems.length) {
          var count = result.problems.length;
          showImport('error',
            'Nothing was added: "' + file.name + '" has ' + (count === 1 ? 'a problem' : count + ' problems') +
            '. Fix ' + (count === 1 ? 'it' : 'them') + ' in the file and upload it again.',
            result.problems);
          return;
        }

        state.questions = state.questions.filter(function (q) { return !isUntouched(q); });
        var firstNew = state.questions.length;
        result.questions.forEach(function (q) { state.questions.push(q); });
        renderQuestions();
        changed();
        var n = result.questions.length;
        showImport('ok',
          'Added ' + n + (n === 1 ? ' question' : ' questions') + ' from "' + file.name + '" (' +
          (n === 1 ? 'question ' + (firstNew + 1) : 'questions ' + (firstNew + 1) + '–' + (firstNew + n)) +
          '). Review them, then press ' + (isNew ? 'Create quiz' : 'Save changes') + ' to keep them.');
        var card = questionsBox.children[firstNew];
        if (card) card.scrollIntoView({ block: 'nearest' });
      }

      // ----- shuffle options -----
      var orderHint = el('span', { class: 'cms-hint' });
      function refreshOrderHint() {
        orderHint.textContent = state.shuffle_questions ? 'Asked in a random order' : 'Asked in this order';
      }
      refreshOrderHint();

      function toggleRow(key, title, hint) {
        var box = el('input', {
          type: 'checkbox', checked: !!state[key], disabled: !state.shuffle_supported,
          onchange: function () {
            state[key] = box.checked;
            refreshOrderHint();
            changed();
          }
        });
        return el('label', { class: 'cms-toggle' }, box,
          el('span', { class: 'cms-toggle-text' },
            el('strong', { text: title }),
            el('span', { class: 'field-hint', text: hint })));
      }

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
          if (q.image_url.trim() !== '') {
            if (!state.image_supported) {
              return { message: 'Question ' + n + ' has a picture, but pictures need a database update (docs/pending-supabase-sql.md). Run it, or clear the picture link.', index: i };
            }
            if (badImageLink(q.image_url.trim())) {
              return { message: 'Question ' + n + ': the picture link must start with http:// or https:// and have no spaces.', index: i };
            }
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

        var args = {
          p_quiz_id: state.id,
          p_display_name: state.display_name.trim(),
          p_description: state.description.trim(),
          p_display_name_vn: state.display_name_vn.trim(),
          p_description_vn: state.description_vn.trim(),
          p_questions: state.questions.map(function (q) {
            return {
              id: q.id,
              prompt: q.prompt.trim(),
              prompt_vn: q.prompt_vn.trim(),
              image_url: q.image_url.trim(),
              time_limit_seconds: q.time_limit_seconds,
              options: q.options.filter(isFilled).map(function (o) {
                return { id: o.id, text: o.option_text.trim(), text_vn: o.option_text_vn.trim(), is_correct: !!o.is_correct };
              })
            };
          })
        };
        var wantsShuffle = state.shuffle_questions || state.shuffle_answers;

        P.status(statusEl, 'Saving…');
        var result = await P.withBusy([saveBtn, deleteBtn], async function () {
          var withShuffle = Object.assign({}, args, {
            p_shuffle_questions: state.shuffle_questions,
            p_shuffle_answers: state.shuffle_answers
          });
          var saved = await window.sb.rpc('save_quiz', withShuffle);
          // PGRST202: the database's save_quiz doesn't take the shuffle
          // settings yet (the quiz-shuffle SQL hasn't been run). With both
          // switches off there is nothing to lose, so save the old way.
          if (saved.error && saved.error.code === 'PGRST202' && !wantsShuffle) {
            saved = await window.sb.rpc('save_quiz', args);
          }
          return saved;
        });
        if (result.error) {
          P.status(statusEl, P.errorText(result.error, wantsShuffle ? {
            PGRST202: 'Shuffling needs a database update that has not been run yet (see docs/pending-supabase-sql.md). Run it, or switch both shuffle options off to save without it.'
          } : null), 'error');
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
        el('div', { class: 'field-row' },
          P.field('Name (English)', nameInput),
          P.field('Name (Vietnamese)', nameVnInput, 'Optional. English is shown when empty.')),
        P.field('Description (English)', descInput, 'Optional. A short summary, shown under the name in the quiz list.'),
        P.field('Description (Vietnamese)', descVnInput),
        el('section', { class: 'cms-section' },
          el('div', { class: 'cms-section-head' },
            el('h3', { text: 'When the quiz is played' }),
            state.shuffle_supported ? null : el('span', { class: 'cms-hint', text: 'Needs a database update (docs/pending-supabase-sql.md)' })),
          toggleRow('shuffle_questions', 'Shuffle the questions', 'Each player gets the questions in a different, random order.'),
          toggleRow('shuffle_answers', 'Shuffle the answer choices', 'The answers of every question are shown in a random order.')),
        el('section', { class: 'cms-section' },
          el('div', { class: 'cms-section-head' },
            el('div', { class: 'cms-section-title' },
              el('h3', { text: 'Questions' }),
              orderHint),
            el('div', { class: 'cms-section-actions' },
              el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Expand all', onclick: function () { setAllOpen(true); } }),
              el('button', { type: 'button', class: 'btn-secondary btn-small', text: 'Collapse all', onclick: function () { setAllOpen(false); } }))),
          el('div', { class: 'cms-bulk' },
            el('div', { class: 'cms-bulk-text' },
              el('strong', { text: 'Add many questions at once' }),
              el('span', { class: 'field-hint', text: 'Download the CSV template, fill in one question per row, then upload it. The questions are added after the ones below.' })),
            el('div', { class: 'cms-section-actions' }, templateLink, uploadBtn, fileInput)),
          importBox,
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
