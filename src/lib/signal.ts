export function removePowerFrequency(
  data: number[] | Float32Array, 
  sampleRate: number = 1000000, 
  preFaultLen: number = 8000,
  psoPop: number = 20,
  psoIter: number = 30
): { data: Float32Array, error: number, A: number, f: number, theta: number } {
  if (data.length === 0) return { data: new Float32Array(0), error: 0, A: 0, f: 50, theta: 0 };
  
  // 1. extract pre-fault data
  // Automatically detect the fault inception point to prevent transient leakage into the fitting window
  let inceptionIdx = data.length;
  const baselineLen = Math.min(100, Math.floor(data.length / 5));
  if (data.length > 20 && baselineLen > 5) {
    let sumPreDiff = 0;
    for (let i = 1; i < baselineLen; i++) {
      sumPreDiff += Math.abs(data[i] - data[i - 1]);
    }
    const avgPreDiff = sumPreDiff / (baselineLen - 1);
    
    // Set an adaptive threshold: 12x the pre-fault baseline difference, with a minimum of 0.5 to prevent noise triggers
    const transientThreshold = Math.max(0.5, avgPreDiff * 12);
    
    // Scan for transient start, starting after baselineLen to avoid self-triggering
    for (let i = baselineLen; i < data.length; i++) {
      if (Math.abs(data[i] - data[i - 1]) > transientThreshold) {
        inceptionIdx = i;
        break;
      }
    }
  }

  // Determine actual fit length: if the user-defined preFaultLen reaches into the post-fault transient, clip it!
  let fitLen = Math.min(preFaultLen, data.length);
  if (inceptionIdx < fitLen) {
    // Clip the fitting window to end 150 samples (0.15ms) before the transient starts to ensure pure pre-fault data
    fitLen = Math.max(100, inceptionIdx - 150);
  }
  const fitData = data.slice(0, fitLen);
  
  // 2. PSO for f in [45, 55], A in [0, 2.5*max(abs)], theta in [0, 2pi]
  const numParticles = psoPop;
  const numIterations = psoIter;
  
  let globalBest = {
    A: 0,
    f: 50,
    theta: 0,
    error: Infinity
  };
  
  let maxAbs = 0;
  for (let i = 0; i < fitLen; i++) {
    const val = fitData[i];
    if (isNaN(val)) continue;
    const v = Math.abs(val);
    if (v > maxAbs) maxAbs = v;
  }
  if (maxAbs === 0 || isNaN(maxAbs)) maxAbs = 1;

  // Search bounds
  const minA = 0;
  const maxA = 2.5 * maxAbs;
  const minF = 45;
  const maxF = 55;

  // Velocity clamping thresholds to prevent particle explosion (Vmax = 20% of range)
  const vMaxA = 0.2 * maxAbs;
  const vMaxF = 0.5; // range is 10 Hz, so 0.5 Hz is 10% velocity step max
  const vMaxTheta = 0.2 * (2 * Math.PI);

  const particles = Array.from({ length: numParticles }, () => {
    const initA = Math.random() * maxAbs;
    const initF = 49.5 + Math.random(); // Initialize close to nominal 50Hz [49.5, 50.5]
    const initTheta = Math.random() * 2 * Math.PI;
    return {
      pos: { A: initA, f: initF, theta: initTheta },
      vel: {
        A: (Math.random() - 0.5) * vMaxA * 0.5,
        f: (Math.random() - 0.5) * vMaxF * 0.5,
        theta: (Math.random() - 0.5) * vMaxTheta * 0.5
      },
      bestPos: { A: initA, f: initF, theta: initTheta },
      bestError: Infinity
    };
  });
  
  // Dynamically calculate sampling step to ensure exact and fast calculations (target ~1000 points)
  const step = Math.max(1, Math.floor(fitLen / 1000));
  const calcError = (A: number, f: number, theta: number) => {
    let err = 0;
    let count = 0;
    for (let i = 0; i < fitLen; i += step) {
      const t = i / sampleRate;
      const val = A * Math.cos(2 * Math.PI * f * t + theta);
      const diff = fitData[i] - val;
      err += diff * diff;
      count++;
    }
    return count > 0 ? err / count : err; // Normalized MSE to ensure stable errors across window changes
  };
  
  particles.forEach(p => {
    p.bestError = calcError(p.pos.A, p.pos.f, p.pos.theta);
    if (p.bestError < globalBest.error) {
      globalBest = { ...p.pos, error: p.bestError };
    }
  });
  
  for (let iter = 0; iter < numIterations; iter++) {
    // 1. Dynamic Inertia Weight: Linearly decreasing from 0.9 to 0.4
    const w = 0.9 - 0.5 * (iter / numIterations);
    
    // 2. Dynamic Acceleration Coefficients:
    // c1 (cognitive factor) decreases linearly from 2.0 to 0.5 to encourage individual exploration early on
    // c2 (social factor) increases linearly from 0.5 to 2.0 to encourage rapid social convergence to global optimum later
    const c1 = 2.0 - 1.5 * (iter / numIterations);
    const c2 = 0.5 + 1.5 * (iter / numIterations);
    
    particles.forEach(p => {
      // Update velocities
      p.vel.A = w * p.vel.A + c1 * Math.random() * (p.bestPos.A - p.pos.A) + c2 * Math.random() * (globalBest.A - p.pos.A);
      p.vel.f = w * p.vel.f + c1 * Math.random() * (p.bestPos.f - p.pos.f) + c2 * Math.random() * (globalBest.f - p.pos.f);
      p.vel.theta = w * p.vel.theta + c1 * Math.random() * (p.bestPos.theta - p.pos.theta) + c2 * Math.random() * (globalBest.theta - p.pos.theta);
      
      // Velocity clamping
      p.vel.A = Math.max(-vMaxA, Math.min(vMaxA, p.vel.A));
      p.vel.f = Math.max(-vMaxF, Math.min(vMaxF, p.vel.f));
      p.vel.theta = Math.max(-vMaxTheta, Math.min(vMaxTheta, p.vel.theta));
      
      // Update positions
      p.pos.A += p.vel.A;
      p.pos.f += p.vel.f;
      p.pos.theta += p.vel.theta;
      
      // Position boundary clamping
      p.pos.A = Math.max(minA, Math.min(maxA, p.pos.A));
      p.pos.f = Math.max(minF, Math.min(maxF, p.pos.f));
      
      // Phase periodic wrapping: theta is periodic within [0, 2pi]. This prevents boundary sticking.
      p.pos.theta = ((p.pos.theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      
      // Evaluate new error
      const err = calcError(p.pos.A, p.pos.f, p.pos.theta);
      if (err < p.bestError) {
        p.bestError = err;
        p.bestPos = { ...p.pos };
        if (err < globalBest.error) {
          globalBest = { ...p.pos, error: err };
        }
      }
    });
  }
  
  // 3. Construct wave and subtract
  const result = new Float32Array(data.length);
  for(let i=0; i<data.length; i++) {
    const t = i / sampleRate;
    const wave_cos = globalBest.A * Math.cos(2 * Math.PI * globalBest.f * t + globalBest.theta);
    result[i] = data[i] - wave_cos;
  }
  
  // Calculate final Mean Squared Error (MSE) over all points for normalized, stable reporting
  let finalErr = 0;
  for (let i = 0; i < fitLen; i++) {
    const t = i / sampleRate;
    const val = globalBest.A * Math.cos(2 * Math.PI * globalBest.f * t + globalBest.theta);
    const diff = fitData[i] - val;
    finalErr += diff * diff;
  }
  const mse = fitLen > 0 ? finalErr / fitLen : 0;
  
  return { 
    data: result, 
    error: mse, 
    A: globalBest.A, 
    f: globalBest.f, 
    theta: globalBest.theta 
  };
}

/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm
 */
export function lttbDownsample(data: any[] | Float32Array, threshold: number): any[] {
  const dataLength = data.length;
  if (threshold >= dataLength || threshold === 0) {
    return Array.isArray(data) ? data : Array.from(data);
  }

  const sampled: any[] = [];
  let sampledIndex = 0;

  const bucketSize = (dataLength - 2) / (threshold - 2);

  let a = 0; 
  let maxAreaPoint: any;
  let maxArea: number;
  let area: number;
  let nextA = 0;

  sampled[sampledIndex++] = data[a]; 

  for (let i = 0; i < threshold - 2; i++) {
    let avgX = 0;
    let avgY = 0;
    let avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    let avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
    avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;

    const avgRangeLength = avgRangeEnd - avgRangeStart;

    for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
      avgX += (data[avgRangeStart].time || avgRangeStart);
      avgY += (data[avgRangeStart].value !== undefined ? data[avgRangeStart].value : 
               (data[avgRangeStart].alpha !== undefined ? data[avgRangeStart].alpha : 
                (data[avgRangeStart].teo !== undefined ? data[avgRangeStart].teo : 
                 (data[avgRangeStart].teoValue !== undefined ? data[avgRangeStart].teoValue : 0))));
    }
    avgX /= avgRangeLength;
    avgY /= avgRangeLength;

    let rangeOffs = Math.floor((i + 0) * bucketSize) + 1;
    const rangeTo = Math.floor((i + 1) * bucketSize) + 1;

    const pointAX = (data[a].time || a);
    const pointAY = (data[a].value !== undefined ? data[a].value : 
                    (data[a].alpha !== undefined ? data[a].alpha : 
                     (data[a].teo !== undefined ? data[a].teo : 
                      (data[a].teoValue !== undefined ? data[a].teoValue : 0))));

    maxArea = area = -1;

    for (; rangeOffs < rangeTo; rangeOffs++) {
      const val = (data[rangeOffs].value !== undefined ? data[rangeOffs].value : 
                   (data[rangeOffs].alpha !== undefined ? data[rangeOffs].alpha : 
                    (data[rangeOffs].teo !== undefined ? data[rangeOffs].teo : 
                     (data[rangeOffs].teoValue !== undefined ? data[rangeOffs].teoValue : 0))));
      
      area = Math.abs(
        (pointAX - avgX) * (val - pointAY) -
        (pointAX - (data[rangeOffs].time || rangeOffs)) * (avgY - pointAY)
      ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxAreaPoint = data[rangeOffs];
        nextA = rangeOffs;
      }
    }

    sampled[sampledIndex++] = maxAreaPoint;
    a = nextA;
  }

  sampled[sampledIndex++] = data[dataLength - 1]; 
  return sampled;
}

export function addNoise(data: number[] | Float32Array, level: number = 0.1): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[i] + (Math.random() - 0.5) * 2 * level;
  }
  return result;
}

export function karenbauerTransform(phaseA: number[] | Float32Array, phaseB: number[] | Float32Array, phaseC: number[] | Float32Array) {
  const wave_0 = new Float32Array(phaseA.length);
  const wave_alpha = new Float32Array(phaseA.length);
  const wave_beta = new Float32Array(phaseA.length);
  for (let i = 0; i < phaseA.length; i++) {
    wave_0[i] = (phaseA[i] + phaseB[i] + phaseC[i]) / 3;
    wave_alpha[i] = (phaseA[i] - phaseB[i]) / 3;
    wave_beta[i] = (phaseA[i] - phaseC[i]) / 3;
  }
  return { wave_0, wave_alpha, wave_beta };
}

export function clarkeTransform(phaseA: number[] | Float32Array, phaseB: number[] | Float32Array, phaseC: number[] | Float32Array) {
  const wave_0 = new Float32Array(phaseA.length);
  const wave_alpha = new Float32Array(phaseA.length);
  const wave_beta = new Float32Array(phaseA.length);
  const sqrt3 = Math.sqrt(3);
  
  for (let i = 0; i < phaseA.length; i++) {
    wave_0[i] = (phaseA[i] + phaseB[i] + phaseC[i]) / 3;
    wave_alpha[i] = (2 * phaseA[i] - phaseB[i] - phaseC[i]) / 3;
    wave_beta[i] = (phaseB[i] - phaseC[i]) / sqrt3;
  }
  return { wave_0, wave_alpha, wave_beta };
}

export function teagerEnergyOperator(data: number[] | Float32Array): Float32Array {
  const result = new Float32Array(data.length);
  for (let i = 1; i < data.length - 1; i++) {
    result[i] = (data[i] * data[i]) - (data[i - 1] * data[i + 1]);
  }
  return result;
}

export function multiDifference(data: number[] | Float32Array): { diff1: Float32Array, diff2: Float32Array } {
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
}

export function doubleDifference(data: number[] | Float32Array): number[] {
  if (data.length < 3) return new Array(data.length).fill(0);
  
  // First diff
  const diff1 = new Float32Array(data.length - 1);
  for (let i = 0; i < data.length - 1; i++) {
    diff1[i] = data[i + 1] - data[i];
  }
  
  // Abs of diff1
  const absDiff1 = new Float32Array(diff1.length);
  for (let i = 0; i < diff1.length; i++) {
    absDiff1[i] = Math.abs(diff1[i]);
  }
  
  // Second diff (of absDiff1)
  const diff2 = new Float32Array(absDiff1.length - 1);
  for (let i = 0; i < absDiff1.length - 1; i++) {
    diff2[i] = absDiff1[i + 1] - absDiff1[i];
  }
  
  // Abs of diff2
  const result = new Array(data.length).fill(0);
  for (let i = 0; i < diff2.length; i++) {
    result[i + 2] = Math.abs(diff2[i]); // Aligning roughly with indices
  }
  return result;
}

/**
 * Basic 1D DWT using selected wavelet coefficients
 * Returns the detail coefficients (high-pass)
 */
export function discreteWaveletTransform(data: number[] | Float32Array, type: string = 'db2'): Float32Array {
  let hi_d = [-0.4830, 0.8365, -0.2241, -0.1294]; // Default db2
  
  if (type === 'db4') {
    hi_d = [-0.0106, 0.0329, 0.0308, -0.1870, -0.0280, 0.6309, -0.7148, 0.2304];
  } else if (type === 'sym2') {
    hi_d = [-0.4830, 0.8365, -0.2241, -0.1294]; 
  } else if (type === 'haar') {
    hi_d = [-0.7071, 0.7071];
  }
  
  const result = new Float32Array(data.length);
  
  for (let i = 0; i < data.length - hi_d.length; i++) {
    let sum = 0;
    let hasNaN = false;
    for (let j = 0; j < hi_d.length; j++) {
      const v = data[i + j];
      if (isNaN(v)) {
        hasNaN = true;
        break;
      }
      sum += v * hi_d[j];
    }
    result[i] = hasNaN ? 0 : Math.abs(sum);
  }
  return result;
}

export interface DetectionResult {
  t_arrive: number; // index
  max_val: number;
  detected: boolean;
  debugInfo?: {
    baseline: number;
    threshold: number;
    factor: number;
  };
}

export function waveFrontDetect(
  processedWave: number[] | Float32Array, 
  samplingFreq: number, 
  faultTime: number,
  mode: 'diff' | 'wavelet',
  thresholdFactor: number = 1.5,
  preFaultWindowRatio: number = 0.1
): DetectionResult {
  const L = processedWave.length;
  if (L < 10) return { t_arrive: 0, max_val: 0, detected: false };

  // Step 1: Calculate baseline from pre-fault period
  // If faultTime is 0.0002 but data starts at 0, we use it. 
  // But if the data is long, we might need a better baseline.
  let preFaultIndexLimit = Math.max(100, Math.floor(L * 0.02));
  if (faultTime > 0 && faultTime * samplingFreq < L) {
    const faultIdx = Math.floor(faultTime * samplingFreq);
    preFaultIndexLimit = Math.min(preFaultIndexLimit, Math.max(20, faultIdx - 10));
  }
  
  let max_num = 0;
  let sum = 0;
  let sumSq = 0;
  const startSearchBaseline = Math.max(0, Math.min(20, preFaultIndexLimit - 20)); 
  let count = 0;
  for (let i = startSearchBaseline; i < preFaultIndexLimit; i++) {
    const val = Math.abs(processedWave[i]);
    sum += val;
    sumSq += val * val;
    if (val > max_num) max_num = val;
    count++;
  }
  
  const mean = count > 0 ? sum / count : 0;
  const std = count > 1 ? Math.sqrt(Math.max(0, sumSq / count - mean * mean)) : 0;
  
  // Step 2: Find global peak to help set a minimum threshold
  let globalMax = 0;
  for (let i = preFaultIndexLimit; i < L; i++) {
    const v = Math.abs(processedWave[i]);
    if (v > globalMax) globalMax = v;
  }

  // Robust threshold: 
  // 1. Significant compared to pre-fault noise (std dev)
  // 2. Significant compared to pre-fault max
  // 3. Significant compared to the global peak (avoid tiny wiggles)
  // 4. Above absolute noise floor
  const threshold = Math.max(
    mean + 8 * std, 
    max_num * thresholdFactor, 
    globalMax * 0.05, 
    1e-4
  );
  
  // Step 3: Search for first trigger exceeding threshold
  let triggerIdx = -1;
  let peakVal = 0;
  let detected = false;
  
  const searchStart = Math.max(0, preFaultIndexLimit - 5);
  for (let i = searchStart; i < L - 10; i++) {
    const valAbs = Math.abs(processedWave[i]);
    if (valAbs > threshold) {
      // Stricter noise check: must stay high for more samples
      let support = 0;
      for (let k = 1; k <= 10; k++) {
        if (Math.abs(processedWave[i+k]) > threshold * 0.5) support++;
      }
      
      if (support >= 6) {
        triggerIdx = i;
        peakVal = processedWave[i];
        detected = true;
        break;
      }
    }
  }
  
  // Step 4: Refine to peak
  if (detected && triggerIdx !== -1) {
    const lookAhead = Math.min(triggerIdx + 200, L);
    const initialSign = processedWave[triggerIdx] >= 0 ? 1 : -1;
    let localPeakIdx = triggerIdx;
    let localPeakValAbs = Math.abs(processedWave[triggerIdx]);

    for (let j = triggerIdx + 1; j < lookAhead; j++) {
      const currentVal = processedWave[j];
      const currentValAbs = Math.abs(currentVal);
      const currentSign = currentVal >= 0 ? 1 : -1;
      
      if (currentValAbs > localPeakValAbs) {
        if (currentSign === initialSign || localPeakValAbs < 1e-4) {
          localPeakValAbs = currentValAbs;
          localPeakIdx = j;
          peakVal = currentVal; 
        } else {
          break; 
        }
      } else if (currentValAbs < localPeakValAbs * 0.5) {
        break; 
      }
    }

    // Refine start index (onset)
    let onsetIdx = localPeakIdx;
    const onsetThreshold = mean + (localPeakValAbs - mean) * 0.05;
    for (let j = localPeakIdx; j >= searchStart; j--) {
      if (Math.abs(processedWave[j]) <= onsetThreshold) {
        onsetIdx = j;
        break;
      }
    }

    // Delay compensation
    const delay = mode === 'wavelet' ? 2.0 : 2.0;
    
    // Sub-sample refinement
    let refinedIdx = localPeakIdx;
    if (localPeakIdx > 0 && localPeakIdx < L - 1) {
      const y1 = Math.abs(processedWave[localPeakIdx - 1]);
      const y2 = Math.abs(processedWave[localPeakIdx]);
      const y3 = Math.abs(processedWave[localPeakIdx + 1]);
      const denom = 2 * (2 * y2 - y1 - y3);
      if (Math.abs(denom) > 1e-9) {
        const offset = (y3 - y1) / denom;
        refinedIdx = localPeakIdx + offset;
      }
    }

    triggerIdx = Math.max(0, refinedIdx - delay);
  }
  
  return { 
    t_arrive: triggerIdx === -1 ? 0 : triggerIdx, 
    max_val: peakVal, 
    detected,
    debugInfo: {
      baseline: max_num,
      threshold: threshold,
      factor: thresholdFactor
    }
  };
}

export function detectWaveHead(data: number[] | Float32Array, threshold: number = 0.1, maxCount: number = 100): { index: number, value: number }[] {
  const peaks = [];
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > data[i - 1] && data[i] > data[i + 1] && data[i] > threshold) {
      peaks.push({ index: i, value: data[i] });
    }
  }
  peaks.sort((a, b) => b.value - a.value);
  return peaks.slice(0, maxCount);
}

export interface SequenceCalibrationResult {
  index: number;
  value: number;
  amplitude: number;
  isManual: boolean;
  startIdx: number;
  endIdx: number;
  startVal?: number;
  point1?: number;
  point2?: number;
  debugWaves?: {
    diff1: Float32Array;
    diff2: Float32Array;
    diff3: Float32Array;
    original: Float32Array;
  };
}

export interface CalibrationOptions {
  samplingFreq?: number;
  thresholdFactor?: number;
  preFaultWindowRatio?: number;
  para_cali_windows_length?: number;
  para_cali_start_doorsill?: number;
  para_cali_hist?: number;
  para_cali_hist_sift?: number;
  user_diff2_time?: number;
  user_diff2_time_end?: number;
  para_cali_head_count?: number;
}

export function calibrateWaveSequence(
  wave_fault1: number[] | Float32Array,
  options: CalibrationOptions = {}
): SequenceCalibrationResult[] {
  const {
    samplingFreq = 1e6,
    thresholdFactor = 1.2,
    preFaultWindowRatio = 0.333,
    para_cali_windows_length = 200,
    para_cali_start_doorsill = 0.1,
    para_cali_hist_sift = 30,
    user_diff2_time = 7,
    user_diff2_time_end = 50,
    para_cali_head_count = 8
  } = options;
  
  const L = wave_fault1.length;
  if (L < 10) return [];

  // Calculate difference waves (Left-aligned, matching MATLAB)
  const diff1 = new Float32Array(L);
  for (let i = 0; i < L - 1; i++) {
    diff1[i] = wave_fault1[i + 1] - wave_fault1[i];
  }
  const diff2 = new Float32Array(L);
  for (let i = 0; i < L - 2; i++) {
    diff2[i] = diff1[i + 1] - diff1[i];
  }
  const diff3 = new Float32Array(L);
  for (let i = 0; i < L - 3; i++) {
    diff3[i] = diff2[i + 1] - diff2[i];
  }

  // Calculate baseline threshold from pre-fault period on diff2
  const preFaultLength = Math.floor(L * preFaultWindowRatio);
  let preFaultMax = 0;
  for (let i = 0; i < Math.min(preFaultLength, L); i++) {
    const val = Math.abs(diff2[i]);
    if (val > preFaultMax) preFaultMax = val;
  }
  
  // Base threshold for starting detection (Matching MATLAB para_cali_start_doorsill)
  const doorsill = para_cali_start_doorsill;

  // Search for first trigger exceeding doorsill in diff2
  let first_trigger = -1;
  for (let i = preFaultLength; i < L; i++) {
    if (Math.abs(diff2[i]) > doorsill) {
      first_trigger = i;
      break;
    }
  }

  const windows_start = first_trigger !== -1 ? Math.max(0, first_trigger - 10) : Math.max(0, preFaultLength - 10);
  const windows_length = para_cali_windows_length; // matching MATLAB para_cali_windows_length
  const windows_end = Math.min(windows_start + windows_length, L - 1);

  // Find local extremum points of diff2 in the window
  const localPeaks: { index: number; absValue: number }[] = [];
  for (let i = windows_start + 1; i < windows_end; i++) {
    const val = diff2[i];
    const prev = diff2[i - 1];
    const next = diff2[i + 1];
    if ((val > prev && val > next) || (val < prev && val < next)) {
      localPeaks.push({ index: i, absValue: Math.abs(val) });
    }
  }

  // If no peak found, fallback
  if (localPeaks.length === 0) {
    for (let i = windows_start + 1; i < windows_end; i++) {
      localPeaks.push({ index: i, absValue: Math.abs(diff2[i]) });
    }
  }

  // Sort descending by absValue to pick top peaks, then sort by index ascending
  localPeaks.sort((a, b) => b.absValue - a.absValue);
  const topPeaks = localPeaks.slice(0, para_cali_hist_sift); // matching MATLAB para_cali_hist_sift
  topPeaks.sort((a, b) => a.index - b.index);
  const T_head = topPeaks.map(p => p.index);
  const waveHeads: SequenceCalibrationResult[] = [];

  let k1 = 0;
  while (k1 < T_head.length - 1) {
    const idx1 = T_head[k1];
    const idx2 = T_head[k1 + 1];

    if (idx2 - idx1 <= user_diff2_time) {
      const isPositive = diff2[idx1] > 0 && diff2[idx2] < 0;
      const isNegative = diff2[idx1] < 0 && diff2[idx2] > 0;

      if (isPositive || isNegative) {
        const t_range1 = Math.max(0, idx1 - user_diff2_time);
        const next_head_index = (k1 + 2 < T_head.length) ? T_head[k1 + 2] : L - 1;

        let t_range2 = idx2 + user_diff2_time_end;
        if (isPositive) {
          let zheng_site_idx = -1;
          const searchEnd = Math.min(idx2 + user_diff2_time_end, L - 1);
          for (let i = idx2; i <= searchEnd; i++) {
            if (diff2[i] > 0) {
              zheng_site_idx = i;
              break;
            }
          }
          if (zheng_site_idx !== -1) {
            t_range2 = Math.min(zheng_site_idx, next_head_index);
          } else {
            t_range2 = Math.min(idx2 + user_diff2_time_end, next_head_index);
          }
        } else {
          let fu_site_idx = -1;
          const searchEnd = Math.min(idx2 + user_diff2_time_end, L - 1);
          for (let i = idx2; i <= searchEnd; i++) {
            if (diff2[i] < 0) {
              fu_site_idx = i;
              break;
            }
          }
          if (fu_site_idx !== -1) {
            t_range2 = Math.min(fu_site_idx, next_head_index);
          } else {
            t_range2 = Math.min(idx2 + user_diff2_time_end, next_head_index);
          }
        }

        // Refine start time to the exact first extremum point of diff2 as requested by user
        let t_head_start_idx = idx1;

        // Refine end/peak time
        let t_head_end_idx = idx2;
        
        if (isPositive) {
          let maxD1Val = -Infinity;
          let t_diff1_max = t_range1;
          for (let i = t_range1; i <= t_range2; i++) {
            if (diff1[i] > maxD1Val) {
              maxD1Val = diff1[i];
              t_diff1_max = i;
            }
          }

          let fu_site_idx = -1;
          const endLimit = Math.min(t_diff1_max + user_diff2_time_end, next_head_index);
          for (let i = t_diff1_max; i <= endLimit; i++) {
            if (diff1[i] <= 0) {
              fu_site_idx = i;
              break;
            }
          }
          if (fu_site_idx !== -1) {
            t_head_end_idx = fu_site_idx;
          } else {
            let diff2_zheng_site_idx = -1;
            for (let i = t_diff1_max; i <= Math.min(t_diff1_max + user_diff2_time_end, L - 1); i++) {
              if (diff2[i] >= 0) {
                diff2_zheng_site_idx = i;
                break;
              }
            }
            if (diff2_zheng_site_idx !== -1) {
              t_head_end_idx = diff2_zheng_site_idx;
            } else {
              t_head_end_idx = Math.min(t_diff1_max + user_diff2_time_end, L - 1);
            }
          }
        } else {
          let minD1Val = Infinity;
          let t_diff1_min = t_range1;
          for (let i = t_range1; i <= t_range2; i++) {
            if (diff1[i] < minD1Val) {
              minD1Val = diff1[i];
              t_diff1_min = i;
            }
          }

          let zheng_site_idx = -1;
          const endLimit = Math.min(t_diff1_min + user_diff2_time_end, next_head_index);
          for (let i = t_diff1_min; i <= endLimit; i++) {
            if (diff1[i] >= 0) {
              zheng_site_idx = i;
              break;
            }
          }
          if (zheng_site_idx !== -1) {
            t_head_end_idx = zheng_site_idx;
          } else {
            let diff2_fu_site_idx = -1;
            for (let i = t_diff1_min; i <= Math.min(t_diff1_min + user_diff2_time_end, L - 1); i++) {
              if (diff2[i] <= 0) {
                diff2_fu_site_idx = i;
                break;
              }
            }
            if (diff2_fu_site_idx !== -1) {
              t_head_end_idx = diff2_fu_site_idx;
            } else {
              t_head_end_idx = Math.min(t_diff1_min + user_diff2_time_end, L - 1);
            }
          }
        }

        const wave_head_start_val = wave_fault1[t_head_start_idx];
        const wave_head_end_val = wave_fault1[t_head_end_idx];
        const amplitude = wave_head_end_val - wave_head_start_val;

        waveHeads.push({
          index: t_head_end_idx,
          value: wave_head_end_val,
          amplitude: amplitude,
          isManual: false,
          startIdx: t_head_start_idx,
          endIdx: t_head_end_idx,
          startVal: wave_head_start_val
        });

        k1 += 2;
      } else {
        k1 += 1;
      }
    } else {
      k1 += 1;
    }
  }

  // Fallback to basic peak detection if no valid double-differential wave head found
  if (waveHeads.length === 0) {
    const backupPeaks = detectWaveHead(wave_fault1, doorsill, para_cali_head_count);
    backupPeaks.sort((a, b) => a.index - b.index);
    return backupPeaks.map(p => ({
      index: p.index,
      value: p.value,
      amplitude: p.value,
      isManual: false,
      startIdx: Math.max(0, p.index - 5),
      endIdx: p.index,
      startVal: wave_fault1[Math.max(0, p.index - 5)]
    }));
  }

  // Limit to top para_cali_head_count waves for sequence, sorted by index ascending
  waveHeads.sort((a, b) => Math.abs(b.amplitude) - Math.abs(a.amplitude));
  const finalHeads = waveHeads.slice(0, para_cali_head_count);
  finalHeads.sort((a, b) => a.index - b.index);
  return finalHeads;
}

export interface SequenceCalibrationOutput {
  heads: SequenceCalibrationResult[];
  debugWaves: {
    diff1: Float32Array;
    diff2: Float32Array;
    diff3: Float32Array;
    original: Float32Array;
  };
  debugInfo?: {
    threshold: number;
    T_head?: number[];
    heads_start_indices?: number[];
    heads_end_indices?: number[];
    extrema?: {
      index: number;
      val: number;
      absVal: number;
      passedThreshold: boolean;
      rank?: number;
      passedSift?: boolean;
    }[];
    pairingSteps?: {
      k1: number;
      point1?: number;
      point2?: number;
      val1?: number;
      val2?: number;
      distance?: number;
      isNear?: boolean;
      isOppositeSign?: boolean;
      status: 'success' | 'failed_distance' | 'failed_sign' | 'skipped' | 'incomplete';
      description: string;
      t_head_start?: number;
      t_head_end?: number;
      amplitude?: number;
    }[];
  };
}

export function calibrateWaveSequenceUserUpload(
  wave_fault1: number[] | Float32Array,
  options: CalibrationOptions = {}
): SequenceCalibrationOutput {
  const {
    para_cali_windows_length = 1000,
    para_cali_start_doorsill = 0.1,
    para_cali_hist = 200,
    para_cali_hist_sift = 30,
    user_diff2_time = 7,
    user_diff2_time_end = 50
  } = options;

  const L = wave_fault1.length;
  if (L < 10) {
    return {
      heads: [],
      debugWaves: {
        diff1: new Float32Array(0),
        diff2: new Float32Array(0),
        diff3: new Float32Array(0),
        original: wave_fault1 instanceof Float32Array ? wave_fault1 : new Float32Array(wave_fault1)
      }
    };
  }

  // diff calculation matches MATLAB diff()
  const diff1 = new Float32Array(L);
  const diff2 = new Float32Array(L);
  const diff3 = new Float32Array(L);

  for (let i = 0; i < L - 1; i++) diff1[i] = wave_fault1[i + 1] - wave_fault1[i];
  for (let i = 0; i < L - 2; i++) diff2[i] = diff1[i + 1] - diff1[i];
  for (let i = 0; i < L - 3; i++) diff3[i] = diff2[i + 1] - diff2[i];

  const debugWaves = {
    diff1,
    diff2,
    diff3,
    original: wave_fault1 instanceof Float32Array ? wave_fault1 : new Float32Array(wave_fault1)
  };

  // get_wave_head logic based on diff2 (matching MATLAB Wave_head_time_calibration4_plot)
  // 1. Find all local extrema in diff2
  const extremaList: {
    index: number;
    val: number;
    absVal: number;
    passedThreshold: boolean;
    rank?: number;
    passedSift?: boolean;
  }[] = [];

  for (let i = 1; i < L - 3; i++) {
    const val = diff2[i];
    const absVal = Math.abs(val);
    if ((val > diff2[i - 1] && val > diff2[i + 1]) || (val < diff2[i - 1] && val < diff2[i + 1])) {
      extremaList.push({
        index: i,
        val,
        absVal,
        passedThreshold: absVal > para_cali_start_doorsill
      });
    }
  }

  // 2. Sort those that passed threshold by amplitude to determine top para_cali_hist_sift
  const passedExtrema = extremaList.filter(e => e.passedThreshold);
  passedExtrema.sort((a, b) => b.absVal - a.absVal);
  passedExtrema.forEach((e, idx) => {
    e.rank = idx + 1;
    e.passedSift = (idx < para_cali_hist_sift);
  });

  // Re-sync sift status in full list
  extremaList.forEach(e => {
    const found = passedExtrema.find(pe => pe.index === e.index);
    if (found) {
      e.rank = found.rank;
      e.passedSift = found.passedSift;
    } else {
      e.passedSift = false;
    }
  });

  const filteredExtrema = passedExtrema.filter(e => e.passedSift);
  filteredExtrema.sort((a, b) => a.index - b.index);
  const T_head = filteredExtrema.map(e => e.index);

  const waveHeads: SequenceCalibrationResult[] = [];
  const pairingSteps: {
    k1: number;
    point1?: number;
    point2?: number;
    val1?: number;
    val2?: number;
    distance?: number;
    isNear?: boolean;
    isOppositeSign?: boolean;
    status: 'success' | 'failed_distance' | 'failed_sign' | 'skipped' | 'incomplete';
    description: string;
    t_head_start?: number;
    t_head_end?: number;
    amplitude?: number;
  }[] = [];

  let k1 = 0;
  while (k1 < T_head.length) {
    const point_1 = T_head[k1];
    
    if (k1 === T_head.length - 1) {
      pairingSteps.push({
        k1,
        point1: point_1,
        val1: diff2[point_1],
        status: 'incomplete',
        description: `极值点位于 ${point_1} 点。由于是列表中的最后一个孤立极值点，无法向下进行配对。标定过程到此结束。`
      });
      break;
    }

    const point_2 = T_head[k1 + 1];
    const distance = point_2 - point_1;
    const isNear = distance <= user_diff2_time;
    const isPosToNeg = diff2[point_1] > 0 && diff2[point_2] < 0;
    const isNegToPos = diff2[point_1] < 0 && diff2[point_2] > 0;
    const isOppositeSign = isPosToNeg || isNegToPos;

    if (!isNear) {
      pairingSteps.push({
        k1,
        point1: point_1,
        point2: point_2,
        val1: diff2[point_1],
        val2: diff2[point_2],
        distance,
        isNear,
        isOppositeSign,
        status: 'failed_distance',
        description: `极值点 ${point_1} (值: ${diff2[point_1].toFixed(4)}) 与极值点 ${point_2} (值: ${diff2[point_2].toFixed(4)}) 的间隔为 ${distance} 点，大于最大允许间隔限制 user_diff2_time (${user_diff2_time} 点)。配对失败，k1 索引向后步进 1 点。`
      });
      k1 += 1;
      continue;
    }

    if (!isOppositeSign) {
      pairingSteps.push({
        k1,
        point1: point_1,
        point2: point_2,
        val1: diff2[point_1],
        val2: diff2[point_2],
        distance,
        isNear,
        isOppositeSign,
        status: 'failed_sign',
        description: `极值点 ${point_1} (值: ${diff2[point_1].toFixed(4)}) 与极值点 ${point_2} (值: ${diff2[point_2].toFixed(4)}) 极性相同 (同为${diff2[point_1] > 0 ? '正' : '负'})，未发生二阶差分正负极性交替。配对失败，k1 索引向后步进 1 点。`
      });
      k1 += 1;
      continue;
    }

    // Sign changed & within proximity -> Process calibration details
    const t_range1 = Math.max(0, point_1 - user_diff2_time);
    let t_range2 = point_2 + user_diff2_time_end;
    const next_head = (k1 + 2 < T_head.length) ? T_head[k1 + 2] : L - 1;

    if (isPosToNeg) {
      // Search for next positive point in diff2
      let zheng_site_idx = -1;
      for (let i = point_2; i < Math.min(point_2 + user_diff2_time_end, L - 2); i++) {
        if (diff2[i] > 0) {
          zheng_site_idx = i;
          break;
        }
      }
      if (zheng_site_idx !== -1) {
        t_range2 = Math.min(zheng_site_idx, next_head);
      } else {
        t_range2 = Math.min(point_2 + user_diff2_time_end, next_head);
      }
    } else {
      // Search for next negative point in diff2
      let fu_site_idx = -1;
      for (let i = point_2; i < Math.min(point_2 + user_diff2_time_end, L - 2); i++) {
        if (diff2[i] < 0) {
          fu_site_idx = i;
          break;
        }
      }
      if (fu_site_idx !== -1) {
        t_range2 = Math.min(fu_site_idx, next_head);
      } else {
        t_range2 = Math.min(point_2 + user_diff2_time_end, next_head);
      }
    }

    let t_head_start = -1;
    let t_head_end = -1;

    if (isPosToNeg) {
      // diff3 maximum for start
      let max_v = -Infinity;
      for (let i = Math.max(0, t_range1); i <= point_1; i++) {
        if (diff3[i] > max_v) { max_v = diff3[i]; t_head_start = i; }
      }

      // diff1 maximum for end refinement
      let max_d1 = -Infinity;
      let t_diff1_max = -1;
      for (let i = Math.max(0, t_range1); i <= Math.min(t_range2, L - 2); i++) {
        if (diff1[i] > max_d1) { max_d1 = diff1[i]; t_diff1_max = i; }
      }

      if (t_diff1_max !== -1) {
        let zero_crossing = -1;
        const searchEnd = Math.min(t_diff1_max + user_diff2_time_end, next_head, L - 2);
        for (let i = t_diff1_max; i <= searchEnd; i++) {
          if (diff1[i] <= 0) { zero_crossing = i; break; }
        }

        if (zero_crossing === -1) {
          let d2_zheng = -1;
          for (let i = t_diff1_max; i < Math.min(t_diff1_max + user_diff2_time_end, L - 2); i++) {
            if (diff2[i] >= 0) { d2_zheng = i; break; }
          }
          t_head_end = d2_zheng !== -1 ? d2_zheng : Math.min(t_diff1_max + user_diff2_time_end, L - 1);
        } else {
          t_head_end = zero_crossing;
        }
      }
    } else {
      // diff3 minimum for start
      let min_v = Infinity;
      for (let i = Math.max(0, t_range1); i <= point_1; i++) {
        if (diff3[i] < min_v) { min_v = diff3[i]; t_head_start = i; }
      }

      // diff1 minimum for end refinement
      let min_d1 = Infinity;
      let t_diff1_min = -1;
      for (let i = Math.max(0, t_range1); i <= Math.min(t_range2, L - 2); i++) {
        if (diff1[i] < min_d1) { min_d1 = diff1[i]; t_diff1_min = i; }
      }

      if (t_diff1_min !== -1) {
        let zero_crossing = -1;
        const searchEnd = Math.min(t_diff1_min + user_diff2_time_end, next_head, L - 2);
        for (let i = t_diff1_min; i <= searchEnd; i++) {
          if (diff1[i] >= 0) { zero_crossing = i; break; }
        }

        if (zero_crossing === -1) {
          let d2_fu = -1;
          for (let i = t_diff1_min; i < Math.min(t_diff1_min + user_diff2_time_end, L - 2); i++) {
            if (diff2[i] <= 0) { d2_fu = i; break; }
          }
          t_head_end = d2_fu !== -1 ? d2_fu : Math.min(t_diff1_min + user_diff2_time_end, L - 1);
        } else {
          t_head_end = zero_crossing;
        }
      }
    }

    if (t_head_start !== -1 && t_head_end !== -1) {
      const amp = wave_fault1[t_head_end] - wave_fault1[t_head_start];
      waveHeads.push({
        index: t_head_end,
        value: wave_fault1[t_head_end],
        amplitude: amp,
        startIdx: t_head_start,
        endIdx: t_head_end,
        startVal: wave_fault1[t_head_start],
        isManual: false,
        point1: point_1,
        point2: point_2
      });

      pairingSteps.push({
        k1,
        point1: point_1,
        point2: point_2,
        val1: diff2[point_1],
        val2: diff2[point_2],
        distance,
        isNear,
        isOppositeSign,
        status: 'success',
        description: `极值点 ${point_1} 与极值点 ${point_2} 配对成功：二阶差分极性交替（${isPosToNeg ? '正→负' : '负→正'}），极性转折间隔 ${distance} 点。标定波头起点于三阶极值第 ${t_head_start} 点，标定波头终点于一阶过零第 ${t_head_end} 点，波头跃变幅值差为 ${amp.toFixed(4)}。配对成功，k1 索引向后步进 2 点。`,
        t_head_start,
        t_head_end,
        amplitude: amp
      });
    } else {
      pairingSteps.push({
        k1,
        point1: point_1,
        point2: point_2,
        val1: diff2[point_1],
        val2: diff2[point_2],
        distance,
        isNear,
        isOppositeSign,
        status: 'skipped',
        description: `极值点 ${point_1} 与极值点 ${point_2} 间隔和极性满足配对，但在起点/终点子波提取阶段定位异常。配对放弃，k1 索引向后步进 2 点。`
      });
    }
    k1 += 2;
  }

  return {
    heads: waveHeads,
    debugWaves,
    debugInfo: {
      threshold: para_cali_start_doorsill,
      T_head,
      extrema: extremaList,
      pairingSteps
    }
  };
}

export function generateMockConditionData(pointsCount: number, faultPointIdx: number = 0) {
  const length = 500;
  const points = [];
  for (let p = 0; p < pointsCount; p++) {
    const phaseA = new Float32Array(length);
    const phaseB = new Float32Array(length);
    const phaseC = new Float32Array(length);
    
    // Arrival time differs by distance
    const arrivalTime = 200 + p * 30 + (Math.random() * 10 - 5);
    
    for (let i = 0; i < length; i++) {
      if (i < arrivalTime) {
        phaseA[i] = Math.sin(i * 0.1) * 0.1 + (Math.random() - 0.5) * 0.02;
        phaseB[i] = Math.sin(i * 0.1 - (2 * Math.PI) / 3) * 0.1 + (Math.random() - 0.5) * 0.02;
        phaseC[i] = Math.sin(i * 0.1 + (2 * Math.PI) / 3) * 0.1 + (Math.random() - 0.5) * 0.02;
      } else {
        const t = i - arrivalTime;
        const decay = Math.exp(-t * 0.03);
        const faultSign = (p === faultPointIdx) ? 1.5 : 0.8; // larger spike at fault
        
        // Simulating a ground fault on Phase A
        phaseA[i] = Math.sin(i * 0.1) * 0.1 + faultSign * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.05;
        phaseB[i] = Math.sin(i * 0.1 - (2 * Math.PI) / 3) * 0.1 + 0.2 * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.02;
        phaseC[i] = Math.sin(i * 0.1 + (2 * Math.PI) / 3) * 0.1 + 0.2 * decay * Math.sin(t * 0.5) + (Math.random() - 0.5) * 0.02;
      }
    }
    points.push({ id: `point-${p+1}`, name: `测点M(${p+1})`, phaseA, phaseB, phaseC });
  }
  return points;
}
