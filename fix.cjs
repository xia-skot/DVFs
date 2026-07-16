const fs = require('fs');
let code = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf-8');
const lines = code.split('\n');

let startIndex = lines.findIndex(l => l.includes('label={{ value: \'时间 (s)\', position: \'insideBottomRight\', offset: -5, fontSize: 10, fill: \'#64748b\' }}'));
let endIndex = lines.findIndex((l, i) => i > startIndex && l.includes('!isCalibratingDrag && activePoint?.calibration?.heads?.map((h, i) => {'));
let finalEnd = lines.findIndex((l, i) => i > endIndex && l.includes('{isCalibratingDrag && activeCalibratingPoint && ('));

console.log("Start:", startIndex, "End:", endIndex, "Final:", finalEnd);
