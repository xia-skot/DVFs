with open('src/lib/signal.ts', 'r') as f:
    content = f.read()

wrong = """export function multiDifference(data: number[] | Float32Array): { diff1: Float32Array, diff2: Float32Array } {
  if (data.length < 3) return { diff1: new Float32Array(data.length), diff2: new Float32Array(data.length) };
  
  const diff1 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 1; i++) {
    diff1[i] = data[i + 1] - data[i];
  }
  
  const diff2 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 2; i++) {
    diff2[i] = diff1[i + 1] - diff1[i];
  }
  
  return { diff1, diff2 };
}"""

correct = """export function multiDifference(data: number[] | Float32Array): { diff1: Float32Array, diff2: Float32Array, diff3: Float32Array } {
  if (data.length < 4) return { diff1: new Float32Array(data.length), diff2: new Float32Array(data.length), diff3: new Float32Array(data.length) };
  
  const diff1 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 1; i++) {
    diff1[i] = data[i + 1] - data[i];
  }
  
  const diff2 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 2; i++) {
    diff2[i] = diff1[i + 1] - diff1[i];
  }
  
  const diff3 = new Float32Array(data.length);
  for (let i = 0; i < data.length - 3; i++) {
    diff3[i] = diff2[i + 1] - diff2[i];
  }
  
  return { diff1, diff2, diff3 };
}"""

if wrong in content:
    with open('src/lib/signal.ts', 'w') as f:
        f.write(content.replace(wrong, correct))
    print("Fixed!")
else:
    print("Not found!")
