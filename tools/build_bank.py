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
    bank = {
        'version': datetime.datetime.now().strftime('%Y%m%d%H%M'),
        'subjects': SUBJECTS,
        'papers': papers,
        'passages': passages,
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
