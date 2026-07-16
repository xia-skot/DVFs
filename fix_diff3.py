with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

content = content.replace("pt.diff3 = 0; // diff3 not easily available from multiDifference but usually not used for markers", "pt.diff3 = diffs.diff3[idx];")

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed diff3 pt assignment")
