import re

with open('src/components/WaveformAnalyzer.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_subplot_heads(curve_key_expression, sub_id):
    pattern = r"\{/\* Wave Head markers \(Red Dots\) \*/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h, i\) => \{\s*const displayIdx = h\.index;\s*const curveKey = ([^;]+);\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', curveKey\);\s*const timeVal = displayIdx / samplingFreq;\s*return \(\s*<ReferenceDot key=\{`head-sub" + sub_id + r"-\$\{i\}`\} x=\{timeVal\} y=\{displayVal\} r=\{4\} fill=\"#ef4444\" stroke=\"#fff\" strokeWidth=\{1\.5\} />\s*\);\s*\}\)\}"
    
    def repl(m):
        curve_key = m.group(1)
        return f"""{{/* Wave Head markers */}}
                                  {{activePoint?.calibration?.heads?.map((h: any, i: number) => {{
                                    const displayIdx = h.index;
                                    const curveKey = {curve_key};
                                    const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', curveKey);
                                    const timeVal = displayIdx / samplingFreq;
                                    const isInit = detectionType === 'initial';
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                    const dotSize = settings.faultDetection.sequenceHeadSize;
                                    return (
                                      <React.Fragment key={`head-sub{sub_id}-frag-${{i}}`}>
                                        <ReferenceDot key={`head-sub{sub_id}-${{i}}`} x={{timeVal}} y={{displayVal}} r={{isInit ? 5 : dotSize}} fill={{isInit ? startColor : peakColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        {{!isInit && h.startIdx !== undefined && (
                                          <ReferenceDot key={`head-sub{sub_id}-start-${{i}}`} x={{h.startIdx / samplingFreq}} y={{getCalibrationY(activePoint, h.startIdx, 'differential', curveKey)}} r={{dotSize}} fill={{startColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        )}}
                                      </React.Fragment>
                                    );
                                  }})}}"""
    return re.sub(pattern, repl, content, count=1)

# Fix sub2
pattern2 = r"\{/\* Wave Head markers \(Red Dots\) \*/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h, i\) => \{\s*const displayIdx = h\.index;\s*const curveKey = (.*?);\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', curveKey\);\s*const timeVal = displayIdx / samplingFreq;\s*return \(\s*<ReferenceDot key=\{`head-sub2-\$\{i\}`\} x=\{timeVal\} y=\{displayVal\} r=\{4\} fill=\"#ef4444\" stroke=\"#fff\" strokeWidth=\{1\.5\} />\s*\);\s*\}\)\}"
def repl2(m):
    curve_key = m.group(1)
    return f"""{{/* Wave Head markers */}}
                                  {{activePoint?.calibration?.heads?.map((h: any, i: number) => {{
                                    const displayIdx = h.index;
                                    const curveKey = {curve_key};
                                    const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', curveKey);
                                    const timeVal = displayIdx / samplingFreq;
                                    const isInit = detectionType === 'initial';
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                    const dotSize = settings.faultDetection.sequenceHeadSize;
                                    return (
                                      <React.Fragment key={`head-sub2-frag-${{i}}`}>
                                        <ReferenceDot key={`head-sub2-${{i}}`} x={{timeVal}} y={{displayVal}} r={{isInit ? 5 : dotSize}} fill={{isInit ? startColor : peakColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        {{!isInit && h.startIdx !== undefined && (
                                          <ReferenceDot key={`head-sub2-start-${{i}}`} x={{h.startIdx / samplingFreq}} y={{getCalibrationY(activePoint, h.startIdx, 'differential', curveKey)}} r={{dotSize}} fill={{startColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        )}}
                                      </React.Fragment>
                                    );
                                  }})}}"""
content = re.sub(pattern2, repl2, content)

# Fix sub3
pattern3 = r"\{/\* Wave Head markers \(Red Dots\) \*/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h, i\) => \{\s*const displayIdx = h\.index;\s*const curveKey = (.*?);\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', curveKey\);\s*const timeVal = displayIdx / samplingFreq;\s*return \(\s*<ReferenceDot key=\{`head-sub3-\$\{i\}`\} x=\{timeVal\} y=\{displayVal\} r=\{4\} fill=\"#ef4444\" stroke=\"#fff\" strokeWidth=\{1\.5\} />\s*\);\s*\}\)\}"
def repl3(m):
    curve_key = m.group(1)
    return f"""{{/* Wave Head markers */}}
                                  {{activePoint?.calibration?.heads?.map((h: any, i: number) => {{
                                    const displayIdx = h.index;
                                    const curveKey = {curve_key};
                                    const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', curveKey);
                                    const timeVal = displayIdx / samplingFreq;
                                    const isInit = detectionType === 'initial';
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                    const dotSize = settings.faultDetection.sequenceHeadSize;
                                    return (
                                      <React.Fragment key={`head-sub3-frag-${{i}}`}>
                                        <ReferenceDot key={`head-sub3-${{i}}`} x={{timeVal}} y={{displayVal}} r={{isInit ? 5 : dotSize}} fill={{isInit ? startColor : peakColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        {{!isInit && h.startIdx !== undefined && (
                                          <ReferenceDot key={`head-sub3-start-${{i}}`} x={{h.startIdx / samplingFreq}} y={{getCalibrationY(activePoint, h.startIdx, 'differential', curveKey)}} r={{dotSize}} fill={{startColor}} stroke="#fff" strokeWidth={{1.5}} />
                                        )}}
                                      </React.Fragment>
                                    );
                                  }})}}"""
content = re.sub(pattern3, repl3, content)

# Fix sub1
pattern1 = r"\{/\* Wave Head markers \(Red Dots\) \*/\}\s*\{activePoint\?\.calibration\?\.heads\?\.map\(\(h, i\) => \{\s*const displayIdx = h\.index;\s*const displayVal = getCalibrationY\(activePoint, displayIdx, 'differential', 'value'\);\s*const timeVal = displayIdx / samplingFreq;\s*return \(\s*<ReferenceDot \s*key=\{`head-sub1-\$\{i\}`\} \s*x=\{timeVal\} \s*y=\{displayVal\} \s*r=\{4\}\s*fill=\"#ef4444\" \s*stroke=\"#fff\" \s*strokeWidth=\{1\.5\} \s*/>\s*\);\s*\}\)\}"
def repl1(m):
    return f"""{{/* Wave Head markers */}}
                                    {{activePoint?.calibration?.heads?.map((h: any, i: number) => {{
                                      const displayIdx = h.index;
                                      const displayVal = getCalibrationY(activePoint, displayIdx, 'differential', 'value');
                                      const timeVal = displayIdx / samplingFreq;
                                      const isInit = detectionType === 'initial';
                                      const startColor = settings.faultDetection.sequenceHeadStartColor;
                                      const peakColor = settings.faultDetection.sequenceHeadPeakColor;
                                      const dotSize = settings.faultDetection.sequenceHeadSize;
                                      return (
                                        <React.Fragment key={`head-sub1-frag-${{i}}`}>
                                          <ReferenceDot key={`head-sub1-${{i}}`} x={{timeVal}} y={{displayVal}} r={{isInit ? 5 : dotSize}} fill={{isInit ? startColor : peakColor}} stroke="#fff" strokeWidth={{1.5}} />
                                          {{!isInit && h.startIdx !== undefined && (
                                            <ReferenceDot key={`head-sub1-start-${{i}}`} x={{h.startIdx / samplingFreq}} y={{getCalibrationY(activePoint, h.startIdx, 'differential', 'value')}} r={{dotSize}} fill={{startColor}} stroke="#fff" strokeWidth={{1.5}} />
                                          )}}
                                        </React.Fragment>
                                      );
                                    }})}}"""
content = re.sub(pattern1, repl1, content)

# Initial calibration view (lines ~4600)
# We also need to change the fill of initial calibration marker to settings.faultDetection.sequenceHeadStartColor
pattern_init = r"const layout = getLabelLayout\(labelPos, 5\);\s*return \(\s*<ReferenceDot \s*key=\{`head-init-\$\{i\}`\} \s*x=\{timeVal\} \s*y=\{displayVal\} \s*shape=\{\(props: any\) => \{\s*const \{ cx, cy \} = props;\s*return \(\s*<g>\s*<circle \s*cx=\{cx\} \s*cy=\{cy\} \s*r=\{5\} \s*fill=\"#ef4444\""
def repl_init(m):
    return f"""const layout = getLabelLayout(labelPos, 5);
                                    const startColor = settings.faultDetection.sequenceHeadStartColor;
                                    return (
                                      <ReferenceDot 
                                        key={{`head-init-${{i}}`}} 
                                        x={{timeVal}} 
                                        y={{displayVal}} 
                                        shape={{(props: any) => {{
                                          const {{ cx, cy }} = props;
                                          return (
                                            <g>
                                              <circle 
                                                cx={{cx}} 
                                                cy={{cy}} 
                                                r={{5}} 
                                                fill={{startColor}}"""
content = re.sub(pattern_init, repl_init, content)

# Change stroke color in the label box too?
pattern_init2 = r"<rect x=\{cx \+ layout\.rx\} y=\{cy \+ layout\.ry\} width=\{layout\.width\} height=\{layout\.height\} fill=\"white\" stroke=\"#ef4444\" strokeWidth=\{1\} rx=\{4\} />"
def repl_init2(m):
    return r"<rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill=\"white\" stroke={startColor} strokeWidth={1} rx={4} />"
content = re.sub(pattern_init2, repl_init2, content)

with open('src/components/WaveformAnalyzer.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
