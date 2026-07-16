import re

with open('src/components/WaveformAnalyzer.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# We want to remove from the line that has 'i}}`' up to the line right before '{/* Render custom annotations for Subplot 2 */}'
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "i}`" in line and "x={xVal}" in lines[i+1]:
        start_idx = i
    if "{/* Render custom annotations for Subplot 2 */}" in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    new_lines = lines[:start_idx] + lines[end_idx:]
    with open('src/components/WaveformAnalyzer.tsx', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Fixed via python script!")
else:
    print(f"Could not find start or end index. Start: {start_idx}, End: {end_idx}")
