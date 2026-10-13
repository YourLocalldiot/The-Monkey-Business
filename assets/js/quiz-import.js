// Reads a quiz-question CSV file in the format of
// assets/templates/TheMonkeyBusinessQuizTemplate.csv and turns it into
// question objects for the CMS quiz editor (moderator-quizzes.js).
//
//   QuizImport.parseFile(file) -> Promise<{ questions: [...], problems: [...] }>
//
// Nothing is returned for a file with any problem: `problems` lists every
// one (each { row, message }; row is the line in the file, or 0 for the file
// as a whole) and `questions` is empty. A file is accepted whole or not at all.
(function () {
  var MAX_QUESTIONS = 500;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_OPTIONS = 6;
  var PROMPT_MAX = 1000;
  var OPTION_MAX = 500;
  var IMAGE_MAX = 2000;

  var REQUIRED = ['prompt', 'num_options', 'correct_position', 'option_1', 'option_2'];
  var KNOWN = ['prompt', 'prompt_vn', 'image_url', 'time_limit_seconds', 'num_options', 'correct_position'];
  for (var n = 1; n <= MAX_OPTIONS; n++) KNOWN.push('option_' + n, 'option_' + n + '_vn');

  function problem(row, message) {
    return { row: row, message: message };
  }

  // ---------- reading the file into rows of text ----------

  // A row is { number: <record in the file>, cells: [text, ...] }.

  // Comma, semicolon or tab separated, depending on what the header uses
  // (Excel in some regions saves CSV with semicolons).
  function readCsv(text) {
    text = text.replace(/^﻿/, '');
    var firstLine = text.split(/\r\n|\n|\r/)[0] || '';
    var delimiter = ',';
    [';', '\t'].forEach(function (candidate) {
      if (firstLine.split(candidate).length > firstLine.split(delimiter).length) delimiter = candidate;
    });

    var records = [];
    var cells = [''];
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inQuotes) {
        if (ch === '"' && text.charAt(i + 1) === '"') { cells[cells.length - 1] += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cells[cells.length - 1] += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        cells.push('');
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text.charAt(i + 1) === '\n') i++;
        records.push(cells);
        cells = [''];
      } else {
        cells[cells.length - 1] += ch;
      }
    }
    if (cells.length > 1 || cells[0] !== '') records.push(cells);
    return records.map(function (record, index) { return { number: index + 1, cells: record }; });
  }

  // ---------- checking the rows ----------

  function cellText(value) {
    return value === undefined || value === null ? '' : String(value).trim();
  }

  function isBlankRow(row) {
    return row.cells.every(function (c) { return cellText(c) === ''; });
  }

  function listJoin(items) {
    return items.length <= 1 ? items.join('') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  function buildQuestions(rows) {
    var problems = [];
    var questions = [];

    var headerRow = null;
    for (var i = 0; i < rows.length; i++) {
      if (!isBlankRow(rows[i])) { headerRow = rows[i]; rows = rows.slice(i + 1); break; }
    }
    if (!headerRow) {
      return { questions: [], problems: [problem(0, 'The file is empty. Download the template, fill it in and upload it again.')] };
    }

    // Header: which column is which.
    var columns = {};
    headerRow.cells.forEach(function (raw, index) {
      var name = cellText(raw).toLowerCase().replace(/[\s-]+/g, '_');
      if (name === '') return;
      if (KNOWN.indexOf(name) === -1) {
        problems.push(problem(headerRow.number, 'Column "' + cellText(raw) + '" is not part of the template.'));
      } else if (columns[name] !== undefined) {
        problems.push(problem(headerRow.number, 'Column "' + name + '" appears more than once.'));
      } else {
        columns[name] = index;
      }
    });
    var missing = REQUIRED.filter(function (name) { return columns[name] === undefined; });
    if (missing.length) {
      problems.push(problem(headerRow.number, 'The first row must have the template\'s column names. Missing: ' + listJoin(missing) + '.'));
    }
    if (problems.length) {
      return { questions: [], problems: problems.concat(problem(0, 'This does not look like the quiz template. Download the template and keep its first row as it is.')) };
    }

    function get(row, name) {
      return columns[name] === undefined ? '' : cellText(row.cells[columns[name]]);
    }

    var dataRows = rows.filter(function (row) { return !isBlankRow(row); });
    if (!dataRows.length) {
      return { questions: [], problems: [problem(0, 'The file has the right columns but no questions in it.')] };
    }
    if (dataRows.length > MAX_QUESTIONS) {
      return { questions: [], problems: [problem(0, 'The file has ' + dataRows.length + ' questions; add at most ' + MAX_QUESTIONS + ' at a time.')] };
    }

    dataRows.forEach(function (row) {
      var at = row.number;
      var before = problems.length;

      var prompt = get(row, 'prompt');
      var promptVn = get(row, 'prompt_vn');
      if (!prompt) problems.push(problem(at, 'The question text (prompt) is empty.'));
      else if (prompt.length > PROMPT_MAX) problems.push(problem(at, 'The question text is longer than ' + PROMPT_MAX + ' characters.'));
      if (promptVn.length > PROMPT_MAX) problems.push(problem(at, 'The Vietnamese question text (prompt_vn) is longer than ' + PROMPT_MAX + ' characters.'));

      // Optional picture shown with the question: a plain http(s) link.
      var image = get(row, 'image_url');
      if (image && (image.length > IMAGE_MAX || !/^https?:\/\/\S+$/i.test(image))) {
        problems.push(problem(at, 'image_url must be a link starting with http:// or https:// (with no spaces), or empty for no picture (found "' + (image.length > 60 ? image.slice(0, 60) + '…' : image) + '").'));
      }

      var timeRaw = get(row, 'time_limit_seconds');
      var time = null;
      if (timeRaw !== '') {
        if (!/^\d+(\.0+)?$/.test(timeRaw) || Number(timeRaw) < 1 || Number(timeRaw) > 3600) {
          problems.push(problem(at, 'time_limit_seconds must be a whole number from 1 to 3600, or empty for no limit (found "' + timeRaw + '").'));
        } else {
          time = Math.round(Number(timeRaw));
        }
      }

      var countRaw = get(row, 'num_options');
      var count = 0;
      if (!/^\d+(\.0+)?$/.test(countRaw) || Number(countRaw) < 2 || Number(countRaw) > MAX_OPTIONS) {
        problems.push(problem(at, 'num_options must be a whole number from 2 to ' + MAX_OPTIONS + (countRaw ? ' (found "' + countRaw + '")' : '') + '.'));
      } else {
        count = Math.round(Number(countRaw));
      }

      var options = [];
      for (var n = 1; n <= MAX_OPTIONS; n++) {
        var text = get(row, 'option_' + n);
        var textVn = get(row, 'option_' + n + '_vn');
        if (count && n <= count) {
          if (!text) problems.push(problem(at, 'option_' + n + ' is empty, but num_options is ' + count + '.'));
          else if (text.length > OPTION_MAX) problems.push(problem(at, 'option_' + n + ' is longer than ' + OPTION_MAX + ' characters.'));
          if (textVn.length > OPTION_MAX) problems.push(problem(at, 'option_' + n + '_vn is longer than ' + OPTION_MAX + ' characters.'));
          options.push({ id: null, option_text: text, option_text_vn: textVn, is_correct: false });
        } else if (count && (text || textVn)) {
          problems.push(problem(at, 'option_' + n + ' has text, but num_options is only ' + count + '. Raise num_options or clear that cell.'));
        }
      }

      // correct_position: 1-based; "1" or several as "1,3" for select-all questions.
      var correctRaw = get(row, 'correct_position');
      if (!correctRaw) {
        problems.push(problem(at, 'correct_position is empty. Give the number of the correct option (1, 2, ...).'));
      } else if (count) {
        var picks = correctRaw.split(/[\s,;]+/).filter(Boolean);
        var valid = picks.every(function (p) { return /^\d+(\.0+)?$/.test(p) && Number(p) >= 1 && Number(p) <= count; });
        var numbers = picks.map(Number);
        if (!valid) {
          problems.push(problem(at, 'correct_position must be a number from 1 to ' + count + ' (found "' + correctRaw + '"). Use e.g. 1,3 if several answers are correct.'));
        } else if (numbers.some(function (v, k) { return numbers.indexOf(v) !== k; })) {
          problems.push(problem(at, 'correct_position lists the same option twice ("' + correctRaw + '").'));
        } else if (problems.length === before) {
          numbers.forEach(function (v) { options[v - 1].is_correct = true; });
        }
      }

      if (problems.length === before) {
        questions.push({
          id: null,
          prompt: prompt,
          prompt_vn: promptVn,
          image_url: image,
          time_limit_seconds: time,
          open: false,
          options: options
        });
      }
    });

    return problems.length ? { questions: [], problems: problems } : { questions: questions, problems: [] };
  }

  async function parseFile(file) {
    var name = String(file && file.name || '');
    if (!/\.csv$/i.test(name)) {
      return { questions: [], problems: [problem(0, 'Upload the .csv template. "' + (name || 'This file') + '" is a different type of file. In Excel, use File → Save As → CSV UTF-8.')] };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { questions: [], problems: [problem(0, 'The file is larger than 5 MB.')] };
    }
    if (file.size === 0) {
      return { questions: [], problems: [problem(0, 'The file is empty.')] };
    }

    var rows;
    try {
      rows = readCsv(await file.text());
    } catch (error) {
      return { questions: [], problems: [problem(0, 'Could not read this file. Make sure it is the template saved as a plain .csv.')] };
    }
    return buildQuestions(rows);
  }

  window.QuizImport = {
    TEMPLATE_URL: 'assets/templates/TheMonkeyBusinessQuizTemplate.csv',
    parseFile: parseFile,
    // exposed for testing
    _buildQuestions: buildQuestions,
    _readCsv: readCsv
  };
})();
