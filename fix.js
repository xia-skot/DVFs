const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('label={{ value: \'时间 (s)\', position: \'insideBottomRight\'')) {
    startIndex = i; // Around line 5420
  }
  if (lines[i].includes('!isCalibratingDrag && activePoint?.calibration?.heads?.map((h, i) => {')) {
    if (startIndex !== -1 && endIndex === -1) {
      endIndex = i; // Let's find where the map ends
    }
  }
}
console.log(startIndex, endIndex);
