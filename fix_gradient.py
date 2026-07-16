with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

# Fix 1: Change minVal to sVal in caliShadingRange
old_range_assignment = "pt[`caliShadingRange_${range.idx}`] = [range.minVal, pt.value];"
new_range_assignment = "pt[`caliShadingRange_${range.idx}`] = [range.sVal, pt.value];"
content = content.replace(old_range_assignment, new_range_assignment)

# Fix 2: Remove the fallback color block when unchecked (render nothing instead)
# For Subplot 1 (differential)
old_area_sub1 = """{cfg.isValue && activePoint?.calibration?.heads && activePoint.calibration.heads.map((h: any, i: number) => (
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
                                      ))}"""
new_area_sub1 = """{cfg.isValue && settings.faultDetection.showSequenceGradient && activePoint?.calibration?.heads && activePoint.calibration.heads.map((h: any, i: number) => (
                                        <Area
                                          key={`area-shading-diff-${i}`}
                                          type="linear"
                                          dataKey={`caliShadingRange_${i}`}
                                          stroke="none"
                                          fill={`url(#caliShadingGradSub1_${i})`}
                                          isAnimationActive={false}
                                          activeDot={false}
                                          connectNulls={false}
                                        />
                                      ))}"""
content = content.replace(old_area_sub1, new_area_sub1)

# For Main plot (calibration)
old_area_main = """{singleWaveType === 'calibration' && detectionType !== 'initial' && activePoint?.calibration?.heads && activePoint.calibration.heads.map((h: any, i: number) => (
                              <Area
                                key={`area-shading-optimized-${i}`}
                                type="monotone"
                                dataKey={`caliShadingRange_${i}`}
                                stroke="none"
                                fill={settings.faultDetection.showSequenceGradient ? `url(#caliShadingGrad_${i})` : "rgba(0, 83, 135, 0.5)"}
                                isAnimationActive={false}
                                activeDot={false}
                                connectNulls={false}
                              />
                            ))}"""
new_area_main = """{singleWaveType === 'calibration' && detectionType !== 'initial' && settings.faultDetection.showSequenceGradient && activePoint?.calibration?.heads && activePoint.calibration.heads.map((h: any, i: number) => (
                              <Area
                                key={`area-shading-optimized-${i}`}
                                type="monotone"
                                dataKey={`caliShadingRange_${i}`}
                                stroke="none"
                                fill={`url(#caliShadingGrad_${i})`}
                                isAnimationActive={false}
                                activeDot={false}
                                connectNulls={false}
                              />
                            ))}"""
content = content.replace(old_area_main, new_area_main)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed gradient range and unchecked state")
