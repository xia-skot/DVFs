import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

start_pattern = "    const r_offset = r > 0 ? r * 0.7071 : 0;"
end_pattern = "                value: displayVal,"

idx1 = content.find(start_pattern)
idx2 = content.find(end_pattern, idx1)

if idx1 != -1 and idx2 != -1:
    idx2 += len(end_pattern)
    
    new_middle = """    const r_offset = r > 0 ? r * 0.7071 : 0;
    let rx = r_offset;
    let ry = -height - r_offset;
    
    if (pos === 'top-left') {
      rx = -width - r_offset;
      ry = -height - r_offset;
    } else if (pos === 'bottom-left') {
      rx = -width - r_offset;
      ry = r_offset;
    } else if (pos === 'bottom-right') {
      rx = r_offset;
      ry = r_offset;
    }
    
    return { rx, ry, width, height };
  };

  const resetZoom = () => {
    setXDomain(['dataMin', 'dataMax']);
    setYDomain(['auto', 'auto']);
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: '【波形操作】已恢复自适应缩放视图！双相/三相波形曲线已全部重置并恢复自适应最大可视区间。' } 
    }));
  };

  const toggleAnalysisLine = (key: string) => {
    setAnalysisHiddenLines(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = getChartRect();
    if (!rect) return;
    const domains = getActualDomains();

    if (manualCalibratingPointId) {
      if (e.button === 0) { // Left click in manual calibration mode
        // 1. Check if clicking the existing calibration red dot
        const calibratingPoint = activeCondition?.points.find(p => p.id === manualCalibratingPointId);
        if (calibratingPoint?.calibration?.heads) {
          for (const h of calibratingPoint.calibration.heads) {
            const displayVal = getCalibrationY(calibratingPoint, h.index, singleWaveType);
            const timeVal = h.index / samplingFreq;
            
            let curveKey = 'value';
            let color = '#ef4444';
            if (singleWaveType === 'original') {
              if (!analysisHiddenLines.includes('A')) { curveKey = 'A'; color = '#facc15'; }
              else if (!analysisHiddenLines.includes('B')) { curveKey = 'B'; color = '#22c55e'; }
              else if (!analysisHiddenLines.includes('C')) { curveKey = 'C'; color = '#ef4444'; }
            } else if (singleWaveType === 'karenbauer') {
              if (!analysisHiddenLines.includes('alpha')) { curveKey = 'alpha'; color = '#3b82f6'; }
              else if (!analysisHiddenLines.includes('beta')) { curveKey = 'beta'; color = '#a855f7'; }
              else if (!analysisHiddenLines.includes('zero')) { curveKey = 'zero'; color = '#94a3b8'; }
            }

            const { ptX_px, ptY_px } = getPixelCoordinates(timeVal, displayVal, curveKey, rect, domains);
            
            const dotDist = Math.hypot(e.clientX - ptX_px, e.clientY - ptY_px);
            if (dotDist <= 15) {
              setActiveCalibratingPoint({
                time: timeVal,
                value: displayVal,"""
              
    content = content[:idx1] + new_middle + content[idx2:]
    with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
        f.write(content)
    print("Fixed.")
else:
    print("Pattern not found")

