import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

# Find the block from `<div className="flex flex-col h-full w-full gap-2 p-1 pt-14">` to the matching `</div>)`
start_idx = content.find('<div className="flex flex-col h-full w-full gap-2 p-1 pt-14">')
end_idx = content.find('</div>)', start_idx) + 7

print(f"Found from {start_idx} to {end_idx}")

new_content = """<div className="flex flex-col h-full w-full gap-2 p-1 pt-14">
                              {[
                                { key: 'value', label: '线模行波', color: '#3b82f6', isValue: true },
                                { key: 'diff1', label: '一阶差分', color: '#f97316' },
                                { key: 'diff2', label: '二阶差分', color: '#ef4444' },
                                { key: 'diff3', label: '三阶差分', color: '#8b5cf6' }
                              ].map((cfg, idx) => (
                                <div key={cfg.key} className="flex-1 min-h-0 relative">
                                  <div className="absolute right-4 top-1 text-[10px] font-semibold bg-white/80 border px-1.5 py-0.5 rounded z-10" style={{ color: cfg.color, borderColor: `${cfg.color}33` }}>
                                    {cfg.label}
                                  </div>
                                  <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart syncId="diffSync" data={focusData} margin={{ top: 10, right: 30, left: 20, bottom: idx === 3 ? 20 : 5 }} onMouseDown={handleChartMouseDown}>
                                      {cfg.isValue && (
                                        <defs>
                                          {activePoint?.calibration?.heads?.map((h: any, i: number) => (
                                            <linearGradient key={`grad-${i}`} id={`caliShadingGradSub1_${i}`} x1="0" y1="0" x2="1" y2="0">
                                              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                                              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                            </linearGradient>
                                          ))}
                                        </defs>
                                      )}
                                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                      <XAxis 
                                        dataKey="time" 
                                        type="number" 
                                        domain={actualDomains.x} 
                                        allowDataOverflow 
                                        hide={idx !== 3}
                                        stroke="#94a3b8" 
                                        tickFormatter={(val) => val.toFixed(timePrecision)} 
                                        tick={{fontSize: 9, fill: '#64748b'}}
                                        label={idx === 3 ? { value: '时间 (s)', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' } : undefined}
                                      />
                                      <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={getSubplotYDomain(cfg.key)} allowDataOverflow tickFormatter={(val) => Math.round(val).toString()} />
                                      
                                      {cfg.isValue && activePoint?.calibration?.heads && activePoint.calibration.heads.map((h: any, i: number) => (
                                        <Area
                                          key={`area-shading-diff-${i}`}
                                          type="linear"
                                          dataKey={`caliShadingRange_${i}`}
                                          stroke="none"
                                          fill={settings.faultDetection.showSequenceGradient ? `url(#caliShadingGradSub1_${i})` : "rgba(14, 165, 233, 0.4)"}
                                          isAnimationActive={false}
                                          activeDot={false}
                                          connectNulls={false}
                                        />
                                      ))}

                                      {!analysisHiddenLines.includes(cfg.key) && (
                                        <Line key={`${cfg.key}-${animationKey}`} name={cfg.label} type="linear" dataKey={cfg.key} stroke={cfg.color} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                                      )}

                                      {/* Vertical Reference Lines */}
                                      {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                        const displayIdx = h.index;
                                        const xVal = displayIdx / samplingFreq;
                                        return (
                                          <ReferenceLine
                                            key={`refline-${cfg.key}-${i}`}
                                            x={xVal}
                                            stroke="#3b82f6"
                                            strokeDasharray="3 3"
                                            strokeWidth={1}
                                            label={cfg.isValue ? { value: `波头 ${i + 1}`, fill: '#3b82f6', fontSize: 9, position: 'top' } : undefined}
                                          />
                                        );
                                      })}

                                      {/* Wave Head markers */}
                                      {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                        const displayIdx = h.index;
                                        const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', cfg.key);
                                        const timeVal = displayIdx / samplingFreq;
                                        const startColor = settings.faultDetection.sequenceHeadStartColor;
                                        const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                        const dotSize = settings.faultDetection.sequenceHeadSize;
                                        
                                        if (!cfg.isValue) {
                                          return (
                                            <ReferenceDot key={`head-${cfg.key}-${i}`} x={timeVal} y={displayVal} r={dotSize} fill={peakColor} stroke="#fff" strokeWidth={1.5} />
                                          );
                                        }
                                        return [
                                          <ReferenceDot key={`head-sub1-${i}`} x={timeVal} y={displayVal} r={dotSize} fill={peakColor} stroke="#fff" strokeWidth={1.5} />,
                                          h.startIdx !== undefined && (
                                            <ReferenceDot key={`head-sub1-start-${i}`} x={h.startIdx / samplingFreq} y={getCalibrationY(activePoint, h.startIdx, 'differential', 'value')} r={dotSize} fill={startColor} stroke="#fff" strokeWidth={1.5} />
                                          )
                                        ];
                                      })}

                                      {/* Render custom annotations */}
                                      {annotations.filter(ann => ann.curveKey === cfg.key).map((ann) => {
                                        const isSelected = selectedAnnotationId === ann.id;
                                        const labelPos = ann.labelPosition || 'top-right';
                                        const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                                        return (
                                          <ReferenceDot
                                            key={`ann-${ann.id}`}
                                            x={ann.time}
                                            y={ann.value}
                                            shape={(props: any) => {
                                              const { cx, cy } = props;
                                              return (
                                                <g>
                                                  <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || cfg.color} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                                  <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                    <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : (ann.color || cfg.color)} strokeWidth={0.8} rx={4} />
                                                    <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                    <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                                  </g>
                                                </g>
                                              );
                                            }}
                                          />
                                        );
                                      })}

                                      {/* Render hover dot */}
                                      {hoverDataPoint && hoverDataPoint.curveKey === cfg.key && !draggingAnnotationId && !isCalibratingDrag && (
                                        <ReferenceDot
                                          key={`hover-dot-${cfg.key}`}
                                          x={hoverDataPoint.time}
                                          y={hoverDataPoint.value}
                                          shape={(props: any) => {
                                            const { cx, cy } = props;
                                            const layout = getLabelLayout('top-right', 4);
                                            return (
                                              <g>
                                                <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || cfg.color} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                                <g style={{ pointerEvents: 'none' }}>
                                                  <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || cfg.color} strokeWidth={0.8} rx={4} />
                                                  <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                                  <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                                </g>
                                              </g>
                                            );
                                          }}
                                        />
                                      )}
                                    </ComposedChart>
                                  </ResponsiveContainer>
                                </div>
                              ))}
                            </div>)"""

final_content = content[:start_idx] + new_content + content[end_idx:]

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(final_content)
print("Updated successfully")
