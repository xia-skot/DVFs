with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

content = content.replace("pt.diff2 = diffResults.diff2[relIdx];", "pt.diff2 = diffResults.diff2[relIdx];\n          pt.diff3 = diffResults.diff3[relIdx];")

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed diff3 usage")
