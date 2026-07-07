import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

def replace_zoom_block(content, start_marker, end_marker):
    idx1 = content.find(start_marker)
    idx2 = content.find(end_marker, idx1)
    if idx1 == -1 or idx2 == -1:
        return content
    idx2 += len(end_marker)
    
    original = content[idx1:idx2]
    new_block = """          const rect = getChartRect();
          if (rect) {
            const domains = getActualDomains();
            
            // Check if we are in differential mode and find which subplot was dragged
            const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
            let targetSubplotKey = null;
            let targetRect = rect;
            let targetDomains = domains;
            
            if (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) {
              const keys = ['value', 'diff1', 'diff2'];
              for (let i = 0; i < 3; i++) {
                const subDivRect = subplotElements[i].getBoundingClientRect();
                const subRect = getSubplotRect(i, subDivRect);
                if (dragStartPos.y >= subRect.top && dragStartPos.y <= subRect.top + subRect.height) {
                  targetSubplotKey = keys[i];
                  targetRect = subRect;
                  targetDomains = { x: domains.x, y: getSubplotYDomain(keys[i]) as [number, number] };
                  break;
                }
              }
            }

            const p1 = pxToData(dragStartPos.x, dragStartPos.y, targetDomains, targetRect);
            const p2 = pxToData(currentMousePos.x, currentMousePos.y, targetDomains, targetRect);
            
            const dx = Math.abs(currentMousePos.x - dragStartPos.x);
            const dy = Math.abs(currentMousePos.y - dragStartPos.y);
            
            const xMin = Math.min(p1.x, p2.x);
            const xMax = Math.max(p1.x, p2.x);
            const yMin = Math.min(p1.y, p2.y);
            const yMax = Math.max(p1.y, p2.y);
            
            if (dx > 5 || dy > 5) {
              if (dx > 10 && dy <= 10) {
                setXDomain([xMin, xMax]);
              } else if (dy > 10 && dx <= 10) {
                if (targetSubplotKey) {
                  setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                } else {
                  setYDomain([yMin, yMax]);
                }
              } else {
                setXDomain([xMin, xMax]);
                if (targetSubplotKey) {
                  setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                } else {
                  setYDomain([yMin, yMax]);
                }
              }
            }
          }"""
    return content[:idx1] + new_block + content[idx2:]

# Replace first drag zoom (around 2989)
start1 = "           const rect = getChartRect();\n           if (rect) {\n             const domains = getActualDomains();\n             const p1 = pxToData(dragStartPos.x, dragStartPos.y, domains, rect);"
end1 = "               setYDomain([yMin, yMax]);\n             }\n           }"
content = replace_zoom_block(content, start1, end1)

# Replace second drag zoom (around 3011)
start2 = "        const rect = getChartRect();\n        if (rect) {\n          const domains = getActualDomains();\n          const p1 = pxToData(dragStartPos.x, dragStartPos.y, domains, rect);"
end2 = "              setYDomain([yMin, yMax]);\n            }\n          }\n        }"
content = replace_zoom_block(content, start2, end2)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)

print("Drag zoom updated")
