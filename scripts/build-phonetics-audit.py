#!/usr/bin/env python3
"""Build audited UK/US IPA from dictionary snapshots; never generate pronunciation.
Usage: python scripts/build-phonetics-audit.py COCA_CHECKOUT LIVE_CACHE OLD_PHONETICS_JS
The COCA repository's `headword` is the BNC lemma, not the queried word;
its `word` field and filename identify the actual dictionary query.
"""
import json,re,sys,collections
from pathlib import Path
root=Path(__file__).resolve().parent.parent
coca,live,old_path=map(Path,sys.argv[1:4])
def read_js(p):
 s=p.read_text();return json.JSONDecoder().raw_decode(s[s.index('{'):])[0]
def clean(s):
 s=s.replace('\\u200b','').replace('\\u200c','').replace('\\u200d','')
 s=re.sub('[\u200b\u200c\u200d\ufeff]','',s)
 return s.strip().replace('g','ɡ').replace("'",'ˈ').replace(':','ː')
words=read_js(root/'sync-test/translations-reviewed.js')
old=read_js(old_path)
overrides=json.loads((root/'scripts/phonetics-overrides.json').read_text())
data={};rows=[];counts=collections.Counter()
for word in words:
 value=None;source=None
 p=coca/'data'/(word+'.json')
 if p.exists():
  d=json.loads(p.read_text());assert d['word'].lower()==word
  if d.get('ukPhone') and d.get('usPhone'):
   value={'uk':d['ukPhone'],'us':d['usPhone']};source='youdao-snapshot'
 p=live/(word+'.json')
 if p.exists():
  d=json.loads(p.read_text())
  for e in d['entries']:
   if e['head'].lower()==word and e['uk'] and e['us']:
    value={'uk':e['uk'],'us':e['us']};source='youdao-live';break
 if word in overrides:
  o=overrides[word]
  value={k:v for k,v in o.items() if k in ['uk','us','variants']}
  if 'variants' in value:
   value.update({k:value['variants'][0][k] for k in ['uk','us']})
  source=o['source']
 assert value, f'No sourced pronunciation: {word}'
 for e in [value]+value.get('variants',[]):
  for accent in ['uk','us']:
   e[accent]=clean(e[accent]);assert e[accent],(word,accent)
   assert not re.search('[\u4e00-\u9fff0-9<>\\\\]',e[accent]),(word,e)
   assert e[accent].count('(')==e[accent].count(')'),(word,e)
   assert all(v.count('ˈ')<=1 for v in e[accent].split(';')),(word,e)
   assert not (accent=='us' and 'əʊ' in e[accent]),(word,e)
 data[word]=value;counts[source]+=1
 rows.append({'word':word,'previous':old[word],'current':value,'source':source,'changed_from_previous':old[word]!=value['us'],**({'note':overrides[word]['reason']} if word in overrides else {})})
assert len(data)==len(words)==3991
summary={'total':len(data),'uk_complete':len(data),'us_complete':len(data),'missing':0,'changed_from_previous_us':sum(r['changed_from_previous'] for r in rows),'with_pos_variants':sum('variants' in v for v in data.values()),'manual_overrides':len(overrides),'sources':dict(counts)}
(root/'sync-test/phonetics.js').write_text('// Dictionary IPA audit 2026-09-26. Sources and limitations: ../audits/phonetics-20260926.json\nwindow.CET6_PHONETICS='+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n')
report={'date':'2026-09-26','method':'全量词典数据比对，异常条目在线复核；并非逐词人工听辨。英美音及合法变体差异不自动计为错误。','limitations':'普通词条列词典常用读音，不穷尽所有口音或义项。浏览器合成语音不由 IPA 数据驱动，多音词的音频选择仍依赖设备。','snapshot':{'repo':'https://github.com/changhongzi/BNC_COCA_EN2CN','commit':'a8f349283ebed9a13e826a84bb4fb7b6c4bff76f','upstream':'https://dict.youdao.com','cross_check_repo':'https://github.com/kajweb/dict','cross_check_commit':'3992bcb94c800a2fd38a9fd6ff95b2353e755363'},'summary':summary,'entries':rows}
(root/'audits/phonetics-20260926.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
