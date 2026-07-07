import re

with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

# We need to find the start of the valid block, which is:
# "            if (dotDist <= 15) {"
# and the end of the corrupted block which is the duplicate "if (dotDist <= 15) {" block.
# Actually, let's just find the whole block from "if (singleWaveType === 'karenbauer') {"
# down to the end of the duplicated "setActiveCalibratingPoint"

start_pattern = "              });   const ptY_ratio = (domains.y[1] - displayVal) / (domains.y[1] - domains.y[0]);"
# We want to remove this start_pattern and everything up to and including:
end_pattern = """              setActiveCalibratingPoint({
                time: timeVal,
                value: displayVal,
                curveKey: curveKey,
                color: color,
                originalIndex: h.index
              });"""

idx1 = content.find(start_pattern)
if idx1 != -1:
    # First, replace `});   const ptY_ratio...` with just `});`
    idx2 = content.find(end_pattern, idx1)
    if idx2 != -1:
        idx2 += len(end_pattern)
        content = content[:idx1] + "              });\n" + content[idx2:]
        with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
            f.write(content)
        print("Cleaned up duplicated block.")
    else:
        print("Could not find end pattern")
else:
    print("Could not find start pattern")
