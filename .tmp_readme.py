import re

with open('README.md', 'r', encoding='utf-8') as f:
    text = f.read()

# Find the Repository Layout section
pat = re.compile(r'## \\&tworhead; Repository Layout\n```.*?\n(.*?)```', re.DOTALL)
m = pat.search(text)
if m:
    block = m.group(1)
    print('MATCH')
    print(repr(block[:300]))
else:
    print('NO MATCH')
    # Try to find the section header
    if 'Repository Layout' in text:
        idx = text.index('Repository Layout')
        print('Header found at', idx)
        print(repr(text[idx:idx+300]))
