# -*- coding: utf-8 -*-
"""把觀光署考畢試題 PDF 轉成題庫 JSON（不含解析）。

用法：python tools/parse_pdf.py <年度> <科目代號> <科目key>
例：  python tools/parse_pdf.py 115 1101 practice
輸出：data/raw/<年度>-<科目key>.json
"""
import json, re, sys, unicodedata, pathlib
import pdfplumber

ROOT = pathlib.Path(__file__).resolve().parent.parent
MARK = {'': 'A', '': 'B', '': 'C', '': 'D'}
OPT = '\u0001'  # 選項分隔記號


def norm(s: str) -> str:
    out = []
    for ch in s:
        if ch in MARK:
            out.append(OPT + MARK[ch])
        elif 0xF900 <= ord(ch) <= 0xFAFF:  # 相容表意字 → 標準字
            out.append(unicodedata.normalize('NFKC', ch))
        elif 0xE000 <= ord(ch) <= 0xF8FF:  # 其他私有字元丟掉
            continue
        else:
            out.append(ch)
    return ''.join(out)


def blank_chars(page):
    """英文填空的底線是細矩形；底下沒有文字的才是空格，轉成假字元 ____。"""
    chars = page.chars
    if not chars:
        return []
    proto = chars[0]
    fakes = []
    for r in page.rects:
        w, h = r['x1'] - r['x0'], r['height']
        if h > 1.5 or w < 12 or w > 200:
            continue
        # 這條線上方若已有文字（例如畫底線強調的字、表頭欄位），略過
        covered = any(c['x0'] < r['x1'] - 1 and c['x1'] > r['x0'] + 1
                      and -1 <= r['top'] - c['bottom'] <= 4 for c in chars)
        if covered:
            continue
        same_line = [c for c in chars if abs(c['bottom'] - r['top']) < 4 and c['text'].strip()]
        if same_line:
            proto = min(same_line, key=lambda c: abs(c['x0'] - r['x0']))
            top, bottom = proto['top'], proto['bottom']
        else:
            bottom = r['top']
            top = bottom - 11
        f = dict(proto)
        f.update(text='____', x0=r['x0'], x1=r['x1'], top=top, bottom=bottom,
                 doctop=top + (proto['doctop'] - proto['top']))
        fakes.append(f)
    return fakes


def page_lines(pdf_path):
    lines = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            chars = list(page.chars) + blank_chars(page)
            txt = pdfplumber.utils.extract_text(chars, x_tolerance=1.5, y_tolerance=3) or ''
            for ln in txt.split('\n'):
                ln = norm(ln).rstrip()
                if re.match(r'^\s*(代號|頁次)[:：]', ln):
                    continue
                if re.search(r'頁次[:：]\s*\d', ln):
                    continue
                lines.append(ln)
    return lines


def parse_questions(lines):
    # 找到第一題
    start = next(i for i, l in enumerate(lines) if re.match(r'^1\s', l))
    header = lines[:start]
    body = lines[start:]
    qs, cur, expect = [], None, 1
    for ln in body:
        m = re.match(r'^(\d{1,2})\s+(.*)$', ln)
        if m and int(m.group(1)) == expect:
            cur = {'no': expect, 'raw': m.group(2)}
            qs.append(cur)
            expect += 1
        elif cur is not None:
            cur['raw'] += '\n' + ln
    # 閱讀測驗：「請依下文回答第 X 題至第 Y 題：」後面的文章，會黏在前一題尾巴
    passages = {}
    pat = re.compile(r'請依下文回答第\s*(\d+)\s*題至第\s*(\d+)\s*題[:：]?')
    for q in qs:
        m = pat.search(q['raw'])
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            text = q['raw'][m.end():].strip()
            q['raw'] = q['raw'][:m.start()]
            text = re.sub(r'(?<=[^\x00-\x7f])\n(?=[^\x00-\x7f])', '', text)
            paras = re.sub(r'(?<=[.!?”"])\n(?=[A-Z])', '\n\n', text)  # 句點換行視為分段
            paras = re.sub(r'(?<!\n)\n(?!\n)', ' ', paras)
            pid = f'p{a}-{b}'
            passages[pid] = {'range': [a, b], 'text': paras.strip()}
            for n in range(a, b + 1):
                passages.setdefault('_map', {})[n] = pid
    pmap = passages.pop('_map', {})
    out = []
    for q in qs:
        raw = q['raw']
        parts = raw.split(OPT)
        stem = parts[0].strip()
        opts = {}
        for p in parts[1:]:
            opts[p[0]] = re.sub(r'\s*\n\s*', ' ', p[1:]).strip().rstrip('ˉ').strip()
        # 題目內換行：中文接中文不留空白
        stem = re.sub(r'(?<=[^\x00-\x7f])\n(?=[^\x00-\x7f])', '', stem)
        stem = stem.replace('\n', ' ').strip()
        item = {'no': q['no'], 'stem': stem,
                'options': [opts.get(k, '') for k in 'ABCD']}
        if q['no'] in pmap:
            item['passage'] = pmap[q['no']]
        out.append(item)
    return header, out, passages


def parse_answers(path):
    if not path.exists():
        return {}, ''
    t = '\n'.join(norm(l) for l in page_lines(path))
    ans = {}
    nos = []
    for ln in t.split('\n'):
        if ln.startswith('題號'):
            nos = [int(x) for x in re.findall(r'第\s*(\d+)\s*題', ln)]
        elif ln.startswith('答案') and nos:
            vals = ln.split()[1:]
            for n, v in zip(nos, vals):
                ans[n] = v
            nos = []
    note = ''
    m = re.search(r'備\s*註[:：](.*)', t, re.S)
    if m:
        note = re.sub(r'\s+', ' ', m.group(1)).strip()
    return ans, note


def apply_note(ans, note):
    """備註例：第 35 題答 B 給分。／第 3 題答 A 或 C 給分／第 5 題一律給分"""
    extra = {}
    for m in re.finditer(r'第\s*(\d+)\s*題([^。；;]*)', note):
        n, rest = int(m.group(1)), m.group(2)
        if '一律給分' in rest:
            extra[n] = ['A', 'B', 'C', 'D']
        else:
            letters = re.findall(r'[A-D]', rest)
            if letters:
                extra[n] = letters
    return extra


def main():
    year, code, key = sys.argv[1], sys.argv[2], sys.argv[3]
    src = ROOT / 'source' / year
    header, qs, passages = parse_questions(page_lines(src / f'{code}Q.pdf'))
    ans, note = parse_answers(src / f'{code}A.pdf')
    ansN, noteN = parse_answers(src / f'{code}AN.pdf')
    if ansN:
        ans, note = ansN, noteN
    extra = apply_note(ans, note)
    problems = []
    for q in qs:
        a = ans.get(q['no'], '')
        accepted = extra.get(q['no'])
        if accepted:
            q['answer'] = accepted
        elif a in list('ABCD'):
            q['answer'] = [a]
        else:
            q['answer'] = []
            problems.append(f"第{q['no']}題答案異常:{a}")
        if any(not o for o in q['options']):
            problems.append(f"第{q['no']}題選項缺漏")
    data = {
        'year': int(year), 'code': code, 'subject': key,
        'source': f'交通部觀光署 {year}年導遊人員及領隊人員評量測驗 考畢試題',
        'answerNote': note, 'header': [h for h in header if h.strip()],
        'passages': passages,
        'questions': qs,
    }
    outdir = ROOT / 'data' / 'raw'
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f'{year}-{key}.json'
    out.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'{out.name}: {len(qs)} 題；答案 {len(ans)}；備註：{note or "無"}')
    for p in problems:
        print('  !', p)


if __name__ == '__main__':
    main()
