const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

const replacement = `                              label={{ value: '时间 (s)', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
                            />
                            <YAxis 
                              width={25}
                              stroke="#94a3b8" 
                              tick={{fontSize: 9, fill: '#64748b'}}
                              tickFormatter={(val) => Math.round(val).toString()}
                              domain={actualDomains.y}
                              allowDataOverflow
                            />
                            {singleWaveType === 'original' && (
                              <>
                                {!analysisHiddenLines.includes('A') && (
                                  <Line key={\`A-\${animationKey}\`} name="A相" type="monotone" dataKey="A" stroke={settings.faultDetection.curveColors.phaseA} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('B') && (
                                  <Line key={\`B-\${animationKey}\`} name="B相" type="monotone" dataKey="B" stroke={settings.faultDetection.curveColors.phaseB} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('C') && (
                                  <Line key={\`C-\${animationKey}\`} name="C相" type="monotone" dataKey="C" stroke={settings.faultDetection.curveColors.phaseC} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                              </>
                            )}
                            {singleWaveType === 'karenbauer' && (
                              <>
                                {!analysisHiddenLines.includes('alpha') && (
                                  <Line key={\`alpha-\${animationKey}\`} name="α模" type="monotone" dataKey="alpha" stroke={settings.faultDetection.curveColors.alpha} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('beta') && (
                                  <Line key={\`beta-\${animationKey}\`} name="β模" type="monotone" dataKey="beta" stroke={settings.faultDetection.curveColors.beta} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('zero') && (`;

lines[5424] = replacement;
fs.writeFileSync('src/components/WaveformAnalyzer.tsx', lines.join('\n'));
