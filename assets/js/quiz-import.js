// Reads a quiz-question file (.xlsx or .csv) in the format of
// assets/templates/TheMonkeyBusinessQuizTemplate.xlsx and turns it into
// question objects for the CMS quiz editor (moderator-quizzes.js).
//
//   QuizImport.parseFile(file) -> Promise<{ questions: [...], problems: [...] }>
//
// Nothing is returned for a file with any problem: `problems` lists every
// one (each { row, message }; row is the spreadsheet row, or 0 for the file
// as a whole) and `questions` is empty. A file is accepted whole or not at all.
//
// The xlsx reader is deliberately small: an .xlsx is a zip of XML files, and
// only the first worksheet and the shared-strings table are needed. It uses
// the browser's own DecompressionStream, so there is no library to load.
(function () {
  var MAX_QUESTIONS = 500;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var MAX_OPTIONS = 6;
  var PROMPT_MAX = 1000;
  var OPTION_MAX = 500;

  var REQUIRED = ['prompt', 'num_options', 'correct_position', 'option_1', 'option_2'];
  var KNOWN = ['prompt', 'prompt_vn', 'time_limit_seconds', 'num_options', 'correct_position'];
  for (var n = 1; n <= MAX_OPTIONS; n++) KNOWN.push('option_' + n, 'option_' + n + '_vn');

  function problem(row, message) {
    return { row: row, message: message };
  }

  // ---------- reading a file into rows of text ----------

  // A row is { number: <row in the spreadsheet>, cells: [text, ...] }.

  function columnIndex(ref) {
    var letters = /^[A-Z]+/i.exec(ref || '');
    if (!letters) return -1;
    var index = 0;
    letters[0].toUpperCase().split('').forEach(function (ch) { index = index * 26 + (ch.charCodeAt(0) - 64); });
    return index - 1;
  }

  function u16(view, at) { return view.getUint16(at, true); }
  function u32(view, at) { return view.getUint32(at, true); }

  async function inflate(bytes) {
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // Returns { 'xl/workbook.xml': Uint8Array, ... } for the wanted names.
  async function unzip(buffer, wanted) {
    var view = new DataView(buffer);
    var bytes = new Uint8Array(buffer);
    var end = -1;
    for (var i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) {
      if (u32(view, i) === 0x06054b50) { end = i; break; }
    }
    if (end < 0) throw new Error('not a zip');

    var count = u16(view, end + 10);
    var at = u32(view, end + 16);
    var decoder = new TextDecoder();
    var found = {};
    for (var k = 0; k < count; k++) {
      if (at + 46 > buffer.byteLength || u32(view, at) !== 0x02014b50) throw new Error('bad zip directory');
      var method = u16(view, at + 10);
      var size = u32(view, at + 20);
      var nameLength = u16(view, at + 28);
      var extraLength = u16(view, at + 30);
      var commentLength = u16(view, at + 32);
      var local = u32(view, at + 42);
      var name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
      at += 46 + nameLength + extraLength + commentLength;

      if (wanted.indexOf(name) === -1) continue;
      if (u32(view, local) !== 0x04034b50) throw new Error('bad zip entry');
      var start = local + 30 + u16(view, local + 26) + u16(view, local + 28);
      var data = bytes.subarray(start, start + size);
      if (method === 0) found[name] = data;
      else if (method === 8) found[name] = await inflate(data);
      else throw new Error('unsupported zip compression');
    }
    return found;
  }

  function parseXml(bytes) {
    var doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('bad xml');
    return doc;
  }

  // Direct children of `node` with this local name.
  function children(node, name) {
    return Array.prototype.filter.call(node.childNodes, function (c) { return c.localName === name; });
  }

  function textOf(node) {   // all <t> runs inside, in order (rich text has several)
    return Array.prototype.map.call(node.getElementsByTagName('t'), function (t) { return t.textContent; }).join('');
  }

  async function readXlsx(buffer) {
    var base = await unzip(buffer, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml']);
    if (!base['xl/workbook.xml']) throw new Error('no workbook');

    // The first sheet in the workbook, and where its XML lives.
    var workbook = parseXml(base['xl/workbook.xml']);
    var sheet = workbook.getElementsByTagName('sheet')[0];
    if (!sheet) throw new Error('no sheet');
    var target = 'worksheets/sheet1.xml';
    var relId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    if (base['xl/_rels/workbook.xml.rels'] && relId) {
      var rels = parseXml(base['xl/_rels/workbook.xml.rels']).getElementsByTagName('Relationship');
      for (var r = 0; r < rels.length; r++) {
        if (rels[r].getAttribute('Id') === relId) target = rels[r].getAttribute('Target');
      }
    }
    var sheetPath = target.charAt(0) === '/' ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    var sheetFiles = await unzip(buffer, [sheetPath]);
    if (!sheetFiles[sheetPath]) throw new Error('no sheet data');

    var shared = [];
    if (base['xl/sharedStrings.xml']) {
      shared = children(parseXml(base['xl/sharedStrings.xml']).documentElement, 'si').map(textOf);
    }

    var rows = [];
    var sheetDoc = parseXml(sheetFiles[sheetPath]);
    var rowNodes = sheetDoc.getElementsByTagName('row');
    for (var i = 0; i < rowNodes.length; i++) {
      var rowNode = rowNodes[i];
      var number = Number(rowNode.getAttribute('r')) || (rows.length ? rows[rows.length - 1].number + 1 : 1);
      var cells = [];
      var cellNodes = children(rowNode, 'c');
      for (var c = 0; c < cellNodes.length; c++) {
        var cell = cellNodes[c];
        var column = columnIndex(cell.getAttribute('r'));
        if (column < 0) column = cells.length;
        var type = cell.getAttribute('t');
        var valueNode = children(cell, 'v')[0];
        var text = '';
        if (type === 'inlineStr') text = textOf(cell);
        else if (!valueNode) text = '';
        else if (type === 's') text = shared[Number(valueNode.textContent)] || '';
        else if (type === 'b') text = valueNode.textContent === '1' ? 'TRUE' : 'FALSE';
        else text = valueNode.textContent;
        cells[column] = text;
      }
      rows.push({ number: number, cells: cells });
    }
    return rows;
  }

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
          time_limit_seconds: time,
          open: false,
          options: options
        });
      }
    });

    return problems.length ? { questions: [], problems: problems } : { questions: questions, problems: [] };
  }

  async function parseFile(file) {
    var name = String(file && file.name || '').toLowerCase();
    var isXlsx = /\.xlsx$/.test(name);
    var isCsv = /\.(csv|txt)$/.test(name);
    if (!isXlsx && !isCsv) {
      return { questions: [], problems: [problem(0, 'Upload the .xlsx template (or a .csv saved from it). "' + (file && file.name || 'This file') + '" is a different type of file.')] };
    }
    if (file.size > MAX_FILE_BYTES) {
      return { questions: [], problems: [problem(0, 'The file is larger than 5 MB.')] };
    }
    if (file.size === 0) {
      return { questions: [], problems: [problem(0, 'The file is empty.')] };
    }

    var rows;
    try {
      if (isXlsx) {
        if (typeof DecompressionStream === 'undefined') {
          return { questions: [], problems: [problem(0, 'This browser cannot open .xlsx files. Save the sheet as .csv (File → Save As → CSV) and upload that, or use an up-to-date Chrome, Edge, Safari or Firefox.')] };
        }
        rows = await readXlsx(await file.arrayBuffer());
      } else {
        rows = readCsv(await file.text());
      }
    } catch (error) {
      return { questions: [], problems: [problem(0, 'Could not read this file. Make sure it is the unmodified template saved as .xlsx (or a plain .csv), not a different or damaged file.')] };
    }
    return buildQuestions(rows);
  }

  window.QuizImport = {
    TEMPLATE_URL: 'assets/templates/TheMonkeyBusinessQuizTemplate.xlsx',
    parseFile: parseFile,
    // exposed for testing
    _buildQuestions: buildQuestions,
    _readCsv: readCsv
  };
})();
