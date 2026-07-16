with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

old_diff = """      if (curveKey === 'diff1' || curveKey === 'diff2') {
        const i = roundedIndex;
        if (i < 2 || i >= point.phaseA.length - 2) return 0;
        const v_m1 = getModalValue(selectedModulus, i - 1);
        const v_0 = getModalValue(selectedModulus, i);
        const v_p1 = getModalValue(selectedModulus, i + 1);
        const v_p2 = getModalValue(selectedModulus, i + 2);
        const d1 = v_0 - v_m1;
        const d1_p1 = v_p1 - v_0;
        if (curveKey === 'diff1') return d1;
        return d1_p1 - d1; 
      }"""

new_diff = """      if (curveKey === 'diff1' || curveKey === 'diff2' || curveKey === 'diff3') {
        const i = roundedIndex;
        if (i < 0 || i >= point.phaseA.length) return 0;
        
        const getV = (j: number) => {
          if (j < 0 || j >= point.phaseA.length) return 0;
          return getModalValue(selectedModulus, j);
        };
        
        const d1_i = getV(i + 1) - getV(i);
        if (curveKey === 'diff1') return d1_i;
        
        const d1_p1 = getV(i + 2) - getV(i + 1);
        const d2_i = d1_p1 - d1_i;
        if (curveKey === 'diff2') return d2_i;
        
        const d1_p2 = getV(i + 3) - getV(i + 2);
        const d2_p1 = d1_p2 - d1_p1;
        const d3_i = d2_p1 - d2_i;
        return d3_i;
      }"""

content = content.replace(old_diff, new_diff)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed getCalibrationY diff")
