const fs = require('fs');
let content = fs.readFileSync('src/components/WaveformAnalyzer.tsx', 'utf8');

// The initial calibration view uses custom shape for head-init
// We need to find head-init and change its circle fill to settings.faultDetection.sequenceHeadStartColor
// And its rect stroke to settings.faultDetection.sequenceHeadStartColor

content = content.replace(/fill=\{settings\.faultDetection\.curveColors\.teo\}/g, (match, offset, str) => {
    // Only replace if it's near head-init
    const subStr = str.substring(Math.max(0, offset - 300), offset);
    if (subStr.includes('head-init')) {
        return 'fill={settings.faultDetection.sequenceHeadStartColor}';
    }
    return match;
});

content = content.replace(/stroke=\{settings\.faultDetection\.curveColors\.teo\}/g, (match, offset, str) => {
    // Only replace if it's near head-init
    const subStr = str.substring(Math.max(0, offset - 800), offset);
    if (subStr.includes('head-init')) {
        return 'stroke={settings.faultDetection.sequenceHeadStartColor}';
    }
    return match;
});

fs.writeFileSync('src/components/WaveformAnalyzer.tsx', content);
