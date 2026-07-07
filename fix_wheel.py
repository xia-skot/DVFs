import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

start_pattern = "  const handleWheel = (e: React.WheelEvent<HTMLDivElement> | WheelEvent) => {"
end_pattern = "    e.preventDefault();\n  };"

idx1 = content.find(start_pattern)
idx2 = content.find(end_pattern, idx1)

if idx1 != -1 and idx2 != -1:
    idx2 += len(end_pattern)
    
    new_block = """  const handleWheel = (e: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
    const rect = getChartRect();
    if (!rect) return;
    const domains = getActualDomains();
    
    const clientX = 'clientX' in e ? e.clientX : (e as any).clientX;
    const clientY = 'clientY' in e ? e.clientY : (e as any).clientY;
    
    const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
    let targetSubplotKey: string | null = null;
    let targetRect = rect;
    let targetDomains = domains;
    
    if (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) {
      const keys = ['value', 'diff1', 'diff2'];
      for (let i = 0; i < 3; i++) {
        const subDivRect = subplotElements[i].getBoundingClientRect();
        const subRect = getSubplotRect(i, subDivRect);
        if (clientY >= subRect.top && clientY <= subRect.top + subRect.height) {
          targetSubplotKey = keys[i];
          targetRect = subRect;
          targetDomains = { x: domains.x, y: getSubplotYDomain(keys[i]) as [number, number] };
          break;
        }
      }
    }
    
    const xRange = targetDomains.x[1] - targetDomains.x[0];
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    
    const mouseData = pxToData(clientX, clientY, targetDomains, targetRect);
    const xRatio = (mouseData.x - targetDomains.x[0]) / xRange;
    
    const newXRange = xRange * zoomFactor;
    let newXMin = mouseData.x - newXRange * xRatio;
    let newXMax = mouseData.x + newXRange * (1 - xRatio);
    
    const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
    if (newXMin < 0) { newXMax = Math.min(maxTime, newXMax - newXMin); newXMin = 0; }
    if (newXMax > maxTime) { newXMin = Math.max(0, newXMin - (newXMax - maxTime)); newXMax = maxTime; }
    
    setXDomain([newXMin, newXMax]);
    
    const yRange = targetDomains.y[1] - targetDomains.y[0];
    const yRatio = (mouseData.y - targetDomains.y[0]) / yRange;
    const newYRange = yRange * zoomFactor;
    let newYMin = mouseData.y - newYRange * yRatio;
    let newYMax = mouseData.y + newYRange * (1 - yRatio);
    
    if (targetSubplotKey) {
      setDiffYDomains(prev => ({ ...prev, [targetSubplotKey!]: [newYMin, newYMax] }));
    } else {
      setYDomain([newYMin, newYMax]);
    }
    
    e.preventDefault();
  };"""
    
    content = content[:idx1] + new_block + content[idx2:]
    
    with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
        f.write(content)
    print("Wheel zoom updated")
else:
    print("Pattern not found")
