"""Embed MIT-licensed upstream canvas SVG paths for offline and standalone PNG export."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
index=root/'index.html'
s=index.read_text(encoding='utf8')
icons=['chest','castle','swords','wood','mercury','ore','sulfur','crystal','gems','gold']
parts=[]
for name in icons:
    src=(root/'public/h3-icons'/f'{name}.svg').read_text(encoding='utf8')
    view=re.search(r'viewBox="([^"]+)"',src).group(1)
    body=re.search(r'<svg[^>]*>(.*)</svg>',src,re.DOTALL).group(1)
    body=body.replace('fill="#fff"','fill="currentColor"')
    parts.append(f'<symbol id="h3-{name}" viewBox="{view}">{body}</symbol>')
# The native app draws town and computer glyphs if game art was not extracted.
parts+=['<symbol id="h3-town" viewBox="0 0 64 64"><path fill="currentColor" d="M7 29 32 7l25 22v27H7V29Zm10 3v16h9V32h-9Zm21 0v16h9V32h-9ZM26 56V39h12v17H26Z"/></symbol>',
'<symbol id="h3-computer" viewBox="0 0 64 64"><path fill="currentColor" d="M9 7h46v37H9V7Zm5 5v27h36V12H14Zm15 32h6v7h10v6H19v-6h10v-7Z"/></symbol>',
'<symbol id="h3-ground" viewBox="0 0 64 64"><path fill="currentColor" d="M4 39 20 12l13 21 10-13 17 25H4v-6Zm3 10h50v7H7v-7Z"/></symbol>',
'<symbol id="h3-airship" viewBox="0 0 64 64"><path fill="currentColor" d="M7 24C7 10 57 10 57 24S7 38 7 24Zm11 18h29l-7 9H25l-7-9ZM29 37h7v11h-7V37Z"/></symbol>',
'<symbol id="h3-underground" viewBox="0 0 64 64"><path fill="currentColor" d="M5 14h54v7H5v-7Zm0 12 10 12 11-12 10 16 12-16 11 12v19H5V26Z"/></symbol>']
begin='    <!-- BEGIN H3 SVG ICONS -->'
end='    <!-- END H3 SVG ICONS -->'
block=begin+'\n'+'\n'.join('    '+x for x in parts)+'\n'+end
if begin in s and end in s:
    start=s.index(begin)
    stop=s.index(end,start)+len(end)
    s=s[:start]+block+s[stop:]
else:
    first=s.index('    <symbol id="h3-chest"') if '    <symbol id="h3-chest"' in s else -1
    tail=s.index('    <symbol id="i-menu"')
    s=s[:first if first>=0 else tail]+block+'\n'+s[tail:]
index.write_text(s,encoding='utf8')
index.write_text(s,encoding='utf8')
