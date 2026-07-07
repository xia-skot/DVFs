with open('src/components/WaveformAnalyzer.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "const getPixelCoordinates = (ptTime: number, ptVal: number, curveKey: string, rect: DOMRect, domains: { x: [number, number], y: [number, number] }) => {",
    "const getPixelCoordinates = (ptTime: number, ptVal: number, curveKey: string, rect: { left: number; top: number; width: number; height: number; }, domains: { x: [number, number], y: [number, number] }) => {"
)

with open('src/components/WaveformAnalyzer.tsx', 'w') as f:
    f.write(content)
print("Fixed type.")
