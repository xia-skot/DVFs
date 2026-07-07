const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf8');

const regex = /(const getCalibrationY = \(point: WavePoint, index: number, waveType: string, curveKey\?: string\): number => \{)([\s\S]*?)(  \};)/;

code = code.replace(regex, (match, p1, p2, p3) => {
  return p1 + '\n    const roundedIndex = Math.round(index);\n' + p2.replace(/\[index\]/g, '[roundedIndex]') + p3;
});

fs.writeFileSync('src/components/WaveformAnalyzer.tsx', code);
