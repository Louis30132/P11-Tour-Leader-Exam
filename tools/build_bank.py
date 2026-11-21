# -*- coding: utf-8 -*-
"""合併 data/raw（題目+答案）與 data/explain（解析）→ app/data/bank.json

用法：python tools/build_bank.py
"""
import json, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SUBJECTS = {
    'practice': '領隊執業實務',
    'law': '領隊執業法規',
    'resources': '觀光資源概要',
    'english': '外國語（英語）',
}


def main():
    questions, passages, missing = [], {}, []
    papers = []
    for f in sorted((ROOT / 'data' / 'raw').glob('*.json')):
        d = json.loads(f.read_text(encoding='utf-8'))
        year, subj = d['year'], d['subject']
        exp_file = ROOT / 'data' / 'explain' / f.name
        exp = json.loads(exp_file.read_text(encoding='utf-8')) if exp_file.exists() else {}
        for pid, p in d.get('passages', {}).items():
            passages[f'{year}-{subj}-{pid}'] = p['text']
        for q in d['questions']:
            e = exp.get(str(q['no']), {})
            if not e:
                missing.append(f"{year}-{subj}-{q['no']}")
            item = {
                'id': f"{year}-{subj}-{q['no']}",
                'y': year, 's': subj, 'n': q['no'],
                'q': q['stem'], 'o': q['options'], 'a': q['answer'],
                't': e.get('t', ''), 'e': e.get('e', ''),
                'src': 'official',
            }
            if e.get('r'):
                item['r'] = 1
            if q.get('passage'):
                item['p'] = f"{year}-{subj}-{q['passage']}"
            questions.append(item)
        papers.append({'y': year, 's': subj, 'count': len(d['questions']), 'note': d.get('answerNote', '')})
    # 閱讀逐句拆解：data/reading/<年度>-english.json → key 與 passages 相同
    reading = {}
    for f in sorted((ROOT / 'data' / 'reading').glob('*.json')):
        year, subj = f.stem.split('-', 1)
        for pid, r in json.loads(f.read_text(encoding='utf-8')).items():
            key = f'{year}-{subj}-{pid}'
            if key not in passages:
                print(f'  ! 閱讀拆解找不到對應文章：{key}')
            reading[key] = r
    # 文法小教室：題目加上 g（文法重點）與 gt（主題 id）
    grammar = []
    gfile = ROOT / 'data' / 'grammar.json'
    if gfile.exists():
        qmap = {q['id']: q for q in questions}
        for t in json.loads(gfile.read_text(encoding='utf-8'))['topics']:
            notes = t.pop('notes', {})
            t['qs'] = []
            for qid, note in notes.items():
                if qid not in qmap:
                    print(f'  ! 文法主題 {t["id"]} 找不到題目 {qid}')
                    continue
                qmap[qid]['g'] = note
                qmap[qid]['gt'] = t['id']
                t['qs'].append(qid)
            grammar.append(t)
    bank = {
        'version': datetime.datetime.now().strftime('%Y%m%d%H%M'),
        'subjects': SUBJECTS,
        'papers': papers,
        'passages': passages,
        'reading': reading,
        'grammar': grammar,
        'questions': questions,
    }
    out = ROOT / 'app' / 'data' / 'bank.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'bank.json：{len(questions)} 題，{len(passages)} 篇閱讀，{out.stat().st_size // 1024} KB')
    if missing:
        print(f'  ! 缺解析 {len(missing)} 題：', ', '.join(missing[:20]))


if __name__ == '__main__':
    main()
