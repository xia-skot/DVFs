const fs = require('fs');

let content = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf8');

// Fix sub2 and sub3
const pattern2 = /\{\/\* Wave Head markers \(Red Dots\) \*\/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h: any, i: number\) => \{\s*const displayIdx = h\.index;\s*const curveKey = (.*?);\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', curveKey\);\s*const timeVal = displayIdx \/ samplingFreq;\s*return \(\s*<ReferenceDot key=\{`head-sub(2|3)-\$\{i\}`\} x=\{timeVal\} y=\{displayVal\} r=\{4\} fill="#ef4444" stroke="#fff" strokeWidth=\{1\.5\} \/>\s*\);\s*\}\)\}/g;

content = content.replace(pattern2, (match, curveKey, subId) => {
    return `{/* Wave Head markers */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const displayIdx = h.index;
                                    const curveKey = ${curveKey};
                                    const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', curveKey);
                                    const timeVal = displayIdx / samplingFreq;
                                    const isInit = detectionType === 'initial';
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                    const dotSize = settings.faultDetection.sequenceHeadSize;
                                    return (
                                      <React.Fragment key={\`head-sub${subId}-frag-\${i}\`}>
                                        <ReferenceDot key={\`head-sub${subId}-\${i}\`} x={timeVal} y={displayVal} r={isInit ? 5 : dotSize} fill={isInit ? startColor : peakColor} stroke="#fff" strokeWidth={1.5} />
                                        {!isInit && h.startIdx !== undefined && (
                                          <ReferenceDot key={\`head-sub${subId}-start-\${i}\`} x={h.startIdx / samplingFreq} y={getCalibrationY(activePoint, h.startIdx, 'differential', curveKey)} r={dotSize} fill={startColor} stroke="#fff" strokeWidth={1.5} />
                                        )}
                                      </React.Fragment>
                                    );
                                  })}`;
});

// Fix sub1
const pattern1 = /\{\/\* Wave Head markers \(Red Dots\) \*\/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h, i\) => \{\s*const displayIdx = h\.index;\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', 'value'\);\s*const timeVal = displayIdx \/ samplingFreq;\s*return \(\s*<ReferenceDot \s*key=\{`head-sub1-\$\{i\}`\} \s*x=\{timeVal\} \s*y=\{displayVal\} \s*r=\{4\}\s*fill="#ef4444" \s*stroke="#fff" \s*strokeWidth=\{1\.5\} \s*\/>\s*\);\s*\}\)\}/g;

content = content.replace(pattern1, () => {
    return `{/* Wave Head markers */}
                                    {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                      const displayIdx = h.index;
                                      const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', 'value');
                                      const timeVal = displayIdx / samplingFreq;
                                      const isInit = detectionType === 'initial';
                                      const startColor = settings.faultDetection.sequenceHeadStartColor;
                                      const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                      const dotSize = settings.faultDetection.sequenceHeadSize;
                                      return (
                                        <React.Fragment key={\`head-sub1-frag-\${i}\`}>
                                          <ReferenceDot key={\`head-sub1-\${i}\`} x={timeVal} y={displayVal} r={isInit ? 5 : dotSize} fill={isInit ? startColor : peakColor} stroke="#fff" strokeWidth={1.5} />
                                          {!isInit && h.startIdx !== undefined && (
                                            <ReferenceDot key={\`head-sub1-start-\${i}\`} x={h.startIdx / samplingFreq} y={getCalibrationY(activePoint, h.startIdx, 'differential', 'value')} r={dotSize} fill={startColor} stroke="#fff" strokeWidth={1.5} />
                                          )}
                                        </React.Fragment>
                                      );
                                    })}`;
});

// Initial calibration view (lines ~4600)
const patternInit = /const layout = getLabelLayout\(labelPos, 5\);\s*return \(\s*<ReferenceDot \s*key=\{`head-init-\$\{i\}`\} \s*x=\{timeVal\} \s*y=\{displayVal\} \s*shape=\{\(props: any\) => \{\s*const \{ cx, cy \} = props;\s*return \(\s*<g>\s*<circle \s*cx=\{cx\} \s*cy=\{cy\} \s*r=\{5\} \s*fill="#ef4444"/g;

content = content.replace(patternInit, () => {
    return `const layout = getLabelLayout(labelPos, 5);
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    return (
                                      <ReferenceDot 
                                        key={\`head-init-\${i}\`} 
                                        x={timeVal} 
                                        y={displayVal} 
                                        shape={(props: any) => {
                                          const { cx, cy } = props;
                                          return (
                                            <g>
                                              <circle 
                                                cx={cx} 
                                                cy={cy} 
                                                r={5} 
                                                fill={startColor}`;
});

// Change stroke color in the label box too
const patternInit2 = /<rect x=\{cx \+ layout\.rx\} y=\{cy \+ layout\.ry\} width=\{layout\.width\} height=\{layout\.height\} fill="white" stroke="#ef4444" strokeWidth=\{1\} rx=\{4\} \/>/g;
content = content.replace(patternInit2, '<rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={startColor} strokeWidth={1} rx={4} />');

fs.writeFileSync('src/components/WaveformAnalyzer.tsx', content);
