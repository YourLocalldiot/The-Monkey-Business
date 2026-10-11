#!/usr/bin/env python3
"""Checks the two-language text system (assets/js/i18n.js).

  python scripts/check-i18n.py

Run it after adding or changing any text. It fails (exit code 1) if:
  - a key used in a page (data-i18n...) or a script (I18N.t('key')) is missing
    from English or Vietnamese in assets/js/i18n-strings.js,
  - English and Vietnamese don't have the same keys, or use different {placeholders},
  - the English text written in an HTML page differs from the English
    dictionary entry for its key (the page's English is what visitors see,
    so the two must not drift apart).
Keys nobody uses are listed as warnings.
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STRINGS_FILE = ROOT / 'assets' / 'js' / 'i18n-strings.js'
ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'content']
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}

errors = []
warnings = []


def squash(text):
    return re.sub(r'\s+', ' ', text).strip()


def load_strings():
    raw = STRINGS_FILE.read_text(encoding='utf-8')
    body = raw[raw.index('{'):raw.rindex('}') + 1]
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        sys.exit('%s is not valid JSON inside the object: %s' % (STRINGS_FILE.name, exc))


class Page(HTMLParser):
    """Collects every data-i18n element with its own (direct) text."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.text_elements = []   # (key, own text, tag)
        self.attr_uses = []       # (key, attribute, value, tag)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        node = {'tag': tag, 'key': attrs.get('data-i18n'), 'text': []}
        for attribute in ATTRIBUTES:
            key = attrs.get('data-i18n-' + attribute)
            if key:
                self.attr_uses.append((key, attribute, attrs.get(attribute, ''), tag))
        if node['key']:
            self.text_elements.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]['tag'] == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        if self.stack and data.strip():
            self.stack[-1]['text'].append(data)


def main():
    strings = load_strings()
    en, vi = strings.get('en', {}), strings.get('vi', {})
    used = set()

    for key in sorted(set(en) ^ set(vi)):
        errors.append('key only in one language: %s' % key)
    for key in sorted(set(en) & set(vi)):
        if sorted(re.findall(r'\{(\w+)\}', en[key])) != sorted(re.findall(r'\{(\w+)\}', vi[key])):
            errors.append('placeholders differ between en and vi: %s' % key)

    for path in sorted(ROOT.glob('*.html')):
        page = Page()
        page.feed(path.read_text(encoding='utf-8'))
        for node in page.text_elements:
            key = node['key']
            used.add(key)
            if key not in en or key not in vi:
                errors.append('%s: unknown key "%s"' % (path.name, key))
                continue
            own = squash(node['text'][0]) if node['text'] else ''
            if own != squash(en[key]):
                errors.append('%s: <%s data-i18n="%s"> says %r but the English dictionary says %r'
                              % (path.name, node['tag'], key, own, squash(en[key])))
        for key, attribute, value, tag in page.attr_uses:
            used.add(key)
            if key not in en or key not in vi:
                errors.append('%s: unknown key "%s"' % (path.name, key))
            elif squash(value) != squash(en[key]):
                errors.append('%s: <%s %s> is %r but the English dictionary says %r'
                              % (path.name, tag, attribute, squash(value), squash(en[key])))

    for path in sorted((ROOT / 'assets' / 'js').glob('*.js')):
        if path.name in ('i18n.js', 'i18n-strings.js'):
            continue
        source = path.read_text(encoding='utf-8')
        for key in re.findall(r'\bt\(\s*[\'"]([\w.]+)[\'"]', source):
            used.add(key)
            if key not in en or key not in vi:
                errors.append('%s: unknown key "%s"' % (path.name, key))
        # keys picked inside a conditional, e.g. t(isQuiz ? 'a.b' : 'c.d')
        for literal in re.findall(r'[\'"]([A-Za-z]+(?:\.[A-Za-z0-9]+)+)[\'"]', source):
            if literal in en:
                used.add(literal)

    for key in sorted(set(en) - used):
        warnings.append('unused key: %s' % key)

    for line in warnings:
        print('warning:', line)
    for line in errors:
        print('ERROR:', line)
    print('%d keys per language, %d errors, %d warnings' % (len(en), len(errors), len(warnings)))
    return 1 if errors else 0


if __name__ == '__main__':
    sys.exit(main())
