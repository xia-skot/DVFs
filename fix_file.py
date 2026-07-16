import re

with open('src/components/WaveformAnalyzer.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

bad_start = """                                                <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                  <rect x={cx + layout.rx} y={cy +                                  {/* Initial Extrema (T_head) Markers - Red Dots */}"""

bad_end = """                                     return (
                                       <ReferenceDot key={`head-sub2-${i}`} x={timeVal} y={displayVal} r={5} fill={startColor} stroke="#fff" strokeWidth={1.5} />
                                     );
                                   })}"""

good_content = """                                                <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                  <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : (ann.color || "#3b82f6")} strokeWidth={0.8} rx={4} />
                                                  <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                  <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                                </g>
                                              </g>
                                            );
                                          }}
                                        />
                                      );
                                    })}

                                    {/* Render hover dot for Subplot 1 */}
                                    {hoverDataPoint && hoverDataPoint.curveKey === 'value' && !draggingAnnotationId && !isCalibratingDrag && (
                                      <ReferenceDot
                                        key="hover-dot-sub1"
                                        x={hoverDataPoint.time}
                                        y={hoverDataPoint.value}
                                        shape={(props: any) => {
                                          const { cx, cy } = props;
                                          const layout = getLabelLayout('top-right', 4);
                                          return (
                                            <g>
                                              <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || "#3b82f6"} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                              <g style={{ pointerEvents: 'none' }}>
                                                <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || "#3b82f6"} strokeWidth={0.8} rx={4} />
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
                            
                            {/* 子图2: 一阶差分 (initial mode) 或 二阶差分 (other modes) */}
                            <div className="flex-1 min-h-0 relative">
                              <div className="absolute right-4 top-1 text-[10px] font-semibold text-orange-600 bg-orange-50/90 border border-orange-100 px-1.5 py-0.5 rounded z-10">
                                 {detectionType === 'initial' ? '一阶差分' : '二阶差分'}
                               </div>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart 
                                  syncId="diffSync" 
                                  data={focusData} 
                                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }} 
                                  onMouseDown={handleChartMouseDown}
                                >
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                  <XAxis dataKey="time" type="number" domain={actualDomains.x} allowDataOverflow hide stroke="#94a3b8" />
                                  <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={getSubplotYDomain(detectionType === 'initial' ? 'diff1' : 'diff2')} allowDataOverflow tickFormatter={(val) => Math.round(val).toString()} />
                                  {!(detectionType === 'initial' ? analysisHiddenLines.includes('diff1') : analysisHiddenLines.includes('diff2')) && (
                                    <Line key={`sub2-line-${animationKey}`} name={detectionType === 'initial' ? '一阶差分' : '二阶差分'} type="linear" dataKey={detectionType === 'initial' ? 'diff1' : 'diff2'} stroke={detectionType === 'initial' ? '#f97316' : '#ef4444'} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                                  )}

                                  {/* Vertical Reference Lines */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const displayIdx = h.index;
                                    const xVal = displayIdx / samplingFreq;
                                    return (
                                      <ReferenceLine key={`refline-sub2-${i}`} x={xVal} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1} />
                                    );
                                  })}

                                  {/* Initial Extrema (T_head) Markers - Red Dots */}
                                  {detectionType === 'sequence' && activePoint?.calibration?.debugInfo?.T_head?.map((idx: number, i: number) => {
                                    const xVal = idx / samplingFreq;
                                    const yVal = getCalibrationY(activePoint, idx, 'differential', 'diff2');
                                    return (
                                      <ReferenceDot 
                                        key={`extrema-sub2-${i}`} 
                                        x={xVal} 
                                        y={yVal} 
                                        r={3.5} 
                                        fill="#ef4444" 
                                        stroke="#fff" 
                                        strokeWidth={1} 
                                        isAnimationActive={false}
                                      />
                                    );
                                  })}

                                  {/* Valid Pairs Markers (Black Dots) for Sequence Mode */}
                                  {detectionType === 'sequence' && activePoint?.calibration?.debugInfo?.validHeads?.map((h: any, i: number) => {
                                    const curveKey = 'diff2';
                                    return (
                                      <React.Fragment key={`valid-pair-${i}`}>
                                        {h.point1 !== undefined && (
                                          <ReferenceDot x={h.point1 / samplingFreq} y={getCalibrationY(activePoint, h.point1, 'differential', curveKey)} r={4} fill="#000" stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                                        )}
                                        {h.point2 !== undefined && (
                                          <ReferenceDot x={h.point2 / samplingFreq} y={getCalibrationY(activePoint, h.point2, 'differential', curveKey)} r={4} fill="#000" stroke="#fff" strokeWidth={1} isAnimationActive={false} />
                                        )}
                                      </React.Fragment>
                                    );
                                  })}

                                   {/* Wave Head markers */}
                                   {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                     const displayIdx = h.index;
                                     const curveKey = detectionType === 'initial' ? 'diff1' : 'diff2';
                                     const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', curveKey);
                                     const timeVal = displayIdx / samplingFreq;
                                     const isInit = detectionType === 'initial';
                                     const startColor = settings.faultDetection.sequenceHeadStartColor;
                                     const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                       
                                     if (!isInit) {
                                       return null; // Skip main dots on subplot 2 for sequence mode, as black dots handle it
                                     }

                                     return (
                                       <ReferenceDot key={`head-sub2-${i}`} x={timeVal} y={displayVal} r={5} fill={startColor} stroke="#fff" strokeWidth={1.5} />
                                     );
                                   })}"""

start_idx = content.find(bad_start)
if start_idx == -1:
    print("Could not find start index")
    exit(1)

end_idx = content.find(bad_end, start_idx)
if end_idx == -1:
    print("Could not find end index")
    exit(1)

end_idx += len(bad_end)

new_content = content[:start_idx] + good_content + content[end_idx:]

with open('src/components/WaveformAnalyzer.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Fixed!")
