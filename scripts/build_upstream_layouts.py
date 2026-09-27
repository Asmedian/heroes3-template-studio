#!/usr/bin/env python3
"""Regenerate built-in layouts from the unmodified upstream headless algorithm.

Only placement is derived here; no template bytes are modified.
"""
import json
import math
import sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT.parent / 'upstream' / 'heroes3-template-util-main' / 'src'
if not UPSTREAM.exists():
    raise SystemExit('Provide the sokie/heroes3-template-util source beside the project to regenerate layouts.')
sys.path.insert(0, str(UPSTREAM))
from h3tc.parsers.sod import SodParser
from h3tc.editor.canvas.layout import force_directed_layout

# Constrain unused disconnected components to the same viewport as the actual graph.
def pack_components(template_map, coords):
    adj = {z.id: set() for z in template_map.zones}
    for conn in template_map.connections:
        if conn.zone1 in adj and conn.zone2 in adj and conn.zone1 != conn.zone2:
            adj[conn.zone1].add(conn.zone2)
            adj[conn.zone2].add(conn.zone1)
    unseen = set(adj)
    groups = []
    while unseen:
        stack = [min(unseen, key=lambda item: (not item.lstrip('-').isdigit(), int(item) if item.lstrip('-').isdigit() else item))]
        unseen.remove(stack[0])
        found=[]
        while stack:
            node=stack.pop()
            found.append(node)
            for other in sorted(adj[node]):
                if other in unseen:
                    unseen.remove(other)
                    stack.append(other)
        groups.append(found)
    groups.sort(key=lambda g:(-len(g),g[0]))
    if len(groups) < 2:
        return coords
    main=groups[0]
    x_right=max(coords[z][0]+228 for z in main)
    y_min=min(coords[z][1] for z in main)
    y_max=max(coords[z][1]+220 for z in main)
    # Disconnected subgraphs are stacked outside the main graph, not placed miles away.
    extra_y=y_min
    for group in groups[1:]:
        gx_min=min(coords[z][0] for z in group)
        gy_min=min(coords[z][1] for z in group)
        gw=max(coords[z][0]+228 for z in group)-gx_min
        gh=max(coords[z][1]+220 for z in group)-gy_min
        target_y=extra_y if extra_y+gh <= y_max else y_min
        for z in group:
            x,y=coords[z]
            coords[z]=(x+(x_right+310-gx_min),y+(target_y-gy_min))
        extra_y=target_y+gh+250
        x_right=max(x_right, x_right+310+gw)
    return coords

catalog=json.loads((ROOT/'samples/catalog.json').read_text(encoding='utf-8'))
parser=SodParser()
result={'source':'sokie/heroes3-template-util/src/h3tc/editor/canvas/layout.py','scale':0.82,'templates':{}}
for index,item in enumerate(catalog['templates'],1):
    pack=parser.parse(ROOT/'samples'/item['file'])
    maps=[]
    for map_index,m in enumerate(pack.maps):
        if not m.zones:
            maps.append({'name':m.name,'ids':[],'positions':{}})
            continue
        upstream=force_directed_layout(m,sizes={z.id:(228,220) for z in m.zones},gap=80,iterations=95)
        # The desktop editor uses approximately twice as much whitespace as browser cards need.
        upstream=pack_components(m,upstream)
        x0=min(x for x,y in upstream.values())
        y0=min(y for x,y in upstream.values())
        positions={z.id:{'x':round((upstream[z.id][0]-x0)*.82+120),'y':round((upstream[z.id][1]-y0)*.82+120)} for z in m.zones}
        maps.append({'name':m.name,'ids':[z.id for z in m.zones],'connections':len(m.connections),'positions':positions})
    result['templates'][item['id']]=maps
    if index%10==0:print(f'Generated {index}/{len(catalog["templates"])} packages.',flush=True)
# The upstream disconnected-component prior leaves this particular legacy pack
# unnecessarily stretched; preserve the compact reference geometry supplied by
# the user, while keeping every edge and zone topology unchanged.
reference=result['templates']['51'][0]
if reference['name']=='mirror Skirmish (sc2tv tourney edition)' and reference['ids']==['1','2','3','4','5','6','7']:
    reference['positions']={'1':{'x':120,'y':1540},'2':{'x':430,'y':1190},'3':{'x':470,'y':500},'4':{'x':1170,'y':350},'5':{'x':1130,'y':1060},'6':{'x':1650,'y':100},'7':{'x':1630,'y':1530}}
(ROOT/'samples/upstream-layouts.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
print(f'Generated {sum(len(v) for v in result["templates"].values())} upstream layouts',flush=True)
