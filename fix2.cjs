const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('!isCalibratingDrag && activePoint?.calibration?.heads?.map((h, i) => {')) {
    console.log(i, lines[i]);
  }
}
