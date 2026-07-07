import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Download, Save, ZoomIn, Target, RefreshCcw, Hand, Check, ChevronDown, X, Settings, Crosshair, Info, Loader2, Eraser, ArrowDown, ArrowDownToLine, Database, Activity } from 'lucide-react';
import { LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot, ReferenceArea, ReferenceLine, Area } from 'recharts';
import { 
  addNoise, 
  karenbauerTransform, 
  teagerEnergyOperator, 
  detectWaveHead, 
  calibrateWaveSequence,
  calibrateWaveSequenceUserUpload,
  generateMockConditionData,
  doubleDifference,
  discreteWaveletTransform,
  waveFrontDetect,
  clarkeTransform,
  removePowerFrequency,
  multiDifference,
  lttbDownsample
} from '../lib/signal';
import { read as readMat } from 'mat-for-js';
import { saveProject, getAllProjectsMetadata, getProjectById, deleteProject, SavedProject, onProjectUpdate, getStorageEstimate } from '../lib/projectStorage';
import { Card } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useSettings, matchShortcut } from '../contexts/SettingsContext';

type ProcessMode = 'karenbauer' | 'denoise' | 'calibration';
type WindowCategory = 'original' | 'karenbauer' | 'noise' | 'denoise' | 'teo' | 'calibration' | 'differential' | 'user-debug' | 'pso-compare';
type SingleWaveformType = 'A' | 'B' | 'C' | 'alpha' | 'beta' | '0' | 'teo' | 'differential' | 'pso-compare';

interface WindowConfig {
  id: string;
  type: WindowCategory;
}

const getWindowLines = (type: WindowCategory, colors: Record<string, string>) => {
  switch (type) {
    case 'original': return [{ key: 'A', color: colors.phaseA }, { key: 'B', color: colors.phaseB }, { key: 'C', color: colors.phaseC }];
    case 'karenbauer': return [{ key: 'alpha', color: colors.alpha }, { key: 'beta', color: colors.beta }, { key: 'zero', color: colors.zero }];
    case 'noise':
    case 'denoise': return [{ key: 'value', color: colors.alpha }];
    case 'pso-compare': return [{ key: 'modal', color: '#10b981' }, { key: 'reconstructed', color: '#f59e0b' }, { key: 'filtered', color: '#3b82f6' }];
    case 'teo':
    case 'calibration': return [{ key: 'teo', color: colors.teo }];
    case 'differential': return [{ key: 'differential', color: colors.alpha }]; // using alpha color for now
    case 'user-debug': return [{ key: 'value', color: colors.alpha }];
  }
};

const getCalibrationLineColor = (colors: Record<string, string>) => {
  return colors.calibration;
};

interface WavePoint {
  id: string;
  name: string;
  phaseA: Float32Array;
  phaseB: Float32Array;
  phaseC: Float32Array;
  // Processed data
  karenbauer?: { wave_0: Float32Array, wave_alpha: Float32Array, wave_beta: Float32Array };
  denoised?: { wave_0: Float32Array, wave_alpha: Float32Array, wave_beta: Float32Array };
  psoErrors?: { wave_0: number, wave_alpha: number, wave_beta: number };
  psoParams?: {
    wave_0?: { A: number, f: number, theta: number, error: number },
    wave_alpha?: { A: number, f: number, theta: number, error: number },
    wave_beta?: { A: number, f: number, theta: number, error: number }
  };
  calibration?: { 
    wave_teo?: Float32Array; 
    heads: { index: number; value: number; amplitude?: number; startIdx?: number; endIdx?: number; isManual?: boolean; labelPosition?: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' }[]; 
    initialHeads?: { index: number; value: number; amplitude?: number; startIdx?: number; endIdx?: number; isManual?: boolean; labelPosition?: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' }[];
    sequenceHeads?: { index: number; value: number; amplitude?: number; startIdx?: number; endIdx?: number; isManual?: boolean; labelPosition?: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' }[];
    isManual?: boolean;
    debugInfo?: any;
    debugWaves?: {
      diff1: Float32Array;
      diff2: Float32Array;
      diff3: Float32Array;
      original: Float32Array;
    };
  };
}

interface MatVariable {
  name: string;
  data: number[][];
}

function writeLevel5MatFile(variables: MatVariable[]): ArrayBuffer {
  // 1. Calculate total size
  let totalSize = 128; // Header is 128 bytes
  
  const varSpecs = variables.map(v => {
    const mrows = v.data.length;
    const ncols = v.data[0]?.length || 0;
    const namlen = v.name.length;
    const paddedNamlen = Math.ceil(namlen / 8) * 8;
    const dataSize = mrows * ncols * 8;
    const subElementsSize = 16 + 16 + (8 + paddedNamlen) + (8 + dataSize);
    const totalVarSize = 8 + subElementsSize;
    return {
      name: v.name,
      data: v.data,
      mrows,
      ncols,
      namlen,
      paddedNamlen,
      dataSize,
      subElementsSize,
      totalVarSize
    };
  });
  
  for (const spec of varSpecs) {
    totalSize += spec.totalVarSize;
  }
  
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);
  
  // 2. Write 128-byte Header
  // Descriptive text (116 bytes)
  const headerText = "MATLAB 5.0 MAT-file, Created by WaveformAnalyzer, Date: 2026-07-01";
  for (let i = 0; i < Math.min(headerText.length, 116); i++) {
    uint8[i] = headerText.charCodeAt(i);
  }
  // Pad with spaces up to 116
  for (let i = headerText.length; i < 116; i++) {
    uint8[i] = 32; // Space
  }
  
  // Subsystem data offset (8 bytes) at 116 - all zeros
  // Version (2 bytes) at 124 - 0x0100 (little endian: 0x00, 0x01)
  view.setUint16(124, 0x0100, true);
  
  // Endian indicator (2 bytes) at 126 - "IM" (0x49, 0x4D) - Little Endian
  uint8[126] = 0x49; // 'I'
  uint8[127] = 0x4D; // 'M'
  
  // 3. Write variables
  let offset = 128;
  for (const spec of varSpecs) {
    // Write miMATRIX Tag (Type 14, length subElementsSize)
    view.setInt32(offset, 14, true); // type
    view.setInt32(offset + 4, spec.subElementsSize, true); // length
    offset += 8;
    
    // Sub-element 1: Array Flags
    view.setInt32(offset, 6, true); // type (miUINT32)
    view.setInt32(offset + 4, 8, true); // length
    // Value: class=6 (double), flags=0 (real)
    view.setUint8(offset + 8, 6); // Array class (double)
    view.setUint8(offset + 9, 0); // Flags
    view.setUint16(offset + 10, 0, true); // Undefined
    view.setUint32(offset + 12, 0, true); // Undefined
    offset += 16;
    
    // Sub-element 2: Dimensions
    view.setInt32(offset, 5, true); // type (miINT32)
    view.setInt32(offset + 4, 8, true); // length
    view.setInt32(offset + 8, spec.mrows, true); // mrows
    view.setInt32(offset + 12, spec.ncols, true); // ncols
    offset += 16;
    
    // Sub-element 3: Name
    view.setInt32(offset, 1, true); // type (miINT8)
    view.setInt32(offset + 4, spec.namlen, true); // actual length of name
    // Write name string
    for (let i = 0; i < spec.namlen; i++) {
      uint8[offset + 8 + i] = spec.name.charCodeAt(i);
    }
    // Pad name with zeros
    for (let i = spec.namlen; i < spec.paddedNamlen; i++) {
      uint8[offset + 8 + i] = 0;
    }
    offset += 8 + spec.paddedNamlen;
    
    // Sub-element 4: Real Part
    view.setInt32(offset, 9, true); // type (miDOUBLE)
    view.setInt32(offset + 4, spec.dataSize, true); // length
    offset += 8;
    
    // Write double data in Column-Major order
    for (let col = 0; col < spec.ncols; col++) {
      for (let row = 0; row < spec.mrows; row++) {
        view.setFloat64(offset, spec.data[row][col], true);
        offset += 8;
      }
    }
  }
  
  return buffer;
}

interface Condition {
  id: string;
  name: string;
  points: WavePoint[];
}

const INITIAL_WINDOW_OPTIONS: { label: string, value: WindowCategory }[] = [
  { label: '原始波形', value: 'original' },
  { label: '相模变换', value: 'karenbauer' },
  { label: '滤除工频', value: 'denoise' },
  { label: '工频重构对比', value: 'pso-compare' },
  { label: '差分信号', value: 'differential' },
  { label: '波头标定', value: 'calibration' }
];

const SEQUENCE_WINDOW_OPTIONS: { label: string, value: WindowCategory }[] = [
  { label: '原始波形', value: 'original' },
  { label: '相模变换', value: 'karenbauer' },
  { label: '滤除工频', value: 'denoise' },
  { label: '工频重构对比', value: 'pso-compare' },
  { label: '差分信号', value: 'differential' },
  { label: '波头标定', value: 'calibration' }
];

export function getWindowOptions(detType: string): { label: string, value: WindowCategory }[] {
  const base: { label: string, value: WindowCategory }[] = [
    { label: '原始波形', value: 'original' },
    { label: '相模变换', value: 'karenbauer' },
  ];
  if (detType === 'sequence-user-upload') {
    base.push({ label: '滤除工频', value: 'denoise' });
    base.push({ label: '工频重构对比', value: 'pso-compare' });
  }
  base.push({ label: '差分信号', value: 'differential' });
  if (detType === 'sequence-user-upload') {
    base.push({ label: '算法调试', value: 'user-debug' });
  }
  base.push({ label: '波头标定', value: 'calibration' });
  return base;
}

export function WaveformAnalyzer({ pointsCountFromTopology = 4, machineListFromTopology = [] }: { pointsCountFromTopology?: number, machineListFromTopology?: number[] }) {
  const { settings, updateSettings, updateCategorySettings } = useSettings();

  const [conditions, setConditions] = useState<Condition[]>([]);
  const [currentProjectName, setCurrentProjectName] = useState('');
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showDataCenter, setShowDataCenter] = useState(false);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
  const [savedProjects, setSavedProjects] = useState<Omit<SavedProject, 'data' | 'topology'>[]>([]);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const clearAllData = () => {
    setConditions([]);
    setCurrentProjectName("");
    setCurrentProjectId(null);
    setHasProcessed(false);
    setActiveConditionIdx(0);
    setActivePointId(null);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIdx(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    resetZoom();
    resetListZoom();
    window.dispatchEvent(new CustomEvent('APP_PROJECT_CLEARED'));
  };


  // Prevent browser zoom and handle global events
  useEffect(() => {
    const handleGlobalWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };
    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleGlobalWheel);
  }, []);

  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [activeConditionIdx, setActiveConditionIdx] = useState<number>(0);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [debugActiveTab, setDebugActiveTab] = useState<'pairing' | 'extrema'>('pairing');
  const [hoveredDebugIndex, setHoveredDebugIndex] = useState<number | null>(null);
  const [selectedDebugStep, setSelectedDebugStep] = useState<number | null>(null);
  
  const [isGuidanceError, setIsGuidanceError] = useState(false);
  const [guidanceMsg, setGuidanceMsg] = useState("提示: 双击波形图可自适应显示。在分析模式下，可通过点击并拖动标注点来调整位置。支持多工况、多测点数据快速切换对比。");

  const lastErrorTime = useRef<number>(0);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail && e.detail.message) {
        const now = Date.now();
        const updateMessage = () => {
          setGuidanceMsg(e.detail.message);
          setIsGuidanceError(!!e.detail.isError);
          if (e.detail.isError) {
            lastErrorTime.current = Date.now();
          }
        };

        const timeSinceLastError = now - lastErrorTime.current;
        if (!e.detail.isError && timeSinceLastError < 5000) {
          // If trying to show a normal message while a red one is still in its 5s window
          setTimeout(updateMessage, 5000 - timeSinceLastError);
        } else {
          updateMessage();
        }
      }
    };
    window.addEventListener('APP_GUIDANCE_MESSAGE', handler);
    return () => window.removeEventListener('APP_GUIDANCE_MESSAGE', handler);
  }, [isGuidanceError]);

  // Windows Management
  const [activeWindows, setActiveWindows] = useState<WindowConfig[]>([
    { id: 'win-orig', type: 'original' }
  ]);
  const [hiddenLines, setHiddenLines] = useState<Record<string, string[]>>({});
  
  const [windowMenuPos, setWindowMenuPos] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const handleToggle = (e: any) => {
       if (windowMenuPos) {
          setWindowMenuPos(null);
       } else {
          setWindowMenuPos({ x: e.detail.x, y: e.detail.y });
       }
    };
    window.addEventListener('toggleAppWindowMenu', handleToggle);
    return () => window.removeEventListener('toggleAppWindowMenu', handleToggle);
  }, [windowMenuPos]);

  useEffect(() => {
    const handleToggleWave = (e: any) => {
      if (e.detail?.type) {
        toggleWindow(e.detail.type as WindowCategory);
      }
    };
    window.addEventListener('toggleWaveformWindow', handleToggleWave);
    return () => window.removeEventListener('toggleWaveformWindow', handleToggleWave);
  }, [activeWindows]);

  useEffect(() => {
    const handleClick = () => setWindowMenuPos(null);
    if (windowMenuPos) {
       document.addEventListener('click', handleClick);
       return () => document.removeEventListener('click', handleClick);
    }
  }, [windowMenuPos]);

  const toggleLineVisibility = (winId: string, lineKey: string) => {
    setHiddenLines(prev => {
      const current = prev[winId] || [];
      const isNowHidden = !current.includes(lineKey);
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
        detail: { message: `【相线可见性】相线 [ ${lineKey.toUpperCase()} 相 ] 已成功${isNowHidden ? '隐藏' : '显示'}。您可以根据需要精简显示以深入分析。` } 
      }));
      if (current.includes(lineKey)) {
        return { ...prev, [winId]: current.filter(k => k !== lineKey) };
      } else {
        return { ...prev, [winId]: [...current, lineKey] };
      }
    });
  };

  const [middleWidth, setMiddleWidth] = useState(settings.faultDetection.panelWidths.leftSidebar);
  const isResizingRef = useRef(false);
  const resizeState = useRef<{ startX: number, startWidth: number } | null>(null);

  const middlePanelRef = useRef<HTMLDivElement>(null);
  
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const actualWidth = middlePanelRef.current?.getBoundingClientRect().width || middleWidth;
    resizeState.current = { startX: e.clientX, startWidth: actualWidth };
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'col-resize';
  };

  const stopResizing = () => {
    isResizingRef.current = false;
    resizeState.current = null;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResizing);
    document.body.style.cursor = 'default';
  };

  const handleResize = (e: MouseEvent) => {
    if (!isResizingRef.current || !resizeState.current) return;
    const { startX, startWidth } = resizeState.current;
    let newWidth = startWidth + (e.clientX - startX);
    if (newWidth < 300) newWidth = 300;
    const offset = startX - startWidth;
    const maxWidth = window.innerWidth - offset - 300;
    if (newWidth > maxWidth) newWidth = maxWidth;
    setMiddleWidth(newWidth);
  };

  const toggleWindow = (type: WindowCategory) => {
    const existing = activeWindows.find(w => w.type === type);
    if (existing) {
       if (activeWindows.length > 1) {
          setActiveWindows(activeWindows.filter(w => w.id !== existing.id));
       }
    } else {
       if (activeWindows.length < 3) {
          setActiveWindows([...activeWindows, { id: `win-${Date.now()}`, type }]);
       } else {
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `最多允许同时放置3列窗口`, isError: true } }));
       }
    }
  };

  const updateWindowType = (id: string, newType: WindowCategory) => {
    setActiveWindows(activeWindows.map(w => w.id === id ? { ...w, type: newType } : w));
    const currentWindowOptions = getWindowOptions(detectionType);
    const label = currentWindowOptions.find(o => o.value === newType)?.label || newType;
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: `【视图模式切换】波形视窗已成功切换为：[ ${label} ]。系统已即时更新该视窗对应的行波信号波谱。` } 
    }));
  };

  const removeWindow = (id: string) => {
    if (activeWindows.length > 1) {
      setActiveWindows(activeWindows.filter(w => w.id !== id));
    }
  };

  const [processMode, setProcessMode] = useState<ProcessMode>('karenbauer');
  const [selectedModulus, setSelectedModulus] = useState<'alpha' | 'beta' | 'zero'>('alpha');
  const [singleWaveType, setSingleWaveType] = useState<string>('original');
  const [hasProcessed, setHasProcessed] = useState(false);
  const [analysisHiddenLines, setAnalysisHiddenLines] = useState<string[]>([]);
  
  // Settings
  const [conditionsCount, setConditionsCount] = useState(1);
  const [pointsCount, setPointsCount] = useState(pointsCountFromTopology); // Inherited from module 1
  
  useEffect(() => {
    setPointsCount(pointsCountFromTopology);
  }, [pointsCountFromTopology]);
  const [samplingFreq, setSamplingFreq] = useState(settings.faultDetection.defaultSamplingFrequency);

  // Algorithm Settings
  const [detectionType, setDetectionType] = useState(settings.faultDetection.defaultDetectionAlgorithm);
  const detectionTypeRef = useRef(detectionType);
  useEffect(() => {
    detectionTypeRef.current = detectionType;
  }, [detectionType]);
  const handleDetectionTypeChange = (v: 'initial' | 'sequence' | 'sequence-user-upload') => {
    setDetectionType(v);
    
    // Reset window selection if no longer valid
    const validOptions = getWindowOptions(v);
    const validValues = validOptions.map(o => o.value);
    
    if (!validValues.includes(singleWaveType as WindowCategory)) {
      setSingleWaveType('original');
    }
    
    setActiveWindows(prev => prev.map(win => {
      if (!validValues.includes(win.type)) {
        return { ...win, type: 'original' };
      }
      return win;
    }));

    setConditions(prevConditions => 
      prevConditions.map(cond => ({
        ...cond,
        points: cond.points.map(point => {
          if (!point.calibration) return point;
          const activeHeads = v === 'initial' 
            ? (point.calibration.initialHeads || (point.calibration.heads ? point.calibration.heads.slice(0, 1) : [])) 
            : (point.calibration.sequenceHeads || (point.calibration.heads || []));
          return {
            ...point,
            calibration: {
              ...point.calibration,
              heads: activeHeads
            }
          };
        })
      }))
    );
  };
  const [transformType, setTransformType] = useState<'karenbauer' | 'clarke'>('karenbauer');
  const [processingMethod, setProcessingMethod] = useState(settings.faultDetection.defaultCalibrationAlgorithm);
  const [waveletType, setWaveletType] = useState<string>(settings.faultDetection.defaultWavelet);
  const [isCalcDataOpen, setIsCalcDataOpen] = useState(false);
  const [psoActiveTab, setPsoActiveTab] = useState<'errors' | 'parameters'>('errors');
  const [isCalculating, setIsCalculating] = useState(false);
  
  // PSO & Fitting Window parameters are now managed in settings
  const psoPopulation = settings.faultDetection.psoPopulation;
  const psoIterations = settings.faultDetection.psoIterations;
  const fittingWindowLen = Math.floor((samplingFreq / 50) * (settings.faultDetection.fittingWindowPercent / 100));

  const [faultTimeSec, setFaultTimeSec] = useState(0.0002); // 200us in the mock data
  
  // Wave Head Data Display State
  const [matrixDisplayType, setMatrixDisplayType] = useState<'time' | 'amplitude'>('time');
  const [bottomPanelHeight, setBottomPanelHeight] = useState(300); // Initial height for wave head data
  const [manualCalibratingPointId, setManualCalibratingPointId] = useState<string | null>(null);
  const [backupCalibrations, setBackupCalibrations] = useState<Record<string, { heads: { index: number; value: number }[]; isManual?: boolean }>>({});
  const [isCalibratingDrag, setIsCalibratingDrag] = useState(false);
  const isResizingBottomRef = useRef(false);

  // Overwrite and Export Modal States
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [overwriteOption, setOverwriteOption] = useState<'all' | 'protect_manual'>('protect_manual');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${settings.faultDetection.exportVariableNaming}_${yyyy}${mm}${dd}`;
  });
  const [exportWaveDataVar, setExportWaveDataVar] = useState('wave_data');
  const [exportWaveHeadsVar, setExportWaveHeadsVar] = useState('wave_heads');
  const [exportWaveHeadsManualVar, setExportWaveHeadsManualVar] = useState('wave_heads_manual');

  // Draggable offsets for modals
  const [overwritePos, setOverwritePos] = useState({ x: 0, y: 0 });
  const [exportPos, setExportPos] = useState({ x: 0, y: 0 });
  const [modalDragState, setModalDragState] = useState<{type: 'overwrite' | 'export', startX: number, startY: number, startPosX: number, startPosY: number} | null>(null);

  // Sync with App
  useEffect(() => {
    const handleRequest = () => {
      let finalConditionsToSave = conditions;

      if (manualCalibratingPointId) {
        // Automatically commit active manual calibration before saving/providing data
        finalConditionsToSave = conditions.map(cond => ({
          ...cond,
          points: cond.points.map(point => {
            if (point.id === manualCalibratingPointId) {
              const isManual = (point.calibration?.heads && point.calibration.heads.length > 0) ? true : point.calibration?.isManual;
              const initialHeads = detectionType === 'initial' ? (point.calibration?.heads || []) : (point.calibration?.initialHeads || []);
              const sequenceHeads = detectionType === 'sequence' ? (point.calibration?.heads || []) : (point.calibration?.sequenceHeads || []);
              return {
                ...point,
                calibration: point.calibration ? {
                  ...point.calibration,
                  isManual,
                  initialHeads,
                  sequenceHeads
                } : undefined
              };
            }
            return point;
          })
        }));
        
        // Also update local state so the UI stays in sync after saving
        setConditions(finalConditionsToSave);
        setManualCalibratingPointId(null);
      }

      window.dispatchEvent(new CustomEvent('COMPONENT_PROVIDE_DATA', {
        detail: {
          type: 'waveform',
          data: {
            conditions: finalConditionsToSave,
            currentProjectName
          }
        }
      }));
    };
    
    const handleLoad = (e: any) => {
      const project = e.detail;
      if (project.data) {
        setIsImporting(true);
        setConditions([]); // delete existing waveform first as requested
        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
          detail: { message: `【项目导入中】正在清空旧数据并解析导入项目 [ ${project.name} ] 的多维行波数据，请稍候...` } 
        }));

        setTimeout(() => {
          const loadedConditions = project.data;
          const hasCalibratedHeads = loadedConditions.some((cond: any) => 
            cond.points.some((point: any) => 
              point.calibration && (
                (point.calibration.heads && point.calibration.heads.length > 0) ||
                (point.calibration.initialHeads && point.calibration.initialHeads.length > 0) ||
                (point.calibration.sequenceHeads && point.calibration.sequenceHeads.length > 0)
              )
            )
          );

          let finalConditions = loadedConditions;
          if (hasCalibratedHeads) {
            finalConditions = loadedConditions.map((cond: any) => ({
              ...cond,
              points: cond.points.map((point: any) => {
                if (!point.calibration) return point;
                const activeHeads = detectionTypeRef.current === 'initial' 
                  ? (point.calibration.initialHeads || (point.calibration.heads ? point.calibration.heads.slice(0, 1) : [])) 
                  : (point.calibration.sequenceHeads || (point.calibration.heads || []));
                
                const initialHeads = point.calibration.initialHeads || (point.calibration.heads ? point.calibration.heads.slice(0, 1) : []);
                const sequenceHeads = point.calibration.sequenceHeads || (point.calibration.heads || []);

                return {
                  ...point,
                  calibration: {
                    ...point.calibration,
                    heads: activeHeads,
                    initialHeads,
                    sequenceHeads
                  }
                };
              })
            }));

            setHasProcessed(true);
            setSingleWaveType('calibration');
          } else {
            setHasProcessed(false);
            setSingleWaveType('original');
          }

          setConditions(finalConditions);
          setConditionsCount(finalConditions.length);
          setCurrentProjectName(project.name);
          setCurrentProjectId(project.id);
          setActiveConditionIdx(0);
          
          if (finalConditions.length > 0 && finalConditions[0].points.length > 0) {
            setActivePointId(finalConditions[0].points[0].id);
          } else {
            setActivePointId(null);
          }
          
          setAnalysisHiddenLines([]);
          setAnnotations([]);
          setHistory([[]]);
          setHistoryIdx(0);
          setActiveWindows([{ id: 'win-orig', type: hasCalibratedHeads ? 'calibration' : 'original' }]);
          setHiddenLines({});
          
          setIsImporting(false);
          triggerTransitionAnimation();
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
            detail: { message: `【项目导入成功】项目 [ ${project.name} ] 已成功载入！共加载了 ${finalConditions.length} 组独立电工况。您可双击或拖拽曲线区域查看各故障相线（A/B/C相）的局部高频信号突变特征。` } 
          }));
        }, 1200); // 1.2s delay to show importing state beautifully
      }
    };

    const handleProjectSaving = () => {
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
        detail: { message: `自动更新保存中...` } 
      }));
    };

    const handleProjectSaved = (e: any) => {
      setCurrentProjectId(e.detail.id);
      if (e.detail.name) {
        setCurrentProjectName(e.detail.name);
      }
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
        detail: { message: `✓ 项目 "${e.detail.name || '新项目'}" 已于 ${new Date().toLocaleTimeString()} 自动更新并保存成功` } 
      }));
    };

    window.addEventListener('APP_REQUEST_DATA', handleRequest);
    window.addEventListener('APP_LOAD_DATA', handleLoad);
    window.addEventListener('APP_PROJECT_SAVING', handleProjectSaving);
    window.addEventListener('APP_PROJECT_SAVED', handleProjectSaved);

    return () => {
      window.removeEventListener('APP_REQUEST_DATA', handleRequest);
      window.removeEventListener('APP_LOAD_DATA', handleLoad);
      window.removeEventListener('APP_PROJECT_SAVING', handleProjectSaving);
      window.removeEventListener('APP_PROJECT_SAVED', handleProjectSaved);
    };
  }, [conditions, currentProjectName, manualCalibratingPointId, detectionType]);

  useEffect(() => {
    setProcessingMethod(settings.faultDetection.defaultCalibrationAlgorithm);
    setWaveletType(settings.faultDetection.defaultWavelet);
  }, [settings.faultDetection.defaultCalibrationAlgorithm, settings.faultDetection.defaultWavelet]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!modalDragState) return;
      const dx = e.clientX - modalDragState.startX;
      const dy = e.clientY - modalDragState.startY;
      
      if (modalDragState.type === 'overwrite') {
        let newX = Math.max(-window.innerWidth/2, Math.min(modalDragState.startPosX + dx, window.innerWidth/2));
        let newY = Math.max(-window.innerHeight/2, Math.min(modalDragState.startPosY + dy, window.innerHeight/2));
        setOverwritePos({ x: newX, y: newY });
      } else if (modalDragState.type === 'export') {
        const maxX = Math.max(0, (window.innerWidth - 450) / 2);
        const maxY = Math.max(0, (window.innerHeight - 500) / 2);
        let newX = modalDragState.startPosX + dx;
        let newY = modalDragState.startPosY + dy;
        newX = Math.max(-maxX, Math.min(newX, maxX));
        newY = Math.max(-maxY, Math.min(newY, maxY));
        setExportPos({ x: newX, y: newY });
      }
    };
    const handleMouseUp = () => {
      setModalDragState(null);
    };

    if (modalDragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [modalDragState]);

  // Selected conditions to export
  const [selectedExportConditions, setSelectedExportConditions] = useState<number[]>([]);

  useEffect(() => {
    if (showExportModal) {
      setSelectedExportConditions(conditions.map((_, i) => i));
      setExportPos({ x: 0, y: 0 }); // reset position on open
    }
  }, [showExportModal, conditions]);

  useEffect(() => {
    if (showOverwriteModal) {
      setOverwritePos({ x: 0, y: 0 }); // reset position on open
    }
  }, [showOverwriteModal]);

  const getActiveYValues = (pt: any, waveType: string, hiddenLines: string[]): number[] => {
    const vals: number[] = [];
    if (waveType === 'original') {
      if (!hiddenLines.includes('A') && pt.A !== undefined) vals.push(pt.A);
      if (!hiddenLines.includes('B') && pt.B !== undefined) vals.push(pt.B);
      if (!hiddenLines.includes('C') && pt.C !== undefined) vals.push(pt.C);
    } else if (waveType === 'karenbauer') {
      if (!hiddenLines.includes('alpha') && pt.alpha !== undefined) vals.push(pt.alpha);
      if (!hiddenLines.includes('beta') && pt.beta !== undefined) vals.push(pt.beta);
      if (!hiddenLines.includes('zero') && pt.zero !== undefined) vals.push(pt.zero);
    } else if (waveType === 'differential') {
      if (!hiddenLines.includes('value') && pt.value !== undefined) vals.push(pt.value);
      if (!hiddenLines.includes('diff1') && pt.diff1 !== undefined) vals.push(pt.diff1);
      if (!hiddenLines.includes('diff2') && pt.diff2 !== undefined) vals.push(pt.diff2);
    } else {
      if (pt.value !== undefined) vals.push(pt.value);
    }
    return vals;
  };

  const getCalibrationY = (point: WavePoint, index: number, waveType: string, curveKey?: string): number => {
    const roundedIndex = Math.round(index);

    if (!point) return 0;
    if (curveKey) {
      if (curveKey === 'A') return point.phaseA[roundedIndex] ?? 0;
      if (curveKey === 'B') return point.phaseB[roundedIndex] ?? 0;
      if (curveKey === 'C') return point.phaseC[roundedIndex] ?? 0;
      
      let resAlpha, resBeta, resZero;
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      resAlpha = res.wave_alpha;
      resBeta = res.wave_beta;
      resZero = res.wave_0;
      
      if (curveKey === 'alpha') return resAlpha[roundedIndex] ?? 0;
      if (curveKey === 'beta') return resBeta[roundedIndex] ?? 0;
      if (curveKey === 'zero') return resZero[roundedIndex] ?? 0;
      
      if (point.calibration?.debugWaves) {
        const dw = point.calibration.debugWaves;
        if (curveKey === 'original') return dw.original[roundedIndex] ?? 0;
        if (curveKey === 'diff1') return dw.diff1[roundedIndex] ?? 0;
        if (curveKey === 'diff2') return dw.diff2[roundedIndex] ?? 0;
        if (curveKey === 'diff3') return dw.diff3[roundedIndex] ?? 0;
      }

      const baseWave = selectedModulus === 'beta' ? resBeta : selectedModulus === 'zero' ? resZero : resAlpha;
      if (curveKey === 'value') return baseWave[roundedIndex] ?? 0;
      
      const diffs = multiDifference(baseWave);
      if (curveKey === 'diff1') return diffs.diff1[roundedIndex] ?? 0;
      if (curveKey === 'diff2') return diffs.diff2[roundedIndex] ?? 0;
    }
    if (waveType === 'original') {
      if (!analysisHiddenLines.includes('A')) return point.phaseA[roundedIndex] ?? 0;
      if (!analysisHiddenLines.includes('B')) return point.phaseB[roundedIndex] ?? 0;
      if (!analysisHiddenLines.includes('C')) return point.phaseC[roundedIndex] ?? 0;
      return point.phaseA[roundedIndex] ?? 0;
    } else if (waveType === 'calibration') {
      return point.phaseA[roundedIndex] ?? 0;
    } else if (waveType === 'karenbauer') {
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      if (!analysisHiddenLines.includes('alpha')) return res.wave_alpha[roundedIndex] ?? 0;
      if (!analysisHiddenLines.includes('beta')) return res.wave_beta[roundedIndex] ?? 0;
      if (!analysisHiddenLines.includes('zero')) return res.wave_0[roundedIndex] ?? 0;
      return res.wave_alpha[roundedIndex] ?? 0;
    } else if (waveType === 'teo') {
      // Use cached processed wave if it exists
      if (point.calibration?.wave_teo) {
        return point.calibration.wave_teo[roundedIndex] ?? 0;
      }
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      const baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
      let pWave: Float32Array | number[];
      if (processingMethod === 'teo') pWave = teagerEnergyOperator(baseWave);
      else if (processingMethod === 'wavelet') pWave = discreteWaveletTransform(baseWave, waveletType);
      else pWave = doubleDifference(baseWave);
      return pWave[roundedIndex] ?? 0;
    } else if (waveType === 'denoise') {
      // Use cached denoised wave if it exists
      if (point.denoised) {
        let pWave: Float32Array | number[];
        if (selectedModulus === 'beta') pWave = point.denoised.wave_beta;
        else if (selectedModulus === 'zero') pWave = point.denoised.wave_0;
        else pWave = point.denoised.wave_alpha;
        return pWave[roundedIndex] ?? 0;
      }
      // No fallback calculation for tooltip/data retrieval
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      const baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
      return baseWave[roundedIndex] ?? 0;
    } else if (waveType === 'differential') {
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      const baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
      const pWave = doubleDifference(baseWave);
      return pWave[roundedIndex] ?? 0;
    } else {
      const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
      const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
      const baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
      return baseWave[roundedIndex] ?? 0;
    }
  };

  const getInterpolatedValue = (x: number, waveType: string, curveKey: string): number => {
    if (!focusData || focusData.length === 0) return 0;
    if (x <= focusData[0].time) {
      return focusData[0][curveKey] ?? 0;
    }
    if (x >= focusData[focusData.length - 1].time) {
      return focusData[focusData.length - 1][curveKey] ?? 0;
    }
    
    let low = 0;
    let high = focusData.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (focusData[mid].time < x) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    const p1 = focusData[low - 1];
    const p2 = focusData[low];
    if (!p1 || !p2) return 0;
    
    const t1 = p1.time;
    const t2 = p2.time;
    const v1 = p1[curveKey] ?? 0;
    const v2 = p2[curveKey] ?? 0;
    
    if (t2 === t1) return v1;
    return v1 + ((x - t1) / (t2 - t1)) * (v2 - v1);
  };
  
  // Right side Zoom state
  const [xDomain, setXDomain] = useState<[number, number] | ['dataMin', 'dataMax']>(['dataMin', 'dataMax']);
  const [yDomain, setYDomain] = useState<[number, number] | ['auto', 'auto']>(['auto', 'auto']);
  const [diffYDomains, setDiffYDomains] = useState<Record<string, [number, number] | ['auto', 'auto']>>({});
  const [listXDomain, setListXDomain] = useState<[number, number] | ['dataMin', 'dataMax']>(['dataMin', 'dataMax']);
  const [cursorMode, setCursorMode] = useState<'zoom' | 'data'>('zoom');
  const [isPanning, setIsPanning] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [dragStartPos, setDragStartPos] = useState<{ x: number, y: number } | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState<{ x: number, y: number } | null>(null);
  
  type Annotation = {
    id: string;
    time: number;
    value: number;
    originalIndex: number;
    curveKey: string;
    color: string;
    labelPosition?: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right';
  };
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [history, setHistory] = useState<Annotation[][]>([[]]);
  const [historyIdx, setHistoryIdx] = useState(0);
  const [hoverDataPoint, setHoverDataPoint] = useState<Omit<Annotation, 'id'> | null>(null);
  const [draggingAnnotationId, setDraggingAnnotationId] = useState<string | null>(null);
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [draggingCalibrationLabel, setDraggingCalibrationLabel] = useState(false);
  const [activeCalibratingPoint, setActiveCalibratingPoint] = useState<{ time: number; value: number; curveKey: string; color: string; originalIndex: number } | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [chartAnimationMode, setChartAnimationMode] = useState<'none' | 'transition' | 'draw'>('none');
  
  const [showControls, setShowControls] = useState(false);
  const [animationKey, setAnimationKey] = useState(0);
  
  const triggerDrawAnimation = () => {
    setChartAnimationMode('draw');
    setAnimationKey(prev => prev + 1);
    setTimeout(() => setChartAnimationMode('none'), 1000);
  };

  const triggerTransitionAnimation = () => {
    setChartAnimationMode('transition');
    setTimeout(() => setChartAnimationMode('none'), 500);
  };

  const resetWaveformView = () => {
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIdx(0);
    setXDomain(['dataMin', 'dataMax']);
    setYDomain(['auto', 'auto']);
  };
  
  const lastMouseActivity = useRef<number>(Date.now());
  const lastMousePos = useRef<{x: number, y: number}>({x: 0, y: 0});
  const [dataVersion, setDataVersion] = useState(0);

  const timePrecision = Math.max(0, Math.round(Math.log10(samplingFreq)));
  
  const chartRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const panStateRef = useRef<{ 
    startX: number, 
    startY: number, 
    startDomainX: [number, number], 
    startDomainY: [number, number],
    targetSubplotKey: string | null
  } | null>(null);

  const commitAnnotations = (newAnns: Annotation[]) => {
    const newHistory = history.slice(0, historyIdx + 1);
    newHistory.push([...newAnns]);
    setHistory(newHistory);
    setHistoryIdx(newHistory.length - 1);
    setAnnotations(newAnns);
  };

  const undoAnnotations = () => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setAnnotations(history[newIdx]);
    }
  };

  const redoAnnotations = () => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1;
      setHistoryIdx(newIdx);
      setAnnotations(history[newIdx]);
    }
  };

  const lastDTime = useRef<number>(0);
  const toggleModeTimeout = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to global system-level shortcuts triggered from App.tsx
  useEffect(() => {
    const handleShortcutImport = () => {
      fileInputRef.current?.click();
    };

    const handleShortcutCalibrate = () => {
      if (conditions.length > 0) {
        handleProcessAlgorithms();
      } else {
        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请先导入数据！`, isError: true } }));
      }
    };

    const handleShortcutExport = () => {
      if (conditions.length > 0) {
        setShowExportModal(true);
      } else {
        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请先导入数据！`, isError: true } }));
      }
    };

    window.addEventListener('APP_SHORTCUT_IMPORT_DATA', handleShortcutImport);
    window.addEventListener('APP_SHORTCUT_CALIBRATE', handleShortcutCalibrate);
    window.addEventListener('APP_SHORTCUT_EXPORT_RESULTS', handleShortcutExport);

    return () => {
      window.removeEventListener('APP_SHORTCUT_IMPORT_DATA', handleShortcutImport);
      window.removeEventListener('APP_SHORTCUT_CALIBRATE', handleShortcutCalibrate);
      window.removeEventListener('APP_SHORTCUT_EXPORT_RESULTS', handleShortcutExport);
    };
  }, [conditions]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const scs = settings.system?.shortcuts;
      if (!scs) return;

      // 一键清除所有标注点
      if (matchShortcut(e, scs.waveClearAll)) {
        e.preventDefault();
        if (toggleModeTimeout.current) {
          clearTimeout(toggleModeTimeout.current);
          toggleModeTimeout.current = null;
        }
        commitAnnotations([]);
        setSelectedAnnotationId(null);
        return;
      }

      // 1. 切换标注模式/缩放模式
      if (matchShortcut(e, scs.waveToggleMode)) {
        e.preventDefault();
        const isToggleModePrefixOfClearAll = scs.waveClearAll && scs.waveToggleMode && (
          scs.waveClearAll.toLowerCase().startsWith(scs.waveToggleMode.toLowerCase() + ' ') ||
          scs.waveClearAll.toLowerCase() === scs.waveToggleMode.toLowerCase()
        );

        if (isToggleModePrefixOfClearAll) {
          if (toggleModeTimeout.current) clearTimeout(toggleModeTimeout.current);
          toggleModeTimeout.current = setTimeout(() => {
            setCursorMode(prev => prev === 'data' ? 'zoom' : 'data');
            toggleModeTimeout.current = null;
          }, 250);
        } else {
          setCursorMode(prev => prev === 'data' ? 'zoom' : 'data');
        }
        return;
      }
      
      if (cursorMode !== 'data') return;

      // 2. 撤销标注点
      if (matchShortcut(e, scs.waveUndo)) {
        e.preventDefault();
        undoAnnotations();
        return;
      }
      
      // 3. 重做标注点
      if (matchShortcut(e, scs.waveRedo)) {
        e.preventDefault();
        redoAnnotations();
        return;
      }

      // 4. 删除选中标注点
      if (matchShortcut(e, scs.waveDelete)) {
        if (selectedAnnotationId) {
          e.preventDefault();
          const newAnns = annotations.filter(a => a.id !== selectedAnnotationId);
          commitAnnotations(newAnns);
          setSelectedAnnotationId(null);
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (toggleModeTimeout.current) {
        clearTimeout(toggleModeTimeout.current);
        toggleModeTimeout.current = null;
      }
    };
  }, [cursorMode, history, historyIdx, annotations, selectedAnnotationId, settings.system?.shortcuts]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (Date.now() - lastMouseActivity.current > 5000) {
        setShowControls(false);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Initial mock data generation removed

  const generateData = (conds: number, pts: number) => {
    const newConditions = [];
    for (let i = 0; i < conds; i++) {
      const points = generateMockConditionData(pts, i % pts); // Mock different fault point
      // Pre-calculate processed data for all points
      const processedPoints = points.map(p => {
        const kb = karenbauerTransform(p.phaseA, p.phaseB, p.phaseC);
        const currentFittingWindowLen = fittingWindowLen;
        
        const teo = teagerEnergyOperator(kb.wave_alpha);
        const heads = detectWaveHead(teo, 0.001); // Detect heads on TEO
        const initialHeads = heads.slice(0, 1);
        const sequenceHeads = [...heads];
        return {
          ...p,
          karenbauer: kb,
          denoised: undefined,
          psoErrors: undefined,
          psoParams: undefined,
          calibration: { 
            wave_teo: undefined, 
            heads: [],
            initialHeads: [],
            sequenceHeads: []
          }
        };
      });
      newConditions.push({ id: `cond-${i+1}`, name: `工况 ${i+1}`, points: processedPoints });
    }
    setConditions(newConditions);
    setActiveConditionIdx(0);
    setActivePointId(null);
    setXDomain(['dataMin', 'dataMax']);
    setYDomain(['auto', 'auto']);
    setHasProcessed(false);
    setSingleWaveType('original');
    setAnalysisHiddenLines([]);
    setAnnotations([]);
    setHistory([[]]);
    setHistoryIdx(0);
    setActiveWindows([{ id: 'win-orig', type: 'original' }]);
    setHiddenLines({});
  };

  const activeCondition = conditions[activeConditionIdx];
  const activePoint = activeCondition?.points.find(p => p.id === activePointId) || activeCondition?.points[0];

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setCurrentProjectName(file.name.replace(/\.[^/.]+$/, "")); // Set to filename without extension
    const reader = new FileReader();
    reader.onload = (event) => {
      // Use microtask or direct execution instead of setTimeout to avoid lag
      try {
        const buffer = event.target?.result as ArrayBuffer;
        let parsed = readMat(buffer) as any;
        // mat-for-js usually puts variables in `data` object
        let matVars = parsed;
        if (parsed && typeof parsed === 'object' && parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) {
          matVars = parsed.data;
        }
        
        let rawData: any = null;
        // Priority 1: Check for explicit wave_data or data key
        if (matVars.wave_data) {
          rawData = matVars.wave_data;
        } else if (matVars.data) {
          rawData = matVars.data;
        } else {
          // Priority 2: Iterate to find first array-like variable
          for (const key of Object.keys(matVars)) {
            if (key === 'header' || key.startsWith('__')) continue;
            
            const val = matVars[key];
            if (Array.isArray(val) || (val && val.buffer && val.byteLength !== undefined)) {
              rawData = val;
              break;
            }
          }
        }

        if (!rawData) {
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `解析失败: .mat 文件中未找到矩阵变量。`, isError: true } }));
          setIsImporting(false);
          return;
        }

        // If we reached here, we have rawData. Clear old data now.
        clearAllData();

        let data: number[][] = [];
          // Check if rawData is 2D or 1D
          if (Array.isArray(rawData) && Array.isArray(rawData[0])) {
             data = rawData;
             let rows = data.length;
             let cols = data[0].length;
             
             if (rows < cols && cols > 10) {
               const transposed: number[][] = Array.from({ length: cols }, () => new Array(rows));
               for (let r = 0; r < rows; r++) {
                 for (let c = 0; c < cols; c++) {
                   transposed[c][r] = data[r][c];
                 }
               }
               data = transposed;
             }
          } else {
             const totalElements = rawData.length;
             const cols = pointsCount * 3; // minimal required cols (1 condition)
             if (totalElements % cols !== 0) {
                window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `一维数据无法重塑为二维! 数据总长度 ${totalElements} 不是 (测点数*3) 的整数倍。`, isError: true } }));
                setIsImporting(false);
                return;
             }
             
             const assumedRows = 15000;
             let realCols = totalElements / assumedRows;
             let rows = assumedRows;
             if (totalElements % assumedRows !== 0) {
                // Fallback to state conditionsCount
                realCols = conditionsCount * pointsCount * 3;
                if (totalElements % realCols !== 0) {
                   window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `无法确定一维数据的维度大小！`, isError: true } }));
                   setIsImporting(false);
                   return;
                }
                rows = totalElements / realCols;
             }
             
             data = Array.from({ length: rows }, () => new Array(realCols).fill(0));
             for (let c = 0; c < realCols; c++) {
               for (let r = 0; r < rows; r++) {
                 data[r][c] = rawData[c * rows + r];
               }
             }
          }

          let rows = data.length;
          let cols = data[0]?.length || 0;

          if (cols % (pointsCount * 3) !== 0) {
            window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `数据列数不匹配! 列数 ${cols} 不是 (测点数 ${pointsCount} * 3) 的整数倍。`, isError: true } }));
            setIsImporting(false);
            return;
          }

          const calcConds = cols / (pointsCount * 3);
          setConditionsCount(calcConds);

          // Check if file contains imported wave heads
          let hasImportedHeads = false;
          let importedInitialMatrix: number[][] | null = null;
          let importedInitialManualMatrix: number[][] | null = null;
          let importedSequenceMatrix: number[][] | null = null;
          let importedSequenceManualMatrix: number[][] | null = null;
          let importedLegacyMatrix: number[][] | null = null;
          let importedLegacyManualMatrix: number[][] | null = null;

          const totalPts = calcConds * pointsCount;

          const parseMatMatrix = (rawVal: any): number[][] | null => {
            if (!rawVal || !Array.isArray(rawVal)) return null;
            if (Array.isArray(rawVal[0])) return rawVal;
            const headsPerPt = Math.floor(rawVal.length / totalPts) || 1;
            return Array.from({ length: totalPts }, (_, r) => {
              return rawVal.slice(r * headsPerPt, (r + 1) * headsPerPt);
            });
          };

          if (matVars.initial_wave_heads) {
            importedInitialMatrix = parseMatMatrix(matVars.initial_wave_heads);
            hasImportedHeads = true;
          }
          if (matVars.initial_wave_heads_manual) {
            importedInitialManualMatrix = parseMatMatrix(matVars.initial_wave_heads_manual);
          }
          if (matVars.sequence_wave_heads) {
            importedSequenceMatrix = parseMatMatrix(matVars.sequence_wave_heads);
            hasImportedHeads = true;
          }
          if (matVars.sequence_wave_heads_manual) {
            importedSequenceManualMatrix = parseMatMatrix(matVars.sequence_wave_heads_manual);
          }
          if (matVars.wave_heads) {
            importedLegacyMatrix = parseMatMatrix(matVars.wave_heads);
            hasImportedHeads = true;
          }
          if (matVars.wave_heads_manual) {
            importedLegacyManualMatrix = parseMatMatrix(matVars.wave_heads_manual);
          }

          const newConditions = [];
          for (let c = 0; c < calcConds; c++) {
            const points = [];
            for (let p = 0; p < pointsCount; p++) {
              const phaseA = new Float32Array(rows);
              const phaseB = new Float32Array(rows);
              const phaseC = new Float32Array(rows);

              const baseCol = c * pointsCount * 3 + p * 3;
              for (let r = 0; r < rows; r++) {
                phaseA[r] = data[r][baseCol];
                phaseB[r] = data[r][baseCol + 1];
                phaseC[r] = data[r][baseCol + 2];
              }

              let initialHeads: any[] = [];
              let sequenceHeads: any[] = [];
              let heads: any[] = [];
              const rowIdx = c * pointsCount + p;

              // Parse Initial heads
              if (importedInitialMatrix && importedInitialMatrix[rowIdx]) {
                const rowHeads = importedInitialMatrix[rowIdx];
                for (let hIdx = 0; hIdx < rowHeads.length; hIdx++) {
                  const headIndex = Math.round(rowHeads[hIdx]);
                  if (headIndex >= 0 && headIndex < rows && !isNaN(headIndex) && headIndex !== -1) {
                    const isManual = importedInitialManualMatrix && importedInitialManualMatrix[rowIdx]
                      ? importedInitialManualMatrix[rowIdx][hIdx] === 1
                      : false;
                    initialHeads.push({
                      index: headIndex,
                      value: 0,
                      isManual
                    });
                  }
                }
              }

              // Parse Sequence heads
              if (importedSequenceMatrix && importedSequenceMatrix[rowIdx]) {
                const rowHeads = importedSequenceMatrix[rowIdx];
                for (let hIdx = 0; hIdx < rowHeads.length; hIdx++) {
                  const headIndex = Math.round(rowHeads[hIdx]);
                  if (headIndex >= 0 && headIndex < rows && !isNaN(headIndex) && headIndex !== -1) {
                    const isManual = importedSequenceManualMatrix && importedSequenceManualMatrix[rowIdx]
                      ? importedSequenceManualMatrix[rowIdx][hIdx] === 1
                      : false;
                    sequenceHeads.push({
                      index: headIndex,
                      value: 0,
                      isManual
                    });
                  }
                }
              }

              // Set active heads
              if (hasImportedHeads) {
                heads = detectionType === 'initial' ? initialHeads : sequenceHeads;
              } else {
                heads = [];
                initialHeads = [];
                sequenceHeads = [];
              }

              points.push({
                id: `cond-${c+1}-point-${p+1}`,
                name: `测点M(${p+1})`,
                phaseA,
                phaseB,
                phaseC,
                calibration: { 
                  heads,
                  initialHeads,
                  sequenceHeads
                }
              });
            }
            newConditions.push({ id: `cond-${c+1}`, name: `工况 ${c+1}`, points });
          }

          setConditions(newConditions);
          setActiveConditionIdx(0);
          if (newConditions.length > 0 && newConditions[0].points.length > 0) {
            setActivePointId(newConditions[0].points[0].id);
          } else {
            setActivePointId(null);
          }
          setXDomain(['dataMin', 'dataMax']);
          setYDomain(['auto', 'auto']);
          setHasProcessed(hasImportedHeads); // Directly set to true if heads imported!
          setSingleWaveType(hasImportedHeads ? 'calibration' : 'original');
          setAnalysisHiddenLines([]);
          setAnnotations([]);
          setHistory([[]]);
          setHistoryIdx(0);
          setActiveWindows([{ id: 'win-orig', type: 'original' }]);
          setHiddenLines({});
          setIsImporting(false);
          triggerTransitionAnimation();
        } catch (err: any) {
          console.error(err);
          const errorMsg = err?.message || err || "";
          if (typeof errorMsg === 'string' && errorMsg.includes("Version identifier 1 unknown")) {
            window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `无法解析较新格式的 .mat 文件 (v7.3)。\n请在 MATLAB 中使用 '-v7' 选项重新保存：\nsave('filename.mat', '-v7')`, isError: true } }));
          } else {
            window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `读取文件时出错！确保它是合法的 .mat 文件。\n如果使用的是较新格式(v7.3)，请尝试使用 MATLAB 的 '-v7' 选项重新保存。\n错误信息: ${errorMsg}`, isError: true } }));
          }
          setIsImporting(false);
        }
    };
    reader.onerror = () => {
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `读取文件出错！`, isError: true } }));
      setIsImporting(false);
    };
    reader.onabort = () => {
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleProcessAlgorithms = () => {
    if (conditions.length === 0) return;
    
    const scope = settings.faultDetection.calibrationScope;
    
    // Check if there are already calibration results within the selected scope
    let alreadyHasCalibration = false;
    if (scope === 'current') {
      const currentCond = conditions[activeConditionIdx];
      alreadyHasCalibration = currentCond?.points.some(p => p.calibration && p.calibration.heads && p.calibration.heads.length > 0);
    } else {
      alreadyHasCalibration = conditions.some(c => 
        c.points.some(p => p.calibration && p.calibration.heads && p.calibration.heads.length > 0)
      );
    }

    // If current condition only and it's empty, or no calibration at all, skip dialog
    if (alreadyHasCalibration && hasProcessed) {
      setOverwriteOption('protect_manual'); // default check the second option
      setShowOverwriteModal(true);
    } else {
      executeCalibration(false); // No existing results or current condition is empty, directly run
    }
  };

  const executeCalibration = (protectManual: boolean) => {
    if (conditions.length === 0) return;

    setIsCalculating(true);
    
    const processAllConditions = async () => {
      try {
        const startTime = performance.now();
        const newConditions = [...conditions];
        let lastUpdateTime = performance.now();
        
        const scope = settings.faultDetection.calibrationScope;
        const startIndex = scope === 'current' ? activeConditionIdx : 0;
        const endIndex = scope === 'current' ? activeConditionIdx : conditions.length - 1;
        const totalToProcess = scope === 'current' ? 1 : conditions.length;
        
        for (let cIdx = startIndex; cIdx <= endIndex; cIdx++) {
          const currentTime = performance.now();
          // 优化：仅在时间超过 100ms 时才更新 UI 进度，避免极速计算下的性能浪费
          if (currentTime - lastUpdateTime > 100 || cIdx === startIndex || cIdx === endIndex) {
            const displayIdx = scope === 'current' ? 1 : cIdx + 1;
            window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
              detail: { message: `数据计算中... (${displayIdx}/${totalToProcess})`, isError: false } 
            }));
            
            // 仅在必要时出让主线程，且使用 0ms 延迟
            await new Promise(resolve => setTimeout(resolve, 0));
            lastUpdateTime = performance.now();
          }
          
          const cond = conditions[cIdx];
          const newPoints = cond.points.map((point) => {
        // 1. Transform
        let baseWave: Float32Array | number[];
        if (transformType === 'karenbauer') {
          const kb = point.karenbauer || karenbauerTransform(point.phaseA, point.phaseB, point.phaseC);
          if (selectedModulus === 'beta') baseWave = kb.wave_beta;
          else if (selectedModulus === 'zero') baseWave = kb.wave_0;
          else baseWave = kb.wave_alpha;
        } else {
          const cl = clarkeTransform(point.phaseA, point.phaseB, point.phaseC);
          if (selectedModulus === 'beta') baseWave = cl.wave_beta;
          else if (selectedModulus === 'zero') baseWave = cl.wave_0;
          else baseWave = cl.wave_alpha;
        }

        // 2. Pre-processing
        let processedWave: Float32Array | number[];
        let newDenoised = point.denoised;
        let newPsoErrors = point.psoErrors;
        let newPsoParams = point.psoParams;

        if (detectionType === 'sequence-user-upload') {
          // For sequence mode (user upload), update denoised data for all moduli using current PSO settings
          const kb = point.karenbauer || karenbauerTransform(point.phaseA, point.phaseB, point.phaseC);
          
          const res0 = removePowerFrequency(kb.wave_0, samplingFreq, fittingWindowLen, psoPopulation, psoIterations);
          const resa = removePowerFrequency(kb.wave_alpha, samplingFreq, fittingWindowLen, psoPopulation, psoIterations);
          const resb = removePowerFrequency(kb.wave_beta, samplingFreq, fittingWindowLen, psoPopulation, psoIterations);
          
          newDenoised = {
            wave_0: res0.data,
            wave_alpha: resa.data,
            wave_beta: resb.data
          };
          newPsoErrors = {
            wave_0: res0.error,
            wave_alpha: resa.error,
            wave_beta: resb.error
          };
          newPsoParams = {
            wave_0: { A: res0.A, f: res0.f, theta: res0.theta, error: res0.error },
            wave_alpha: { A: resa.A, f: resa.f, theta: resa.theta, error: resa.error },
            wave_beta: { A: resb.A, f: resb.f, theta: resb.theta, error: resb.error }
          };

          if (selectedModulus === 'beta') processedWave = resb.data;
          else if (selectedModulus === 'zero') processedWave = res0.data;
          else processedWave = resa.data;
        } else if (detectionType === 'sequence') {
          // Classic sequence mode: NO PSO, no denoised values, processedWave is just the raw baseWave
          newDenoised = undefined;
          newPsoErrors = undefined;
          newPsoParams = undefined;
          processedWave = baseWave;
        } else {
          if (processingMethod === 'teo') {
            processedWave = teagerEnergyOperator(baseWave);
          } else if (processingMethod === 'wavelet') {
            processedWave = discreteWaveletTransform(baseWave, waveletType);
          } else {
            processedWave = doubleDifference(baseWave);
          }
        }

        // 3. Calibration
        let heads: { index: number, value: number, amplitude?: number, startIdx?: number, endIdx?: number, startVal?: number, isManual?: boolean }[] = [];
        let debugInfo: any = null;
        let debugWaves: any = null;
        
        const preFaultRatio = settings.faultDetection.preFaultWindowRatio || 0.333;
        const thresholdFactor = settings.faultDetection.thresholdFactor || 1.2;

        if (detectionType === 'initial') {
          const result = waveFrontDetect(
            processedWave, 
            samplingFreq, 
            faultTimeSec, 
            processingMethod === 'wavelet' ? 'wavelet' : 'diff',
            thresholdFactor,
            preFaultRatio
          );
          debugInfo = result.debugInfo;
          if (result.detected) {
            heads = [{ 
              index: result.t_arrive, 
              value: result.max_val,
              isManual: false,
              startIdx: Math.max(0, result.t_arrive - 10),
              endIdx: Math.min(processedWave.length - 1, result.t_arrive + 10)
            }];
          }
        } else if (detectionType === 'sequence-user-upload') {
          const results = calibrateWaveSequenceUserUpload(processedWave, {
            samplingFreq,
            thresholdFactor,
            preFaultWindowRatio: preFaultRatio,
            para_cali_windows_length: settings.faultDetection.para_cali_windows_length ?? 1000,
            para_cali_start_doorsill: settings.faultDetection.para_cali_start_doorsill ?? 0.1,
            para_cali_hist: settings.faultDetection.para_cali_hist ?? 200,
            para_cali_hist_sift: settings.faultDetection.para_cali_hist_sift ?? 30,
            user_diff2_time: settings.faultDetection.user_diff2_time ?? 7,
            user_diff2_time_end: settings.faultDetection.user_diff2_time_end ?? 50,
            para_cali_head_count: settings.faultDetection.para_cali_head_count ?? 8
          });
          heads = results.heads.map(r => ({ 
            index: r.index, 
            value: r.value, 
            amplitude: r.amplitude,
            startIdx: r.startIdx,
            endIdx: r.endIdx,
            startVal: r.startVal,
            isManual: false 
          }));
          debugWaves = results.debugWaves;
          debugInfo = results.debugInfo;
        } else {
          // Sequence mode: find multiple peaks
          const results = calibrateWaveSequence(processedWave, {
            samplingFreq,
            thresholdFactor,
            preFaultWindowRatio: preFaultRatio,
            para_cali_windows_length: settings.faultDetection.para_cali_windows_length ?? 3000,
            para_cali_start_doorsill: settings.faultDetection.para_cali_start_doorsill ?? 0.1,
            para_cali_hist_sift: settings.faultDetection.para_cali_hist_sift ?? 30,
            user_diff2_time: settings.faultDetection.user_diff2_time ?? 7,
            user_diff2_time_end: settings.faultDetection.user_diff2_time_end ?? 50,
            para_cali_head_count: settings.faultDetection.para_cali_head_count ?? 8
          });
          heads = results.map(r => ({ 
            index: r.index, 
            value: r.value, 
            amplitude: r.amplitude,
            startIdx: r.startIdx,
            endIdx: r.endIdx,
            startVal: r.startVal,
            isManual: false 
          }));
          
          const preFaultLength = Math.floor(processedWave.length * preFaultRatio);
          let baseThreshold = 0;
          for (let i = 0; i < preFaultLength; i++) {
            const v = Math.abs(processedWave[i]);
            if (v > baseThreshold) baseThreshold = v;
          }
          if (baseThreshold === 0) baseThreshold = 0.01;
          
          debugInfo = {
            baseline: baseThreshold,
            threshold: baseThreshold * thresholdFactor,
            factor: thresholdFactor
          };
          debugWaves = null;
        }

        // Protect manual calibration if selected
        let finalHeads = [...heads];
        const previousHeads = detectionType === 'initial' 
          ? (point.calibration?.initialHeads || []) 
          : (point.calibration?.sequenceHeads || []);
        if (protectManual && previousHeads.length > 0) {
          const previousManualHeads = previousHeads.filter(h => h.isManual);
          // filter out any new automatic heads that are exactly the same as the manual ones to prevent duplicating
          const manualIndices = new Set(previousManualHeads.map(mh => mh.index));
          const filteredNewHeads = heads.filter(h => !manualIndices.has(h.index));
          finalHeads = [...previousManualHeads, ...filteredNewHeads];
        }

        const initialHeads = detectionType === 'initial' 
          ? finalHeads 
          : (point.calibration?.initialHeads || (point.calibration?.heads ? point.calibration.heads.slice(0, 1) : []));
        const sequenceHeads = (detectionType === 'sequence' || detectionType === 'sequence-user-upload')
          ? finalHeads 
          : (point.calibration?.sequenceHeads || (point.calibration?.heads || []));

        return {
          ...point,
          denoised: newDenoised,
          psoErrors: newPsoErrors,
          psoParams: newPsoParams,
          calibration: {
            wave_teo: processedWave,
            heads: finalHeads.map(h => ({ 
              index: h.index, 
              value: h.value, 
              amplitude: h.amplitude,
              startIdx: h.startIdx,
              endIdx: h.endIdx,
              startVal: h.startVal,
              isManual: !!h.isManual 
            })),
            initialHeads: initialHeads.map((h: any) => ({
              index: h.index,
              value: h.value,
              amplitude: h.amplitude,
              startIdx: h.startIdx,
              endIdx: h.endIdx,
              startVal: h.startVal,
              isManual: !!h.isManual
            })),
            sequenceHeads: sequenceHeads.map((h: any) => ({
              index: h.index,
              value: h.value,
              amplitude: h.amplitude,
              startIdx: h.startIdx,
              endIdx: h.endIdx,
              startVal: h.startVal,
              isManual: !!h.isManual
            })),
            debugInfo,
            debugWaves
          }
        };
      });
          newConditions[cIdx] = { ...cond, points: newPoints };
        }

        const endTime = performance.now();
        setConditions(newConditions);
        setHasProcessed(true);
        setSingleWaveType('calibration');
        resetWaveformView();
        setDataVersion(prev => prev + 1);
        setYDomain(['auto', 'auto']);
        triggerDrawAnimation();

        const countText = scope === 'all' ? `全工况 (${conditions.length} 组)` : `当前工况`;
        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
          detail: { message: `【算法标定完成】已采用 [ ${detectionType === 'initial' ? '初始波头' : '后续序列'} ] 标定逻辑完成 ${countText} 数据分析。耗时: ${((endTime - startTime)/1000).toFixed(2)}s。` } 
        }));
      } catch (err) {
        console.error(err);
        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
          detail: { message: `标定算法运行出错，请检查输入参数是否合法。`, isError: true } 
        }));
      } finally {
        setIsCalculating(false);
      }
    };

    processAllConditions();
  };

  const executeExport = () => {
    if (conditions.length === 0 || selectedExportConditions.length === 0) {
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请至少选择一个工况组进行导出`, isError: true } }));
      return;
    }
    
    const selectedIndices = [...selectedExportConditions].sort((a, b) => a - b);
    const exportConditions = selectedIndices.map(idx => conditions[idx]);
    
    try {
      // 1. Reconstruct raw wave data matrix
      const rows = exportConditions[0]?.points[0]?.phaseA.length || 0;
      const cols = exportConditions.length * pointsCount * 3;
      const wave_data: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

      for (let c = 0; c < exportConditions.length; c++) {
        for (let p = 0; p < pointsCount; p++) {
          const pt = exportConditions[c].points[p];
          const baseCol = c * pointsCount * 3 + p * 3;
          for (let r = 0; r < rows; r++) {
            wave_data[r][baseCol] = pt.phaseA[r];
            wave_data[r][baseCol + 1] = pt.phaseB[r];
            wave_data[r][baseCol + 2] = pt.phaseC[r];
          }
        }
      }

      // 2. Reconstruct wave heads matrix
      let maxSequenceHeads = 1;
      exportConditions.forEach(c => {
        c.points.forEach(p => {
          const len = p.calibration?.sequenceHeads?.length || 0;
          if (len > maxSequenceHeads) maxSequenceHeads = len;
        });
      });

      const totalPoints = exportConditions.length * pointsCount;
      const variables: MatVariable[] = [
        { name: 'wave_data', data: wave_data }
      ];

      if (detectionType === 'initial') {
        const initial_wave_heads: number[][] = Array.from({ length: totalPoints }, () => [-1]);
        const initial_wave_heads_manual: number[][] = Array.from({ length: totalPoints }, () => [0]);

        for (let c = 0; c < exportConditions.length; c++) {
          for (let p = 0; p < pointsCount; p++) {
            const pt = exportConditions[c].points[p];
            const rowIdx = c * pointsCount + p;
            const heads = pt.calibration?.initialHeads || [];
            if (heads.length > 0) {
              initial_wave_heads[rowIdx][0] = heads[0].index;
              initial_wave_heads_manual[rowIdx][0] = (heads[0].isManual || pt.calibration?.isManual) ? 1 : 0;
            }
          }
        }

        variables.push(
          { name: 'initial_wave_heads', data: initial_wave_heads },
          { name: 'initial_wave_heads_manual', data: initial_wave_heads_manual },
          { name: 'wave_heads', data: initial_wave_heads },
          { name: 'wave_heads_manual', data: initial_wave_heads_manual }
        );
      } else {
        const sequence_wave_heads: number[][] = Array.from({ length: totalPoints }, () => new Array(maxSequenceHeads).fill(-1));
        const sequence_wave_amplitudes: number[][] = Array.from({ length: totalPoints }, () => new Array(maxSequenceHeads).fill(0));
        const sequence_wave_heads_manual: number[][] = Array.from({ length: totalPoints }, () => new Array(maxSequenceHeads).fill(0));

        for (let c = 0; c < exportConditions.length; c++) {
          for (let p = 0; p < pointsCount; p++) {
            const pt = exportConditions[c].points[p];
            const rowIdx = c * pointsCount + p;
            const heads = pt.calibration?.sequenceHeads || [];
            for (let h = 0; h < heads.length; h++) {
              sequence_wave_heads[rowIdx][h] = heads[h].index;
              sequence_wave_amplitudes[rowIdx][h] = heads[h].value;
              sequence_wave_heads_manual[rowIdx][h] = (heads[h].isManual || pt.calibration?.isManual) ? 1 : 0;
            }
          }
        }

        variables.push(
          { name: 'sequence_wave_heads', data: sequence_wave_heads },
          { name: 'sequence_wave_amplitudes', data: sequence_wave_amplitudes },
          { name: 'sequence_wave_heads_manual', data: sequence_wave_heads_manual },
          { name: 'wave_heads', data: sequence_wave_heads },
          { name: 'wave_heads_manual', data: sequence_wave_heads_manual }
        );
      }

      const matBuffer = writeLevel5MatFile(variables);
      
      // 4. Download file
      const blob = new Blob([matBuffer], { type: 'application/octet-stream' });
      
      const doSave = () => {
        try {
          // Use traditional download method to respect browser-level "silent download" settings
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${exportFileName || 'waveform_calibration'}.mat`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          setShowExportModal(false);
        } catch (err: any) {
          console.error(err);
          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `导出数据时出错：${err instanceof Error ? err.message : String(err)}`, isError: true } }));
        }
      };
      
      doSave();
    } catch (err) {
      console.error(err);
      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `处理导出数据时出错：${err instanceof Error ? err.message : String(err)}`, isError: true } }));
    }
  };

  // Optimized downsampling that works on numeric arrays to avoid creating millions of objects
  const downsampleNumericArray = (arr: number[] | Float32Array, maxPoints: number = 1500, preserveIndices: number[] = []) => {
    if (arr.length <= maxPoints) return Array.from(arr).map((v, i) => ({ index: i, value: v }));
    const threshold = maxPoints;
    const dataLength = arr.length;
    
    // Create a set of indices to preserve for fast lookup
    const preserveSet = new Set(preserveIndices.filter(idx => idx >= 0 && idx < dataLength));
    
    const sampled = [];
    const bucketSize = (dataLength - 2) / (threshold - 2);

    let a = 0;
    sampled.push({ index: 0, value: arr[0] });

    for (let i = 0; i < threshold - 2; i++) {
      let avgX = 0;
      let avgY = 0;
      let avgRangeStart = Math.floor((i + 1) * bucketSize) + 1;
      let avgRangeEnd = Math.floor((i + 2) * bucketSize) + 1;
      avgRangeEnd = avgRangeEnd < dataLength ? avgRangeEnd : dataLength;
      const avgRangeLength = avgRangeEnd - avgRangeStart;

      for (; avgRangeStart < avgRangeEnd; avgRangeStart++) {
        avgX += avgRangeStart;
        avgY += arr[avgRangeStart];
      }
      avgX /= avgRangeLength;
      avgY /= avgRangeLength;

      let rangeOffs = Math.floor((i + 0) * bucketSize) + 1;
      const rangeTo = Math.floor((i + 1) * bucketSize) + 1;
      const pointAX = a;
      const pointAY = arr[a];

      let maxArea = -1;
      let nextA = rangeOffs;
      let maxAreaPointIdx = rangeOffs;

      for (; rangeOffs < rangeTo; rangeOffs++) {
        const area = Math.abs(
          (pointAX - avgX) * (arr[rangeOffs] - pointAY) -
          (pointAX - rangeOffs) * (avgY - pointAY)
        ) * 0.5;

        if (area > maxArea) {
          maxArea = area;
          maxAreaPointIdx = rangeOffs;
          nextA = rangeOffs;
        }
      }

      sampled.push({ index: maxAreaPointIdx, value: arr[maxAreaPointIdx] });
      a = nextA;
    }

    sampled.push({ index: dataLength - 1, value: arr[dataLength - 1] });
    
    // Add preserved indices if they are missing
    const existingIndices = new Set(sampled.map(s => s.index));
    preserveSet.forEach(idx => {
      if (!existingIndices.has(idx)) {
        sampled.push({ index: idx, value: arr[idx] });
      }
    });
    
    // Re-sort by index
    sampled.sort((a, b) => a.index - b.index);
    
    return sampled;
  };

  // LTTB downsampling to preserve peaks and trends during zoom (improves performance for high-frequency signals)
  const downsampleData = (data: any[], maxPoints: number = 1500) => {
    if (data.length <= maxPoints) return data;
    return lttbDownsample(data, maxPoints);
  };

  // Build chart data for Multiple Windows
  const formatWindowData = useMemo(() => {
    const cache = new Map();
    return (point: WavePoint, category: WindowCategory) => {
      const cacheKey = `${point.id}-${category}-${listXDomain[0]}-${listXDomain[1]}-${dataVersion}-${transformType}-${processingMethod}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);

      const isCalculated = !!(point.calibration?.wave_teo || point.denoised || point.calibration?.debugWaves);
      let rawData: any[] = [];
      
      if (category === 'original') {
        rawData = Array.from(point.phaseA).map((val, idx) => ({ 
          time: idx / samplingFreq, 
          A: val, 
          B: point.phaseB[idx], 
          C: point.phaseC[idx] 
        }));
      } else if (!isCalculated) {
        // If not calculated, non-original windows should be empty as per user request
        rawData = [];
      } else if (category === 'karenbauer') {
        // Show current transformation result
        const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
        const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
        rawData = Array.from(res.wave_alpha).map((val, idx) => ({ 
          time: idx / samplingFreq, 
          alpha: val, 
          beta: res.wave_beta[idx], 
          zero: res.wave_0[idx] 
        }));
      } else if (category === 'differential') {
        // Show line mode wave, 1st diff, 2nd diff (on denoised signal, i.e. 滤除工频后的信号)
        const denoised = point.denoised;
        if (!denoised) {
          rawData = [];
        } else {
          const baseWave = selectedModulus === 'beta' ? denoised.wave_beta : selectedModulus === 'zero' ? denoised.wave_0 : denoised.wave_alpha;
          const diffs = multiDifference(baseWave);
          rawData = Array.from(baseWave).map((val, idx) => ({ 
            time: idx / samplingFreq, 
            value: val, 
            diff1: diffs.diff1[idx], 
            diff2: diffs.diff2[idx] 
          }));
        }
      } else if (category === 'teo') {
        // Use stored teo only
        const pWave = point.calibration?.wave_teo;
        if (pWave) {
          rawData = Array.from(pWave).map((val, idx) => ({ time: idx / samplingFreq, teo: val }));
        }
      } else if (category === 'calibration') {
        // Show original waveform but aware of markers
        rawData = Array.from(point.phaseA).map((val, idx) => ({ time: idx / samplingFreq, A: val }));
      } else if (category === 'noise' || category === 'denoise') {
        if (category === 'denoise' && !point.denoised) {
          rawData = [];
        } else {
          const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
          const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
          const base = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
          if (category === 'noise') {
            const noisy = addNoise(base, 20);
            rawData = Array.from(noisy).map((val, idx) => ({ time: idx / samplingFreq, value: val }));
          } else {
             const pWave = selectedModulus === 'beta' ? point.denoised?.wave_beta : selectedModulus === 'zero' ? point.denoised?.wave_0 : point.denoised?.wave_alpha;
             if (!pWave) rawData = [];
             else rawData = Array.from(pWave).map((val, idx) => ({ time: idx / samplingFreq, value: val }));
          }
        }
      } else if (category === 'pso-compare') {
        if (!point.denoised) {
          rawData = [];
        } else {
          const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
          const res = transformFn(point.phaseA, point.phaseB, point.phaseC);
          const modal = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
          const filtered = selectedModulus === 'beta' ? point.denoised.wave_beta : selectedModulus === 'zero' ? point.denoised.wave_0 : point.denoised.wave_alpha;
          
          rawData = Array.from(modal).map((val, idx) => {
            const filtVal = filtered[idx] ?? val;
            return {
              time: idx / samplingFreq,
              modal: val,
              filtered: filtVal,
              reconstructed: val - filtVal
            };
          });
        }
      } else if (category === 'user-debug') {
        const dw = point.calibration?.debugWaves;
        if (!dw) {
          rawData = [];
        } else {
          rawData = Array.from(dw.original).map((val, idx) => ({
            time: idx / samplingFreq,
            original: val,
            diff1: dw.diff1[idx],
            diff2: dw.diff2[idx],
            diff3: dw.diff3[idx]
          }));
        }
      } else {
        rawData = [];
      }

      if (listXDomain[0] !== 'dataMin' && listXDomain[1] !== 'dataMax') {
        rawData = rawData.filter(d => d.time >= (listXDomain[0] as number) && d.time <= (listXDomain[1] as number));
      }
      
      const res = downsampleData(rawData, 400); // More aggressive downsampling for list view performance
      cache.set(cacheKey, res);
      return res;
    };
  }, [samplingFreq, listXDomain, dataVersion, transformType, processingMethod, hasProcessed]);

  // Build chart data for Middle-Right (Processed)
  const formatProcessedData = useMemo(() => {
    const cache = new Map();
    return (point: WavePoint): any[] => {
      const cacheKey = `${point.id}-${processMode}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey);
      
      let rawData: any[] = [];
      if (processMode === 'karenbauer') {
        const kb = point.karenbauer || karenbauerTransform(point.phaseA, point.phaseB, point.phaseC);
        rawData = Array.from(kb.wave_alpha).map((val, idx) => ({
          time: idx / samplingFreq,
          alpha: val,
          beta: kb.wave_beta[idx],
          zero: kb.wave_0[idx]
        }));
      } else if (processMode === 'denoise') {
        if (!point.denoised) return [];
        rawData = Array.from(point.denoised.wave_alpha).map((val, idx) => ({ time: idx / samplingFreq, alpha: val }));
      } else { 
        const kb = point.karenbauer || karenbauerTransform(point.phaseA, point.phaseB, point.phaseC);
        const teo = point.calibration?.wave_teo || teagerEnergyOperator(kb.wave_alpha);
        rawData = Array.from(teo).map((val, idx) => ({ time: idx / samplingFreq, teo: val }));
      }
      const res = downsampleData(rawData, 300);
      cache.set(cacheKey, res);
      return res;
    };
  }, [processMode, samplingFreq]);

  // Build data for Right area (Single waveform focus)
  const focusData = useMemo(() => {
    if (!activePoint || !hasProcessed) return [];
    
    const transformFn = transformType === 'karenbauer' ? karenbauerTransform : clarkeTransform;
    const res = transformFn(activePoint.phaseA, activePoint.phaseB, activePoint.phaseC);
    
    let baseWave: number[] | Float32Array = [];
    if (singleWaveType === 'original') {
      baseWave = activePoint.phaseA;
    } else if (singleWaveType === 'karenbauer') {
      baseWave = res.wave_alpha;
    } else if (singleWaveType === 'teo') {
      baseWave = activePoint.calibration?.wave_teo || teagerEnergyOperator(res.wave_alpha);
    } else if (singleWaveType === 'denoise') {
      if (activePoint.denoised) {
        if (selectedModulus === 'beta') baseWave = activePoint.denoised.wave_beta;
        else if (selectedModulus === 'zero') baseWave = activePoint.denoised.wave_0;
        else baseWave = activePoint.denoised.wave_alpha;
      }
    } else if (singleWaveType === 'pso-compare') {
      baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
    } else if (singleWaveType === 'calibration') {
      baseWave = activePoint.phaseA;
    } else if (singleWaveType === 'differential') {
      baseWave = selectedModulus === 'beta' ? res.wave_beta : selectedModulus === 'zero' ? res.wave_0 : res.wave_alpha;
    } else if (singleWaveType === 'user-debug') {
      baseWave = activePoint.calibration?.debugWaves?.original || activePoint.phaseA;
    }

    if (baseWave.length === 0) return [];

    // Collect indices to preserve (wave heads and their neighbors)
    const preserveIndices: number[] = [];
    if (activePoint.calibration?.heads) {
      activePoint.calibration.heads.forEach(h => {
        const roundedIdx = Math.round(h.index);
        preserveIndices.push(roundedIdx);
        if (h.startIdx !== undefined) preserveIndices.push(Math.round(h.startIdx));
        if (h.endIdx !== undefined) preserveIndices.push(Math.round(h.endIdx));
        // Preserve surrounding points for peak shape
        for (let i = -5; i <= 5; i++) {
          preserveIndices.push(roundedIdx + i);
        }
      });
    }

    // Also preserve debug extrema points in user-debug mode to ensure exact peak alignment
    if (activePoint.calibration?.debugInfo?.extrema) {
      activePoint.calibration.debugInfo.extrema.forEach((ext: any) => {
        const roundedIdx = Math.round(ext.index);
        preserveIndices.push(roundedIdx);
        for (let i = -3; i <= 3; i++) {
          preserveIndices.push(roundedIdx + i);
        }
      });
    }
    if (activePoint.calibration?.debugInfo?.T_head) {
      activePoint.calibration.debugInfo.T_head.forEach((idx: number) => {
        const roundedIdx = Math.round(idx);
        preserveIndices.push(roundedIdx);
        for (let i = -3; i <= 3; i++) {
          preserveIndices.push(roundedIdx + i);
        }
      });
    }

    const sampled = downsampleNumericArray(baseWave, 2500, preserveIndices);
    
    const diffs = (singleWaveType === 'differential') ? multiDifference(baseWave) : null;

    const data = sampled.map(s => {
      const idx = s.index;
      const pt: any = {
        time: idx / samplingFreq,
        originalIndex: idx,
        value: s.value
      };

      if (singleWaveType === 'original') {
        pt.A = activePoint.phaseA[idx];
        pt.B = activePoint.phaseB[idx];
        pt.C = activePoint.phaseC[idx];
      } else if (singleWaveType === 'karenbauer') {
        pt.alpha = res.wave_alpha[idx];
        pt.beta = res.wave_beta[idx];
        pt.zero = res.wave_0[idx];
      } else if (singleWaveType === 'differential') {
        pt.diff1 = diffs?.diff1[idx];
        pt.diff2 = diffs?.diff2[idx];
      } else if (singleWaveType === 'pso-compare') {
        const modalVal = s.value;
        let filteredVal = modalVal;
        if (activePoint.denoised) {
          if (selectedModulus === 'beta') filteredVal = activePoint.denoised.wave_beta[idx];
          else if (selectedModulus === 'zero') filteredVal = activePoint.denoised.wave_0[idx];
          else filteredVal = activePoint.denoised.wave_alpha[idx];
        }
        pt.modal = modalVal;
        pt.filtered = filteredVal;
        pt.reconstructed = modalVal - filteredVal;
      } else if (singleWaveType === 'user-debug') {
        if (activePoint.calibration?.debugWaves) {
          const dw = activePoint.calibration.debugWaves;
          pt.original = dw.original[idx];
          pt.diff1 = dw.diff1[idx];
          pt.diff2 = dw.diff2[idx];
          pt.diff3 = dw.diff3[idx];
        }
      }

      return pt;
    });

    // Add calibrated wave head shading values if in calibration or differential mode
    if (activePoint?.calibration?.heads && (singleWaveType === 'calibration' || singleWaveType === 'differential')) {
      activePoint.calibration.heads.forEach((h: any, hIdx: number) => {
        const sIdx = h.startIdx !== undefined ? h.startIdx : Math.max(0, h.index - 8);
        const eIdx = h.endIdx !== undefined ? h.endIdx : h.index;

        data.forEach((pt: any) => {
          const idx = pt.originalIndex;
          if (idx >= sIdx && idx <= eIdx) {
            pt[`caliShading_${hIdx}`] = pt.value;
          }
        });
      });
    }

    return data;
  }, [activePoint, hasProcessed, singleWaveType, samplingFreq, selectedModulus, transformType, xDomain]);

  const margins = { top: 45, right: 25, left: 20, bottom: 8 };

  // Calculate actual bounds
  const getActualDomains = (): { x: [number, number], y: [number, number] } => {
    if (!focusData || focusData.length === 0) return { x: [0, 1], y: [0, 1] };
    
    let curX = xDomain;
    if (curX[0] === 'dataMin' || curX[1] === 'dataMax') {
      curX = focusData.length > 0 ? [focusData[0].time, focusData[focusData.length - 1].time] : [0, 1];
    }
    
    let curY = yDomain;
    if (curY[0] === 'auto' || curY[1] === 'auto') {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < focusData.length; i++) {
        const pt = focusData[i];
        if (singleWaveType === 'original') {
          if (!analysisHiddenLines.includes('A') && pt.A !== undefined) { if (pt.A < min) min = pt.A; if (pt.A > max) max = pt.A; }
          if (!analysisHiddenLines.includes('B') && pt.B !== undefined) { if (pt.B < min) min = pt.B; if (pt.B > max) max = pt.B; }
          if (!analysisHiddenLines.includes('C') && pt.C !== undefined) { if (pt.C < min) min = pt.C; if (pt.C > max) max = pt.C; }
        } else if (singleWaveType === 'karenbauer') {
          if (!analysisHiddenLines.includes('alpha') && pt.alpha !== undefined) { if (pt.alpha < min) min = pt.alpha; if (pt.alpha > max) max = pt.alpha; }
          if (!analysisHiddenLines.includes('beta') && pt.beta !== undefined) { if (pt.beta < min) min = pt.beta; if (pt.beta > max) max = pt.beta; }
          if (!analysisHiddenLines.includes('zero') && pt.zero !== undefined) { if (pt.zero < min) min = pt.zero; if (pt.zero > max) max = pt.zero; }
        } else if (singleWaveType === 'differential') {
          if (!analysisHiddenLines.includes('value') && pt.value !== undefined) { if (pt.value < min) min = pt.value; if (pt.value > max) max = pt.value; }
          if (!analysisHiddenLines.includes('diff1') && pt.diff1 !== undefined) { if (pt.diff1 < min) min = pt.diff1; if (pt.diff1 > max) max = pt.diff1; }
          if (!analysisHiddenLines.includes('diff2') && pt.diff2 !== undefined) { if (pt.diff2 < min) min = pt.diff2; if (pt.diff2 > max) max = pt.diff2; }
        } else if (singleWaveType === 'pso-compare') {
          if (!analysisHiddenLines.includes('modal') && pt.modal !== undefined) { if (pt.modal < min) min = pt.modal; if (pt.modal > max) max = pt.modal; }
          if (!analysisHiddenLines.includes('filtered') && pt.filtered !== undefined) { if (pt.filtered < min) min = pt.filtered; if (pt.filtered > max) max = pt.filtered; }
          if (!analysisHiddenLines.includes('reconstructed') && pt.reconstructed !== undefined) { if (pt.reconstructed < min) min = pt.reconstructed; if (pt.reconstructed > max) max = pt.reconstructed; }
        } else {
          if (pt.value !== undefined) { if (pt.value < min) min = pt.value; if (pt.value > max) max = pt.value; }
        }
      }
      if (min === Infinity || max === -Infinity) { min = -1; max = 1; }
      const pad = (max - min) * 0.05 || 1;
      curY = [min - pad, max + pad];
    }
    return { x: curX as [number, number], y: curY as [number, number] };
  };

  const actualDomains = getActualDomains();

  const getSubplotIndex = (key: string): number => {
    if (singleWaveType === 'user-debug') {
      if (key === 'original') return 0;
      if (key === 'diff1') return 1;
      if (key === 'diff2') return 2;
      if (key === 'diff3') return 3;
    } else {
      if (key === 'value') return 0;
      if (key === 'diff2') return 1;
      if (key === 'diff1') return 2;
    }
    return 0;
  };

  const getSubplotRect = (i: number, divRect: DOMRect) => {
    const isUserDebug = singleWaveType === 'user-debug';
    const totalSubplots = isUserDebug ? 4 : 3;
    const topMargin = i === 0 ? 10 : 5;
    const bottomMargin = i === (totalSubplots - 1) ? 20 : 5;
    const leftMargin = 20;
    const rightMargin = 30;
    const yAxisWidth = 25;
    const xAxisHeight = i === (totalSubplots - 1) ? 30 : 0;
    
    return {
      left: divRect.left + leftMargin + yAxisWidth,
      top: divRect.top + topMargin,
      width: divRect.width - leftMargin - rightMargin - yAxisWidth,
      height: divRect.height - topMargin - bottomMargin - xAxisHeight,
    };
  };

  const getSubplotYDomain = (key: string): [number, number] => {
    if (diffYDomains[key] && diffYDomains[key][0] !== 'auto') {
      return diffYDomains[key] as [number, number];
    }
    if (!focusData || focusData.length === 0) return [0, 1];
    let min = Infinity, max = -Infinity;
    for (const pt of focusData) {
      const val = (pt as any)[key];
      if (val !== undefined) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    if (min === Infinity || max === -Infinity) return [-1, 1];
    const pad = (max - min) * 0.05 || 1;
    return [min - pad, max + pad];
  };

  const getPixelCoordinates = (ptTime: number, ptVal: number, curveKey: string, rect: { left: number; top: number; width: number; height: number; }, domains: { x: [number, number], y: [number, number] }) => {
    let ptX_px = 0;
    let ptY_px = 0;
    const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
    const isUserDebug = singleWaveType === 'user-debug';
    const expectedLen = isUserDebug ? 4 : 3;
    const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) ||
                           (isUserDebug && subplotElements && subplotElements.length === 4);
    
    if (isMultiSubplot && subplotElements) {
      const subIdx = getSubplotIndex(curveKey);
      const subEl = subplotElements[subIdx];
      const subDivRect = subEl.getBoundingClientRect();
      const subRect = getSubplotRect(subIdx, subDivRect);
      const subYDomain = getSubplotYDomain(curveKey);

      const ptX_ratio = (ptTime - domains.x[0]) / (domains.x[1] - domains.x[0]);
      ptX_px = subRect.left + ptX_ratio * subRect.width;

      const ptY_ratio = (subYDomain[1] - ptVal) / (subYDomain[1] - subYDomain[0]);
      ptY_px = subRect.top + ptY_ratio * subRect.height;
    } else {
      const ptX_ratio = (ptTime - domains.x[0]) / (domains.x[1] - domains.x[0]);
      ptX_px = rect.left + ptX_ratio * rect.width;

      const ptY_ratio = (domains.y[1] - ptVal) / (domains.y[1] - domains.y[0]);
      ptY_px = rect.top + ptY_ratio * rect.height;
    }
    return { ptX_px, ptY_px };
  };

  const getZoomBoxVerticalBounds = () => {
    if (!chartRef.current) return { top: margins.top, height: 100, middle: margins.top + 50 };
    const rect = chartRef.current.getBoundingClientRect();
    
    // Default values for single waveform chart
    const yAxisWidth = 25;
    const xAxisHeight = 30;
    const plotTop = margins.top;
    const plotHeight = rect.height - margins.top - margins.bottom - xAxisHeight;
    const plotMiddle = plotTop + plotHeight / 2;

    const isUserDebug = singleWaveType === 'user-debug';
    const isDiff = singleWaveType === 'differential';

    if (isDiff || isUserDebug) {
      const subplotElements = chartRef.current.querySelectorAll('.flex-1.min-h-0.relative');
      if (subplotElements && subplotElements.length > 0) {
        // Find which subplot is hovered or where drag started
        let targetSubEl = null;
        if (dragStartPos) {
          for (let i = 0; i < subplotElements.length; i++) {
            const subRect = subplotElements[i].getBoundingClientRect();
            if (dragStartPos.y >= subRect.top && dragStartPos.y <= subRect.bottom) {
              targetSubEl = subplotElements[i];
              break;
            }
          }
        }
        
        // Fallback to the first subplot if none matched
        if (!targetSubEl) {
          targetSubEl = subplotElements[0];
        }
        
        const subRect = targetSubEl.getBoundingClientRect();
        const subContainerTop = subRect.top - rect.top; // Relative to chartRef container
        const subPlotMiddle = subContainerTop + subRect.height / 2;
        
        return {
          top: subContainerTop,
          height: subRect.height,
          middle: subPlotMiddle,
          isSubplot: true
        };
      }
    }

    return {
      top: plotTop,
      height: plotHeight,
      middle: plotMiddle,
      isSubplot: false
    };
  };

  const getActiveCurves = () => {
    const curves: { key: string; color: string }[] = [];
    if (singleWaveType === 'original') {
      if (!analysisHiddenLines.includes('A')) curves.push({ key: 'A', color: '#facc15' });
      if (!analysisHiddenLines.includes('B')) curves.push({ key: 'B', color: '#22c55e' });
      if (!analysisHiddenLines.includes('C')) curves.push({ key: 'C', color: '#ef4444' });
    } else if (singleWaveType === 'karenbauer') {
      if (!analysisHiddenLines.includes('alpha')) curves.push({ key: 'alpha', color: '#3b82f6' });
      if (!analysisHiddenLines.includes('beta')) curves.push({ key: 'beta', color: '#a855f7' });
      if (!analysisHiddenLines.includes('zero')) curves.push({ key: 'zero', color: '#94a3b8' });
    } else if (singleWaveType === 'differential') {
      if (!analysisHiddenLines.includes('value')) curves.push({ key: 'value', color: '#3b82f6' });
      if (!analysisHiddenLines.includes('diff1')) curves.push({ key: 'diff1', color: '#f97316' });
      if (!analysisHiddenLines.includes('diff2')) curves.push({ key: 'diff2', color: '#ef4444' });
    } else {
      curves.push({ key: 'value', color: '#6366f1' });
    }
    return curves;
  };

  const getChartRect = () => {
    if (!chartRef.current) return null;
    const rect = chartRef.current.getBoundingClientRect();
    const yAxisWidth = 25; // Recharts YAxis width
    const xAxisHeight = 30; // Recharts XAxis default height
    return {
      left: rect.left + margins.left + yAxisWidth,
      top: rect.top + margins.top,
      width: rect.width - margins.left - margins.right - yAxisWidth,
      height: rect.height - margins.top - margins.bottom - xAxisHeight,
    };
  };

  const pxToData = (pxX: number, pxY: number, domains: { x: [number, number], y: [number, number] }, rect: any) => {
    const xRatio = Math.max(0, Math.min(1, (pxX - rect.left) / rect.width));
    const yRatio = Math.max(0, Math.min(1, (pxY - rect.top) / rect.height)); // 0 is top (max Y)
    
    const xVal = domains.x[0] + xRatio * (domains.x[1] - domains.x[0]);
    const yVal = domains.y[1] - yRatio * (domains.y[1] - domains.y[0]);
    return { x: xVal, y: yVal };
  };

  const getLabelLayout = (pos: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' = 'top-right', r: number = 0) => {
    const width = 70;
    const height = 28;
    const r_offset = r > 0 ? r * 0.7071 : 0;
    let rx = r_offset;
    let ry = -height - r_offset;
    
    if (pos === 'top-left') {
      rx = -width - r_offset;
      ry = -height - r_offset;
    } else if (pos === 'bottom-left') {
      rx = -width - r_offset;
      ry = r_offset;
    } else if (pos === 'bottom-right') {
      rx = r_offset;
      ry = r_offset;
    }
    
    return { rx, ry, width, height };
  };

  const resetZoom = () => {
    setXDomain(['dataMin', 'dataMax']);
    setYDomain(['auto', 'auto']);
    setDiffYDomains({});
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: '【波形操作】已恢复自适应缩放视图！双相/三相波形曲线已全部重置并恢复自适应最大可视区间。' } 
    }));
  };

  const toggleAnalysisLine = (key: string) => {
    setAnalysisHiddenLines(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = getChartRect();
    if (!rect) return;
    const domains = getActualDomains();

    if (manualCalibratingPointId) {
      if (e.button === 0) { // Left click in manual calibration mode
        // 1. Check if clicking the existing calibration red dot
        const calibratingPoint = activeCondition?.points.find(p => p.id === manualCalibratingPointId);
        if (calibratingPoint?.calibration?.heads) {
          for (const h of calibratingPoint.calibration.heads) {
            const displayVal = getCalibrationY(calibratingPoint, h.index, singleWaveType);
            const timeVal = h.index / samplingFreq;
            
            let curveKey = 'value';
            let color = '#ef4444';
            if (singleWaveType === 'original') {
              if (!analysisHiddenLines.includes('A')) { curveKey = 'A'; color = '#facc15'; }
              else if (!analysisHiddenLines.includes('B')) { curveKey = 'B'; color = '#22c55e'; }
              else if (!analysisHiddenLines.includes('C')) { curveKey = 'C'; color = '#ef4444'; }
            } else if (singleWaveType === 'karenbauer') {
              if (!analysisHiddenLines.includes('alpha')) { curveKey = 'alpha'; color = '#3b82f6'; }
              else if (!analysisHiddenLines.includes('beta')) { curveKey = 'beta'; color = '#a855f7'; }
              else if (!analysisHiddenLines.includes('zero')) { curveKey = 'zero'; color = '#94a3b8'; }
            }

            const { ptX_px, ptY_px } = getPixelCoordinates(timeVal, displayVal, curveKey, rect, domains);
            
            const dotDist = Math.hypot(e.clientX - ptX_px, e.clientY - ptY_px);
            if (dotDist <= 15) {
              setActiveCalibratingPoint({
                time: timeVal,
                value: displayVal,
                curveKey: curveKey,
                color: color,
                originalIndex: h.index
              });

              setIsCalibratingDrag(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
              return;
            }

            const layout = getLabelLayout(h.labelPosition || 'top-right', 5);
            const xMin = ptX_px + layout.rx;
            const xMax = ptX_px + layout.rx + layout.width;
            const yMin = ptY_px + layout.ry;
            const yMax = ptY_px + layout.ry + layout.height;
            
            if (e.clientX >= xMin && e.clientX <= xMax && e.clientY >= yMin && e.clientY <= yMax) {
              setDraggingCalibrationLabel(true);
              e.currentTarget.setPointerCapture(e.pointerId);
              e.preventDefault();
              return;
            }
          }
        }

        // 2. Otherwise, calibrate/drag the calibration dot
        let startPoint = null;
        if (hoverDataPoint) {
          startPoint = {
            time: hoverDataPoint.time,
            value: hoverDataPoint.value,
            curveKey: hoverDataPoint.curveKey,
            color: hoverDataPoint.color,
            originalIndex: hoverDataPoint.originalIndex
          };
        } else {
          // Fallback: search closest point near cursor using Euclidean distance
          let nearest = null;
          let minPixelDist = Infinity;
          let closestCurveKey = 'value';
          let closestColor = '#6366f1';
          let closestVal = 0;
          
          const curves = getActiveCurves();
          const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);

          for (const pt of focusData) {
            for (const curve of curves) {
              let val = (pt as any)[curve.key];
              if (val === undefined && curve.key === 'value') val = pt.value;
              if (val === undefined) continue;

              let ptX_px = 0;
              let ptY_px = 0;

              if (isMultiSubplot) {
                const subIdx = getSubplotIndex(curve.key);
                const subEl = subplotElements[subIdx];
                const subDivRect = subEl.getBoundingClientRect();
                const subRect = getSubplotRect(subIdx, subDivRect);
                const subYDomain = getSubplotYDomain(curve.key);

                const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
                ptX_px = subRect.left + ptX_ratio * subRect.width;

                const ptY_ratio = (subYDomain[1] - val) / (subYDomain[1] - subYDomain[0]);
                ptY_px = subRect.top + ptY_ratio * subRect.height;
              } else {
                const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
                ptX_px = rect.left + ptX_ratio * rect.width;

                const ptY_ratio = (domains.y[1] - val) / (domains.y[1] - domains.y[0]);
                ptY_px = rect.top + ptY_ratio * rect.height;
              }

              const dist = Math.hypot(ptX_px - e.clientX, ptY_px - e.clientY);
              if (dist < minPixelDist) {
                minPixelDist = dist;
                nearest = pt;
                closestVal = val;
                closestCurveKey = curve.key;
                closestColor = curve.color;
              }
            }
          }
          
          if (nearest && minPixelDist <= settings.faultDetection.tooltipTriggerDistance) {
            startPoint = {
              time: nearest.time,
              value: closestVal,
              curveKey: closestCurveKey,
              color: closestColor,
              originalIndex: nearest.originalIndex
            };
          }
        }
        
        if (startPoint) {
          setActiveCalibratingPoint(startPoint);
          setIsCalibratingDrag(true);
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        } else {
          // Normal zoom box
          setIsZooming(true);
          setDragStartPos({ x: e.clientX, y: e.clientY });
          setCurrentMousePos({ x: e.clientX, y: e.clientY });
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
          return;
        }
      }
    }

    if (e.button === 2) { // Right click -> Pan
      let initialSubplotKey: string | null = null;
      if (singleWaveType === 'differential') {
        const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
        if (subplotElements && subplotElements.length === 3) {
          const keys = ['value', 'diff2', 'diff1'];
          for (let i = 0; i < 3; i++) {
            const subDivRect = subplotElements[i].getBoundingClientRect();
            const subRect = getSubplotRect(i, subDivRect);
            if (e.clientY >= subRect.top && e.clientY <= subRect.top + subRect.height) {
              initialSubplotKey = keys[i];
              break;
            }
          }
        }
      }

      panStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startDomainX: domains.x,
        startDomainY: initialSubplotKey ? (getSubplotYDomain(initialSubplotKey) as [number, number]) : domains.y,
        targetSubplotKey: initialSubplotKey
      };
      setIsPanning(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    
    if (e.button === 0) { // Left click
      if (cursorMode === 'data') {
        let clickedDotAnn = null;
        let clickedLabelAnn = null;
        
        const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
        for (const ann of annotations) {
          let annXPx = 0;
          let annYPx = 0;

          if (isMultiSubplot) {
            const subIdx = getSubplotIndex(ann.curveKey || 'value');
            const subEl = subplotElements[subIdx];
            const subDivRect = subEl.getBoundingClientRect();
            const subRect = getSubplotRect(subIdx, subDivRect);
            const subYDomain = getSubplotYDomain(ann.curveKey || 'value');

            annXPx = subRect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * subRect.width;
            annYPx = subRect.top + ((subYDomain[1] - ann.value) / (subYDomain[1] - subYDomain[0])) * subRect.height;
          } else {
            annXPx = rect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * rect.width;
            annYPx = rect.top + rect.height - ((ann.value - domains.y[0]) / (domains.y[1] - domains.y[0])) * rect.height;
          }
          
          // Click near data point (dot) within 12px
          if (Math.hypot(e.clientX - annXPx, e.clientY - annYPx) <= 12) {
            clickedDotAnn = ann;
            break;
          }
          
          // Click inside label bounds
          const isSelected = selectedAnnotationId === ann.id;
          const layout = getLabelLayout(ann.labelPosition, isSelected ? 5 : 4);
          const xMin = annXPx + layout.rx;
          const xMax = annXPx + layout.rx + layout.width;
          const yMin = annYPx + layout.ry;
          const yMax = annYPx + layout.ry + layout.height;
          
          if (e.clientX >= xMin && e.clientX <= xMax && e.clientY >= yMin && e.clientY <= yMax) {
            clickedLabelAnn = ann;
            break;
          }
        }

        if (clickedDotAnn) {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraggingAnnotationId(clickedDotAnn.id);
          setSelectedAnnotationId(clickedDotAnn.id);
          return;
        } else if (clickedLabelAnn) {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          setDraggingLabelId(clickedLabelAnn.id);
          setSelectedAnnotationId(clickedLabelAnn.id);
          return;
        } else if (hoverDataPoint) {
          setIsZooming(true);
          setDragStartPos({ x: e.clientX, y: e.clientY });
          setCurrentMousePos({ x: e.clientX, y: e.clientY });
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        } else {
          setIsZooming(true);
          setDragStartPos({ x: e.clientX, y: e.clientY });
          setCurrentMousePos({ x: e.clientX, y: e.clientY });
          e.currentTarget.setPointerCapture(e.pointerId);
          setSelectedAnnotationId(null);
          return;
        }
      }

      if (cursorMode === 'zoom') {
        setIsZooming(true);
        setDragStartPos({ x: e.clientX, y: e.clientY });
        setCurrentMousePos({ x: e.clientX, y: e.clientY });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    }
  };

  const handleChartMouseDown = (e: any) => {};

  const handleMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = getChartRect();
    if (rect) {
      const isInsidePlot = 
        e.clientX >= rect.left && 
        e.clientX <= rect.left + rect.width && 
        e.clientY >= rect.top && 
        e.clientY <= rect.top + rect.height;

      if (isInsidePlot) {
        const dx = Math.abs(e.clientX - lastMousePos.current.x);
        const dy = Math.abs(e.clientY - lastMousePos.current.y);
        if (dx > 10 || dy > 10) {
          setShowControls(true);
          lastMouseActivity.current = Date.now();
          lastMousePos.current = { x: e.clientX, y: e.clientY };
        }
      }
    }

    if (!rect) return;
    const domains = getActualDomains();

    if (draggingAnnotationId || draggingLabelId || isCalibratingDrag || draggingCalibrationLabel || isZooming) {
      if (hoverDataPoint !== null) {
        setHoverDataPoint(null);
      }
    }

    const isInsidePlot = 
      e.clientX >= rect.left && 
      e.clientX <= rect.left + rect.width && 
      e.clientY >= rect.top && 
      e.clientY <= rect.top + rect.height;

    if (manualCalibratingPointId && isCalibratingDrag && activeCalibratingPoint) {
      // Find closest point on current curve by Euclidean distance
      let nearest = null;
      let minPixelDist = Infinity;
      let nearestVal = 0;
      
      for (const pt of focusData) {
        let val = (pt as any)[activeCalibratingPoint.curveKey];
        if (val === undefined && activeCalibratingPoint.curveKey === 'value') val = pt.value;
        if (val === undefined) continue;
        
        const { ptX_px, ptY_px } = getPixelCoordinates(pt.time, val, activeCalibratingPoint.curveKey, rect, domains);
        
        const dist = Math.hypot(ptX_px - e.clientX, ptY_px - e.clientY);
        if (dist < minPixelDist) {
          minPixelDist = dist;
          nearest = pt;
          nearestVal = val;
        }
      }
      
      if (nearest) {
        setActiveCalibratingPoint({
          ...activeCalibratingPoint,
          time: nearest.time,
          value: nearestVal,
          originalIndex: nearest.originalIndex
        });
      }
      e.preventDefault();
      return;
    }

    if (manualCalibratingPointId && draggingCalibrationLabel) {
      const calibratingPoint = activeCondition?.points.find(p => p.id === manualCalibratingPointId);
      if (calibratingPoint?.calibration?.heads) {
        const h = calibratingPoint.calibration.heads[0];
        if (h) {
          const displayVal = getCalibrationY(calibratingPoint, h.index, singleWaveType);
          const timeVal = h.index / samplingFreq;
          
          let curveKey = 'value';
          if (singleWaveType === 'original') {
            if (!analysisHiddenLines.includes('A')) { curveKey = 'A'; }
            else if (!analysisHiddenLines.includes('B')) { curveKey = 'B'; }
            else if (!analysisHiddenLines.includes('C')) { curveKey = 'C'; }
          } else if (singleWaveType === 'karenbauer') {
            if (!analysisHiddenLines.includes('alpha')) { curveKey = 'alpha'; }
            else if (!analysisHiddenLines.includes('beta')) { curveKey = 'beta'; }
            else if (!analysisHiddenLines.includes('zero')) { curveKey = 'zero'; }
          }

          const { ptX_px, ptY_px } = getPixelCoordinates(timeVal, displayVal, curveKey, rect, domains);
          
          const dx = e.clientX - ptX_px;
          const dy = e.clientY - ptY_px;
          let newPos: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' = 'top-right';
          if (dx >= 0 && dy < 0) newPos = 'top-right';
          else if (dx < 0 && dy < 0) newPos = 'top-left';
          else if (dx < 0 && dy >= 0) newPos = 'bottom-left';
          else if (dx >= 0 && dy >= 0) newPos = 'bottom-right';
          
          setConditions(prev => prev.map(cond => ({
            ...cond,
            points: cond.points.map(p => {
              if (p.id === manualCalibratingPointId && p.calibration) {
                const newHeads = p.calibration.heads.map(head => ({ ...head, labelPosition: newPos }));
                const initialHeads = detectionType === 'initial' ? newHeads : (p.calibration.initialHeads || []);
                const sequenceHeads = (detectionType === 'sequence' || detectionType === 'sequence-user-upload') ? newHeads : (p.calibration.sequenceHeads || []);
                return {
                  ...p,
                  calibration: {
                    ...p.calibration,
                    heads: newHeads,
                    initialHeads,
                    sequenceHeads
                  }
                };
              }
              return p;
            })
          })));
        }
      }
      e.preventDefault();
      return;
    }

    if (isPanning && panStateRef.current) {
      const { startX, startY, startDomainX, startDomainY, targetSubplotKey } = panStateRef.current;
      const dxPx = e.clientX - startX;
      const dyPx = e.clientY - startY;
      
      const dxVal = (dxPx / rect.width) * (startDomainX[1] - startDomainX[0]);
      const dyVal = (dyPx / rect.height) * (startDomainY[1] - startDomainY[0]);
      
      setXDomain([startDomainX[0] - dxVal, startDomainX[1] - dxVal]);
      
      if (singleWaveType === 'differential' && targetSubplotKey) {
        setDiffYDomains(prev => ({ 
          ...prev, 
          [targetSubplotKey]: [startDomainY[0] + dyVal, startDomainY[1] + dyVal] 
        }));
      } else {
        setYDomain([startDomainY[0] + dyVal, startDomainY[1] + dyVal]); 
      }
    } else if (isZooming && dragStartPos) {
      setCurrentMousePos({ x: e.clientX, y: e.clientY });
      setHoverDataPoint(null);
    } else {
      // Interactive modes check
      const isInteractiveMode = cursorMode === 'data' || manualCalibratingPointId !== null;
      if (!isInteractiveMode || isPanning || isZooming || !isInsidePlot) {
        setHoverDataPoint(null);
        return;
      }

      if (cursorMode === 'data' && draggingAnnotationId) {
        const ann = annotations.find(a => a.id === draggingAnnotationId);
        if (ann) {
          let nearest = null;
          let minPixelDist = Infinity;
          let nearestVal = 0;
          
          const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
          for (const pt of focusData) {
            let val = (pt as any)[ann.curveKey];
            if (val === undefined && ann.curveKey === 'value') val = pt.value;
            if (val === undefined) continue;
            
            let ptX_px = 0;
            let ptY_px = 0;

            if (isMultiSubplot) {
              const subIdx = getSubplotIndex(ann.curveKey);
              const subEl = subplotElements[subIdx];
              const subDivRect = subEl.getBoundingClientRect();
              const subRect = getSubplotRect(subIdx, subDivRect);
              const subYDomain = getSubplotYDomain(ann.curveKey);

              const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
              ptX_px = subRect.left + ptX_ratio * subRect.width;

              const ptY_ratio = (subYDomain[1] - val) / (subYDomain[1] - subYDomain[0]);
              ptY_px = subRect.top + ptY_ratio * subRect.height;
            } else {
              const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
              ptX_px = rect.left + ptX_ratio * rect.width;

              const ptY_ratio = (domains.y[1] - val) / (domains.y[1] - domains.y[0]);
              ptY_px = rect.top + ptY_ratio * rect.height;
            }
            
            const dist = Math.hypot(ptX_px - e.clientX, ptY_px - e.clientY);
            if (dist < minPixelDist) {
              minPixelDist = dist;
              nearest = pt;
              nearestVal = val;
            }
          }
          
          if (nearest) {
            setAnnotations(prev => prev.map(a => 
              a.id === draggingAnnotationId ? { ...a, time: nearest.time, value: nearestVal, originalIndex: nearest.originalIndex } : a
            ));
          }
        }
      } else if (cursorMode === 'data' && draggingLabelId) {
        const ann = annotations.find(a => a.id === draggingLabelId);
        if (ann) {
          let annXPx = 0;
          let annYPx = 0;

          const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
          if (isMultiSubplot) {
            const subIdx = getSubplotIndex(ann.curveKey || 'value');
            const subEl = subplotElements[subIdx];
            const subDivRect = subEl.getBoundingClientRect();
            const subRect = getSubplotRect(subIdx, subDivRect);
            const subYDomain = getSubplotYDomain(ann.curveKey || 'value');

            annXPx = subRect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * subRect.width;
            annYPx = subRect.top + ((subYDomain[1] - ann.value) / (subYDomain[1] - subYDomain[0])) * subRect.height;
          } else {
            annXPx = rect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * rect.width;
            annYPx = rect.top + rect.height - ((ann.value - domains.y[0]) / (domains.y[1] - domains.y[0])) * rect.height;
          }
          
          const dx = e.clientX - annXPx;
          const dy = e.clientY - annYPx;
          let newPos: 'top-right' | 'top-left' | 'bottom-left' | 'bottom-right' = 'top-right';
          if (dx >= 0 && dy < 0) newPos = 'top-right';
          else if (dx < 0 && dy < 0) newPos = 'top-left';
          else if (dx < 0 && dy >= 0) newPos = 'bottom-left';
          else if (dx >= 0 && dy >= 0) newPos = 'bottom-right';
          
          setAnnotations(prev => prev.map(a => 
            a.id === draggingLabelId ? { ...a, labelPosition: newPos } : a
          ));
        }
        e.preventDefault();
        return;
      } else {
        // Universal Hover logic based on exact Euclidean distance
        
        // Check if mouse is near any existing annotated data point (dot or label rect) in annotation mode
        if (cursorMode === 'data') {
          let isNearExistingPoint = false;
          const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
          for (const ann of annotations) {
            let annXPx = 0;
            let annYPx = 0;

            if (isMultiSubplot) {
              const subIdx = getSubplotIndex(ann.curveKey || 'value');
              const subEl = subplotElements[subIdx];
              const subDivRect = subEl.getBoundingClientRect();
              const subRect = getSubplotRect(subIdx, subDivRect);
              const subYDomain = getSubplotYDomain(ann.curveKey || 'value');

              annXPx = subRect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * subRect.width;
              annYPx = subRect.top + ((subYDomain[1] - ann.value) / (subYDomain[1] - subYDomain[0])) * subRect.height;
            } else {
              annXPx = rect.left + ((ann.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * rect.width;
              annYPx = rect.top + rect.height - ((ann.value - domains.y[0]) / (domains.y[1] - domains.y[0])) * rect.height;
            }
            
            // 1. Check dot distance (within 15px)
            if (Math.hypot(e.clientX - annXPx, e.clientY - annYPx) <= 15) {
              isNearExistingPoint = true;
              break;
            }
            
            // 2. Check label bounds with 5px padding
            const isSelected = selectedAnnotationId === ann.id;
            const layout = getLabelLayout(ann.labelPosition, isSelected ? 5 : 4);
            const xMin = annXPx + layout.rx - 5;
            const xMax = annXPx + layout.rx + layout.width + 5;
            const yMin = annYPx + layout.ry - 5;
            const yMax = annYPx + layout.ry + layout.height + 5;
            
            if (e.clientX >= xMin && e.clientX <= xMax && e.clientY >= yMin && e.clientY <= yMax) {
              isNearExistingPoint = true;
              break;
            }
          }

          if (isNearExistingPoint) {
            setHoverDataPoint(null);
            return;
          }
        }

        // Check if mouse is near any manual calibration points or labels when manual calibrating
        if (manualCalibratingPointId) {
          let isNearExistingPoint = false;
          // Check if activePoint has heads
          if (activePoint && activePoint.calibration && activePoint.calibration.heads) {
            for (const h of activePoint.calibration.heads) {
              const displayVal = getCalibrationY(activePoint, h.index, singleWaveType);
              const timeVal = h.index / samplingFreq;
              const headXPx = rect.left + ((timeVal - domains.x[0]) / (domains.x[1] - domains.x[0])) * rect.width;
              const headYPx = rect.top + rect.height - ((displayVal - domains.y[0]) / (domains.y[1] - domains.y[0])) * rect.height;
              
              if (Math.hypot(e.clientX - headXPx, e.clientY - headYPx) <= 15) {
                isNearExistingPoint = true;
                break;
              }
              
              const labelPos = h.labelPosition || 'top-right';
              const layout = getLabelLayout(labelPos, 5);
              const xMin = headXPx + layout.rx - 5;
              const xMax = headXPx + layout.rx + layout.width + 5;
              const yMin = headYPx + layout.ry - 5;
              const yMax = headYPx + layout.ry + layout.height + 5;
              
              if (e.clientX >= xMin && e.clientX <= xMax && e.clientY >= yMin && e.clientY <= yMax) {
                isNearExistingPoint = true;
                break;
              }
            }
          }
          
          // Also check activeCalibratingPoint if displayed
          if (!isNearExistingPoint && activeCalibratingPoint) {
            const calXPx = rect.left + ((activeCalibratingPoint.time - domains.x[0]) / (domains.x[1] - domains.x[0])) * rect.width;
            const calYPx = rect.top + rect.height - ((activeCalibratingPoint.value - domains.y[0]) / (domains.y[1] - domains.y[0])) * rect.height;
            
            if (Math.hypot(e.clientX - calXPx, e.clientY - calYPx) <= 15) {
              isNearExistingPoint = true;
            } else {
              const layout = getLabelLayout('top-right', 5);
              const xMin = calXPx + layout.rx - 5;
              const xMax = calXPx + layout.rx + layout.width + 5;
              const yMin = calYPx + layout.ry - 5;
              const yMax = calYPx + layout.ry + layout.height + 5;
              
              if (e.clientX >= xMin && e.clientX <= xMax && e.clientY >= yMin && e.clientY <= yMax) {
                isNearExistingPoint = true;
              }
            }
          }

          if (isNearExistingPoint) {
            setHoverDataPoint(null);
            return;
          }
        }

        let closestPt = null;
        let closestVal = 0;
        let closestCurveKey = '';
        let closestColor = '';
        let minPixelDist = Infinity;

        const curves = getActiveCurves();
        const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);

        for (const pt of focusData) {
          for (const curve of curves) {
            let val = (pt as any)[curve.key];
            if (val === undefined && curve.key === 'value') val = pt.value;
            if (val === undefined) continue;
            
            let ptX_px = 0;
            let ptY_px = 0;

            if (isMultiSubplot) {
              const subIdx = getSubplotIndex(curve.key);
              const subEl = subplotElements[subIdx];
              const subDivRect = subEl.getBoundingClientRect();
              const subRect = getSubplotRect(subIdx, subDivRect);
              const subYDomain = getSubplotYDomain(curve.key);

              const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
              ptX_px = subRect.left + ptX_ratio * subRect.width;

              const ptY_ratio = (subYDomain[1] - val) / (subYDomain[1] - subYDomain[0]);
              ptY_px = subRect.top + ptY_ratio * subRect.height;
            } else {
              const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
              ptX_px = rect.left + ptX_ratio * rect.width;

              const ptY_ratio = (domains.y[1] - val) / (domains.y[1] - domains.y[0]);
              ptY_px = rect.top + ptY_ratio * rect.height;
            }
            
            const dist = Math.hypot(ptX_px - e.clientX, ptY_px - e.clientY);
            if (dist < minPixelDist) {
              minPixelDist = dist;
              closestPt = pt;
              closestVal = val;
              closestCurveKey = curve.key;
              closestColor = curve.color;
            }
          }
        }

        if (closestPt && minPixelDist <= settings.faultDetection.tooltipTriggerDistance) {
          setHoverDataPoint({ 
            time: closestPt.time, 
            value: closestVal, 
            originalIndex: closestPt.originalIndex, 
            curveKey: closestCurveKey, 
            color: closestColor 
          });
        } else {
          setHoverDataPoint(null);
        }
      }
    }
  };



  const handleMouseUp = (e: React.PointerEvent<HTMLDivElement>) => {
      const isActuallyDragging = draggingAnnotationId || draggingLabelId || isCalibratingDrag || draggingCalibrationLabel;
      if (!isActuallyDragging && !isZooming && !isPanning) {
        setIsPanning(false);
        setIsZooming(false);
        setDragStartPos(null);
        setCurrentMousePos(null);
        panStateRef.current = null;
        setHoverDataPoint(null);
        return;
      }

      if (manualCalibratingPointId && isCalibratingDrag && activeCalibratingPoint) {
        setConditions(prev => prev.map(cond => ({
          ...cond,
          points: cond.points.map(p => {
            if (p.id === manualCalibratingPointId && p.calibration) {
              const newHead = {
                index: activeCalibratingPoint.originalIndex,
                value: activeCalibratingPoint.value,
                amplitude: 0,
                isManual: true,
                labelPosition: p.calibration.heads[0]?.labelPosition || 'top-right'
              };
              const newHeads = [newHead];
              const initialHeads = detectionType === 'initial' ? newHeads : (p.calibration.initialHeads || []);
              const sequenceHeads = (detectionType === 'sequence' || detectionType === 'sequence-user-upload') ? newHeads : (p.calibration.sequenceHeads || []);
              return {
                ...p,
                calibration: {
                  ...p.calibration,
                  heads: newHeads,
                  initialHeads,
                  sequenceHeads
                }
              };
            }
            return p;
          })
        })));
        setIsCalibratingDrag(false);
        setActiveCalibratingPoint(null);
      }
    
      if (cursorMode === 'data') {
        if (draggingAnnotationId) {
          commitAnnotations(annotations);
          setDraggingAnnotationId(null);
        } else if (draggingLabelId) {
          commitAnnotations(annotations);
          setDraggingLabelId(null);
        } else if (isZooming && dragStartPos && currentMousePos) {
          // Handle zoom release in data mode
          const dx = Math.abs(currentMousePos.x - dragStartPos.x);
          const dy = Math.abs(currentMousePos.y - dragStartPos.y);
        
          if (dx < 5 && dy < 5) {
             // It was a click, not a drag -> add annotation
             let nearest = null;
             let minPixelDist = Infinity;
             let closestCurveKey = 'value';
             let closestColor = '#6366f1';
             let closestVal = 0;
           
             const curves = getActiveCurves();
             const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
             const rect = getChartRect();
           
             if (rect) {
               const domains = getActualDomains();
               for (const pt of focusData) {
                 for (const curve of curves) {
                   let val = (pt as any)[curve.key];
                   if (val === undefined && curve.key === 'value') val = pt.value;
                   if (val === undefined) continue;
                 
                   let ptX_px = 0;
                   let ptY_px = 0;
                 
                   if (isMultiSubplot) {
                     const subIdx = getSubplotIndex(curve.key);
                     const subEl = subplotElements[subIdx];
                     const subDivRect = subEl.getBoundingClientRect();
                     const subRect = getSubplotRect(subIdx, subDivRect);
                     const subYDomain = getSubplotYDomain(curve.key);
                   
                     const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
                     ptX_px = subRect.left + ptX_ratio * subRect.width;
                   
                     const ptY_ratio = (subYDomain[1] - val) / (subYDomain[1] - subYDomain[0]);
                     ptY_px = subRect.top + ptY_ratio * subRect.height;
                   } else {
                     const ptX_ratio = (pt.time - domains.x[0]) / (domains.x[1] - domains.x[0]);
                     ptX_px = rect.left + ptX_ratio * rect.width;
                   
                     const ptY_ratio = (domains.y[1] - val) / (domains.y[1] - domains.y[0]);
                     ptY_px = rect.top + ptY_ratio * rect.height;
                   }
                 
                   const dist = Math.hypot(ptX_px - e.clientX, ptY_px - e.clientY);
                   if (dist < minPixelDist) {
                     minPixelDist = dist;
                     nearest = pt;
                     closestVal = val;
                     closestCurveKey = curve.key;
                     closestColor = curve.color;
                   }
                 }
               }
             }

             if (nearest && minPixelDist <= settings.faultDetection.tooltipTriggerDistance) {
               const newAnn: Annotation = {
                 id: Math.random().toString(),
                 time: nearest.time,
                 value: closestVal,
                 originalIndex: nearest.originalIndex,
                 curveKey: closestCurveKey,
                 color: closestColor
               };
               if (e.ctrlKey || e.metaKey) {
                 commitAnnotations([...annotations, newAnn]);
               } else {
                 const restAnns = annotations.length > 0 ? annotations.slice(0, -1) : [];
                 commitAnnotations([...restAnns, newAnn]);
               }
               setSelectedAnnotationId(newAnn.id);
             }
          } else if (dx > 5 || dy > 5) {
             // It was a drag -> perform zoom
            const rect = getChartRect();
            if (rect) {
              const domains = getActualDomains();
            
              // Check if we are in differential mode and find which subplot was dragged
              const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
              let targetSubplotKey = null;
              let targetRect = rect;
              let targetDomains = domains;
            
              if (isMultiSubplot) {
                const isUserDebug = singleWaveType === 'user-debug';
                const expectedLen = isUserDebug ? 4 : 3;
                const keys = isUserDebug ? ['original', 'diff1', 'diff2', 'diff3'] : ['value', 'diff2', 'diff1'];
                for (let i = 0; i < expectedLen; i++) {
                  const subDivRect = subplotElements[i].getBoundingClientRect();
                  const subRect = getSubplotRect(i, subDivRect);
                  if (dragStartPos.y >= subRect.top && dragStartPos.y <= subRect.top + subRect.height) {
                    targetSubplotKey = keys[i];
                    targetRect = subRect;
                    targetDomains = { x: domains.x, y: getSubplotYDomain(keys[i]) as [number, number] };
                    break;
                  }
                }
              }

              const p1 = pxToData(dragStartPos.x, dragStartPos.y, targetDomains, targetRect);
              const p2 = pxToData(currentMousePos.x, currentMousePos.y, targetDomains, targetRect);
            
              const dx = Math.abs(currentMousePos.x - dragStartPos.x);
              const dy = Math.abs(currentMousePos.y - dragStartPos.y);
            
              const xMin = Math.min(p1.x, p2.x);
              const xMax = Math.max(p1.x, p2.x);
              const yMin = Math.min(p1.y, p2.y);
              const yMax = Math.max(p1.y, p2.y);
            
              if (dx > 5 || dy > 5) {
                if (dx > 10 && dy <= 10) {
                  setXDomain([xMin, xMax]);
                } else if (dy > 10 && dx <= 10) {
                  if (targetSubplotKey) {
                    setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                  } else {
                    setYDomain([yMin, yMax]);
                  }
                } else {
                  setXDomain([xMin, xMax]);
                  if (targetSubplotKey) {
                    setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                  } else {
                    setYDomain([yMin, yMax]);
                  }
                }
              }
            }
          }
        }
      } else {
        if (isZooming && dragStartPos && currentMousePos) {
            const rect = getChartRect();
            if (rect) {
              const domains = getActualDomains();
            
              // Check if we are in differential mode and find which subplot was dragged
              const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
              let targetSubplotKey = null;
              let targetRect = rect;
              let targetDomains = domains;
            
              if (isMultiSubplot) {
                const isUserDebug = singleWaveType === 'user-debug';
                const expectedLen = isUserDebug ? 4 : 3;
                const keys = isUserDebug ? ['original', 'diff1', 'diff2', 'diff3'] : ['value', 'diff2', 'diff1'];
                for (let i = 0; i < expectedLen; i++) {
                  const subDivRect = subplotElements[i].getBoundingClientRect();
                  const subRect = getSubplotRect(i, subDivRect);
                  if (dragStartPos.y >= subRect.top && dragStartPos.y <= subRect.top + subRect.height) {
                    targetSubplotKey = keys[i];
                    targetRect = subRect;
                    targetDomains = { x: domains.x, y: getSubplotYDomain(keys[i]) as [number, number] };
                    break;
                  }
                }
              }

              const p1 = pxToData(dragStartPos.x, dragStartPos.y, targetDomains, targetRect);
              const p2 = pxToData(currentMousePos.x, currentMousePos.y, targetDomains, targetRect);
            
              const dx = Math.abs(currentMousePos.x - dragStartPos.x);
              const dy = Math.abs(currentMousePos.y - dragStartPos.y);
            
              const xMin = Math.min(p1.x, p2.x);
              const xMax = Math.max(p1.x, p2.x);
              const yMin = Math.min(p1.y, p2.y);
              const yMax = Math.max(p1.y, p2.y);
            
              if (dx > 5 || dy > 5) {
                if (dx > 10 && dy <= 10) {
                  setXDomain([xMin, xMax]);
                } else if (dy > 10 && dx <= 10) {
                  if (targetSubplotKey) {
                    setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                  } else {
                    setYDomain([yMin, yMax]);
                  }
                } else {
                  setXDomain([xMin, xMax]);
                  if (targetSubplotKey) {
                    setDiffYDomains(prev => ({ ...prev, [targetSubplotKey]: [yMin, yMax] }));
                  } else {
                    setYDomain([yMin, yMax]);
                  }
                }
              }
            }
        }
      }

      setIsPanning(false);
      setIsZooming(false);
      setDragStartPos(null);
      setCurrentMousePos(null);
      panStateRef.current = null;
      setHoverDataPoint(null);
      setDraggingCalibrationLabel(false);
    };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement> | WheelEvent) => {
    const rect = getChartRect();
    if (!rect) return;
    const domains = getActualDomains();
    
    const clientX = 'clientX' in e ? e.clientX : (e as any).clientX;
    const clientY = 'clientY' in e ? e.clientY : (e as any).clientY;
    
    const subplotElements = chartRef.current ? chartRef.current.querySelectorAll('.flex-1.min-h-0.relative') : null;
        const isMultiSubplot = (singleWaveType === 'differential' && subplotElements && subplotElements.length === 3) || (singleWaveType === 'user-debug' && subplotElements && subplotElements.length === 4);
    let targetSubplotKey: string | null = null;
    let targetRect = rect;
    let targetDomains = domains;
    
    if (isMultiSubplot) {
      const isUserDebug = singleWaveType === 'user-debug';
      const expectedLen = isUserDebug ? 4 : 3;
      const keys = isUserDebug ? ['original', 'diff1', 'diff2', 'diff3'] : ['value', 'diff2', 'diff1'];
      for (let i = 0; i < expectedLen; i++) {
        const subDivRect = subplotElements[i].getBoundingClientRect();
        const subRect = getSubplotRect(i, subDivRect);
        if (clientY >= subRect.top && clientY <= subRect.top + subRect.height) {
          targetSubplotKey = keys[i];
          targetRect = subRect;
          targetDomains = { x: domains.x, y: getSubplotYDomain(keys[i]) as [number, number] };
          break;
        }
      }
    }
    
    const xRange = targetDomains.x[1] - targetDomains.x[0];
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    
    const mouseData = pxToData(clientX, clientY, targetDomains, targetRect);
    const xRatio = (mouseData.x - targetDomains.x[0]) / xRange;
    
    const newXRange = xRange * zoomFactor;
    let newXMin = mouseData.x - newXRange * xRatio;
    let newXMax = mouseData.x + newXRange * (1 - xRatio);
    
    const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
    if (newXMin < 0) { newXMax = Math.min(maxTime, newXMax - newXMin); newXMin = 0; }
    if (newXMax > maxTime) { newXMin = Math.max(0, newXMin - (newXMax - maxTime)); newXMax = maxTime; }
    
    setXDomain([newXMin, newXMax]);
    
    const yRange = targetDomains.y[1] - targetDomains.y[0];
    const yRatio = (mouseData.y - targetDomains.y[0]) / yRange;
    const newYRange = yRange * zoomFactor;
    let newYMin = mouseData.y - newYRange * yRatio;
    let newYMax = mouseData.y + newYRange * (1 - yRatio);
    
    if (targetSubplotKey) {
      setDiffYDomains(prev => ({ ...prev, [targetSubplotKey!]: [newYMin, newYMax] }));
    } else {
      setYDomain([newYMin, newYMax]);
    }
    
    e.preventDefault();
  };

  const listRef = useRef<HTMLDivElement>(null);
  const listDragRef = useRef<{ isDragging: boolean, startX: number, startDomain: [number, number] } | null>(null);

  const handleListMouseDown = (e: React.MouseEvent) => {
    if (listXDomain[0] !== 'dataMin' && listXDomain[1] !== 'dataMax') {
      listDragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startDomain: [listXDomain[0] as number, listXDomain[1] as number]
      };
      document.addEventListener('mousemove', handleListMouseMove);
      document.addEventListener('mouseup', handleListMouseUp);
      document.body.style.cursor = 'grabbing';
    }
  };

  const handleListMouseMove = (e: MouseEvent) => {
    if (listDragRef.current && listDragRef.current.isDragging) {
      const el = listRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - listDragRef.current.startX;
      const startD = listDragRef.current.startDomain;
      const range = startD[1] - startD[0];
      const timeShift = -(dx / rect.width) * range;
      
      let newMin = startD[0] + timeShift;
      let newMax = startD[1] + timeShift;
      const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
      if (newMin < 0) {
        newMax -= newMin;
        newMin = 0;
      }
      if (newMax > maxTime) {
        newMin -= (newMax - maxTime);
        newMax = maxTime;
        if (newMin < 0) newMin = 0;
      }
      setListXDomain([newMin, newMax]);
    }
  };

  const handleListMouseUp = () => {
    if (listDragRef.current) {
      listDragRef.current.isDragging = false;
      document.removeEventListener('mousemove', handleListMouseMove);
      document.removeEventListener('mouseup', handleListMouseUp);
      document.body.style.cursor = 'default';
    }
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    
    const handleWheelNative = (e: WheelEvent) => {
       if (!e.ctrlKey) {
          // Allow normal vertical scroll when Ctrl is not pressed
          return;
       }
       e.preventDefault();
       
       const rect = el.getBoundingClientRect();
       const xRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

       const factor = e.deltaY > 0 ? 1.3 : 0.77;
       setListXDomain(prev => {
          let currentDomain = prev;
          if (currentDomain[0] === 'dataMin' || currentDomain[1] === 'dataMax') {
             const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
             currentDomain = [0, maxTime];
          }
          const range = (currentDomain[1] as number) - (currentDomain[0] as number);
          const newRange = range * factor;
          
          const mouseTime = (currentDomain[0] as number) + xRatio * range;
          
          let newMin = mouseTime - newRange * xRatio;
          let newMax = mouseTime + newRange * (1 - xRatio);
          
          const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
          if (newMin < 0) { newMax -= newMin; newMin = 0; }
          if (newMax > maxTime) { newMin -= (newMax - maxTime); newMax = maxTime; if (newMin < 0) newMin = 0; }
          
          return [newMin, newMax];
       });
    };
    
    el.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', handleWheelNative);
  }, [activePoint, samplingFreq]);

  // Main chart native wheel listener for zoom with Ctrl
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;

    const nativeWheel = (e: WheelEvent) => {
      handleWheel(e);
    };

    el.addEventListener('wheel', nativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', nativeWheel);
  }, [activePoint, samplingFreq, xDomain, yDomain]);

  const handleListWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!e.ctrlKey) {
      // Allow normal vertical scroll when Ctrl is not pressed
      return;
    }
    const el = listRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    
    // Default Recharts domain logic for XAxis zoom
    const domains = { x: listXDomain[0] === 'dataMin' ? [0, activePoint?.phaseA.length ? activePoint.phaseA.length / samplingFreq : 0] : [listXDomain[0] as number, listXDomain[1] as number] };
    const xRange = (domains.x[1] as number) - (domains.x[0] as number);
    
    const zoomFactor = e.deltaY > 0 ? 1.2 : 0.8;
    
    // mouse x relative to container
    const mouseX = e.clientX - rect.left;
    const xRatio = mouseX / rect.width;
    
    const newXRange = xRange * zoomFactor;
    let newXMin = (domains.x[0] as number) + (xRange - newXRange) * xRatio;
    let newXMax = newXMin + newXRange;
    
    const maxTime = activePoint ? activePoint.phaseA.length / samplingFreq : 0;
    if (newXMin < 0) { newXMax = Math.min(maxTime, newXMax - newXMin); newXMin = 0; }
    if (newXMax > maxTime) { newXMin = Math.max(0, newXMin - (newXMax - maxTime)); newXMax = maxTime; }
    
    setListXDomain([newXMin, newXMax]);
    e.preventDefault();
  };

  const resetListZoom = () => {
    setListXDomain(['dataMin', 'dataMax']);
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: '【波形操作】已重置主波形展示视图的水平 X 轴自适应缩放区间。' } 
    }));
  };



  useEffect(() => {
    const handleToggleCalc = () => setIsCalcDataOpen(prev => !prev);
    window.addEventListener('toggleCalculationData', handleToggleCalc);
    return () => window.removeEventListener('toggleCalculationData', handleToggleCalc);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 overflow-hidden bg-white text-gray-800 font-sans">
        {/* 1. Left Control Panel */}
      <aside className="w-64 border-r border-gray-200 flex flex-col bg-gray-50/50 shrink-0">
        <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
          <h2 className="text-sm font-semibold text-gray-700">
            数据操作与设置
          </h2>
        </div>
        
        <div className="p-4 space-y-5 flex-1 overflow-y-auto">
          {/* Settings Form */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-gray-500">工况数量</Label>
                <Input 
                  type="number" 
                  value={conditionsCount} 
                  disabled
                  className="h-8 text-sm bg-gray-50 text-gray-500"
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-gray-500">测点数量</Label>
                <Input 
                  type="number" 
                  value={pointsCount} 
                  disabled
                  className="h-8 text-sm bg-gray-50 text-gray-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-gray-500">当前选择工况</Label>
                <Select 
                  value={conditions.length > 0 ? `cond-${activeConditionIdx + 1}` : ""} 
                  disabled={conditions.length === 0}
                  onValueChange={(v) => {
                    if (!v) return;
                    const newIdx = parseInt(v.replace('cond-', '')) - 1;
                    setActiveConditionIdx(newIdx);
                    
                    const currentPointIdx = activeCondition?.points.findIndex(p => p.id === activePointId) ?? 0;
                    if (conditions[newIdx]?.points[currentPointIdx]) {
                      setActivePointId(conditions[newIdx].points[currentPointIdx].id);
                    } else if (conditions[newIdx]?.points[0]) {
                      setActivePointId(conditions[newIdx].points[0].id);
                    }
                    resetWaveformView();
                    triggerTransitionAnimation();
                    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                      detail: { message: `【工况切换】已成功加载并渲染 [ 工况 ${newIdx + 1} ]。对应的节点测量值和行波特征已自适应绘制。` } 
                    }));
                  }}
                >
                  <SelectTrigger className="h-8 text-sm bg-white">
                    <SelectValue placeholder="选择工况">
                      {conditions.length > 0 ? `工况 ${activeConditionIdx + 1}` : '选择工况'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {conditions.map((c, i) => (
                      <SelectItem key={c.id} value={`cond-${i + 1}`}>工况 {i + 1}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-gray-500">采样频率 (Hz)</Label>
                <Input 
                  type="number" 
                  value={samplingFreq} 
                  onChange={(e) => setSamplingFreq(Number(e.target.value))} 
                  className="h-8 text-sm bg-white"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              accept=".mat" 
              className="hidden" 
              onChange={handleFileImport} 
            />
            <div className="flex gap-2">
              <Button 
                variant="default" 
                className="h-9 text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white border-none shadow-sm transition-all flex items-center justify-center flex-1"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                onMouseEnter={() => {
                  window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                    detail: { message: '【导入数据】点击从本地载入包含行波录波信号的 .mat 数据文件。' } 
                  }));
                }}
              >
                <Download className="w-4 h-4 mr-1.5" /> {isImporting ? '导入中...' : '导入数据'}
              </Button>
              <Button 
                variant="outline" 
                className="h-9 text-sm font-medium border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center flex-1"
                onClick={clearAllData}
                disabled={conditions.length === 0}
                onMouseEnter={() => {
                  window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                    detail: { message: '【清除数据】清空当前所有的行波数据和标定结果。请注意保存您的工作进度！' } 
                  }));
                }}
              >
                <Eraser className="w-3.5 h-3.5 mr-1.5 text-gray-500" /> 清除数据
              </Button>
            </div>
            

          </div>

          {/* Algorithm Settings Panel */}
          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center">
              故障检测算法设置
            </h3>
            
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-gray-500">检测算法选择</Label>
                  <Select value={detectionType} onValueChange={handleDetectionTypeChange}>
                    <SelectTrigger className="h-8 text-xs bg-white w-full">
                      <SelectValue placeholder={detectionType === 'initial' ? '初始波头时间标定' : detectionType === 'sequence' ? '波头序列标定' : '波头序列标定-用户上传版'}>
                        {detectionType === 'initial' ? '初始波头时间标定' : detectionType === 'sequence' ? '波头序列标定' : '波头序列标定-用户上传版'}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">初始波头时间标定</SelectItem>
                      <SelectItem value="sequence">波头序列标定</SelectItem>
                      <SelectItem value="sequence-user-upload">波头序列标定-用户上传版</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-gray-500">相模变换函数</Label>
                  <Select value={transformType} onValueChange={(v: any) => setTransformType(v)}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="karenbauer">Karenbauer 变换</SelectItem>
                      <SelectItem value="clarke">Clarke 变换</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] text-gray-500">模量选择</Label>
                  <Select value={selectedModulus} onValueChange={(v: any) => setSelectedModulus(v)}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alpha">alpha 线模</SelectItem>
                      <SelectItem value="beta">beta 线模</SelectItem>
                      <SelectItem value="zero">0 零模</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {detectionType === 'initial' ? (
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-[10px] text-gray-500">波形数据处理</Label>
                    <Select value={processingMethod} onValueChange={(v: any) => setProcessingMethod(v)}>
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="teo">TEO 算子</SelectItem>
                        <SelectItem value="wavelet">小波变换</SelectItem>
                        <SelectItem value="diff">二次差分</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {processingMethod === 'wavelet' && (
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[10px] text-gray-500">小波函数</Label>
                      <Select value={waveletType} onValueChange={setWaveletType}>
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="db2">db2</SelectItem>
                          <SelectItem value="db4">db4</SelectItem>
                          <SelectItem value="sym2">sym2</SelectItem>
                          <SelectItem value="haar">haar</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-gray-500">PSO 种群数量</Label>
                      <Input 
                        type="number" 
                        value={settings.faultDetection.psoPopulation} 
                        onChange={(e) => updateCategorySettings('faultDetection', { psoPopulation: parseInt(e.target.value) || 0 })}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] text-gray-500">PSO 迭代次数</Label>
                      <Input 
                        type="number" 
                        value={settings.faultDetection.psoIterations} 
                        onChange={(e) => updateCategorySettings('faultDetection', { psoIterations: parseInt(e.target.value) || 0 })}
                        className="h-8 text-xs bg-white"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-gray-500">工频拟合时窗长度 (%)</Label>
                    <div className="relative">
                      <Input 
                        type="number" 
                        value={settings.faultDetection.fittingWindowPercent} 
                        onChange={(e) => updateCategorySettings('faultDetection', { fittingWindowPercent: parseInt(e.target.value) || 0 })}
                        className="h-8 text-xs bg-white w-full pr-8"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={() => {
                    handleProcessAlgorithms();
                  }} 
                  className="flex-1 h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  disabled={conditions.length === 0}
                  onMouseEnter={() => {
                    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                      detail: { message: '【自动标定】基于当前的检测算法和滤波器配置，对所有工况、所有测点自动进行初始波头时间的识别与标定。' } 
                    }));
                  }}
                >
                  标定波头
                </Button>
                <Button 
                  onClick={() => {
                    if (conditions.length === 0) {
                      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { detail: { message: `请先导入数据！`, isError: true } }));
                      return;
                    }
                    setShowExportModal(true);
                  }} 
                  className="flex-1 h-8 text-xs bg-green-600 hover:bg-green-700 text-white font-medium"
                  disabled={conditions.length === 0}
                  onMouseEnter={() => {
                    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                      detail: { message: '【导出结果】将自动/手动标定完成的初始波头到达时间结果导出为 CSV 文件。' } 
                    }));
                  }}
                >
                  导出结果
                </Button>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Window Menu Portal */}
      {windowMenuPos && (
        <div 
          className="fixed bg-white border border-gray-200 rounded-md shadow-lg z-[100] py-1 w-40"
          style={{ top: windowMenuPos.y + 4, left: windowMenuPos.x, margin: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const currentWindowOptions = getWindowOptions(detectionType);
            return currentWindowOptions.map(opt => {
              const isActive = activeWindows.some(win => win.type === opt.value);
              return (
                <button
                  key={opt.value}
                  className="w-full flex items-center px-3 py-1.5 text-xs hover:bg-gray-50 text-left"
                  onClick={() => {
                    toggleWindow(opt.value);
                    setWindowMenuPos(null);
                  }}
                >
                  <div className="w-4 h-4 mr-2 flex items-center justify-center">
                    {isActive && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  </div>
                  {opt.label}
                </button>
              );
            });
          })()}
        </div>
      )}

      {/* Middle and Right Panels Wrapper */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        <div className="flex-1 flex overflow-hidden">
          {/* 2. Middle Panel: Multi-window Waveform List */}
          <div 
            ref={middlePanelRef}
            style={{ width: `${middleWidth}px` }} 
            className="border-r border-gray-200 flex flex-col bg-[#f8fafc] shrink-0 overflow-hidden relative"
          >
            <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
              <div className="flex items-center space-x-3">
                 <h2 className="text-sm font-semibold text-gray-700">测点波形</h2>
              </div>
            </div>
            
            <div className="flex-1 overflow-hidden p-4 relative">
              {isImporting && (
                <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px]">
                   <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center gap-4">
                      <div className="relative">
                        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Download className="w-4 h-4 text-blue-600" />
                        </div>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-gray-800">正在导入数据...</p>
                        <p className="text-[10px] text-gray-400 mt-1">这可能需要几秒钟，请稍候</p>
                      </div>
                   </div>
                </div>
              )}
              {conditions.length === 0 ? (
                <div 
                  className={`h-full flex flex-col items-center justify-center text-gray-400 select-none ${isImporting ? '' : 'cursor-pointer hover:text-blue-500 hover:bg-gray-50/50 rounded-xl transition-all border-2 border-dashed border-gray-200 hover:border-blue-300'}`}
                  onClick={isImporting ? undefined : () => fileInputRef.current?.click()}
                >
                  {isImporting ? (
                    null
                  ) : (
                    <>
                      <ArrowDown className="w-8 h-8 mb-2 text-gray-400 opacity-50" />
                      <p className="text-sm font-medium">请导入数据</p>
                    </>
                  )}
                </div>
              ) : (
                <div 
                  className="h-full overflow-y-auto" 
                  ref={listRef} 
                  onDoubleClick={resetListZoom}
                  onMouseDown={handleListMouseDown}
                  onWheel={handleListWheel}
                >
                  <div className={`grid gap-4 min-h-full pb-4 ${
                     activeWindows.length === 1 ? 'grid-cols-1' : 
                     activeWindows.length === 2 ? 'grid-cols-2' : 
                     'grid-cols-3'
                  }`}>
                     {activeWindows.map(win => {
                        const winLines = getWindowLines(win.type, settings.faultDetection.curveColors);
                        const winHiddenLines = hiddenLines[win.id] || [];
                        return (
                          <div key={win.id} className="flex flex-col space-y-3 pl-1 pr-1">
                             {/* Column Header */}
                             <div className="flex items-center justify-between px-1 bg-transparent border-none shadow-none mb-0.5">
                                <Select value={win.type} onValueChange={(v) => updateWindowType(win.id, v as WindowCategory)}>
                                   <SelectTrigger className="h-7 text-[10px] w-24 bg-white border-gray-200 shadow-none">
                                      <SelectValue placeholder="选择波形">{getWindowOptions(detectionType).find(o => o.value === win.type)?.label || "选择波形"}</SelectValue>
                                   </SelectTrigger>
                                   <SelectContent>
                                      {getWindowOptions(detectionType).map(opt => (
                                         <SelectItem key={opt.value} value={opt.value} className="text-[10px]" disabled={!hasProcessed && opt.value !== 'original'}>{opt.label}</SelectItem>
                                      ))}
                                   </SelectContent>
                                </Select>
                                <div className="flex items-center space-x-2">
                                   {/* Line Visibility Toggles (Colored Dots) */}
                                   <div className="flex items-center space-x-1.5 mr-1">
                                     {winLines.map(line => (
                                       <button
                                         key={line.key}
                                         onClick={() => toggleLineVisibility(win.id, line.key)}
                                         className="w-2.5 h-2.5 rounded-full transition-opacity"
                                         style={{ 
                                           backgroundColor: line.color,
                                           opacity: winHiddenLines.includes(line.key) ? 0.2 : 1
                                         }}
                                         title={`Toggle ${line.key}`}
                                       />
                                     ))}
                                   </div>
                                   {activeWindows.length > 1 && (
                                      <button onClick={() => removeWindow(win.id)} className="p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors">
                                         <X className="w-3.5 h-3.5" />
                                      </button>
                                   )}
                                </div>
                             </div>
  
                             {activeCondition?.points.map((point, pIdx) => (
                               <Card 
                                 key={`${win.id}-${point.id}`}
                                 className={`p-0.5 ml-1 mr-1 cursor-pointer transition-all duration-200 ${activePointId === point.id ? 'ring-2 ring-blue-500 border-blue-500 bg-blue-50/20 shadow-sm' : 'hover:bg-gray-50 border-gray-200 shadow-none'}`}
                                 onClick={() => {
                                   setActivePointId(point.id);
                                   window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                                     detail: { message: `【标定焦点】已切换至 测量点 M${pIdx + 1} (对应物理节点: 节点 ${machineListFromTopology[pIdx] ?? pIdx + 1})。正在分析其三相物理行波与变换能量谱特征...` } 
                                   }));
                                   resetWaveformView();
                                   triggerTransitionAnimation();
                                 }}
                               >
                                 <div className="text-[10px] font-medium text-gray-600 px-1 flex justify-between leading-none pt-0.5 pb-0">
                                    <span>{`测点M${pIdx + 1}(节点${machineListFromTopology[pIdx] ?? pIdx + 1})`}</span>
                                 </div>
                                 <div 
                                    className="w-full px-0.5 pb-0.5 mt-[-1px] border border-gray-100 rounded-[1px] bg-white"
                                    style={{ height: `${settings.faultDetection.waveformChartHeight}px` }}
                                 >
                                   <ResponsiveContainer width="100%" height="100%">
                                     <LineChart data={formatWindowData(point, win.type)} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                       <XAxis dataKey="time" type="number" domain={listXDomain} hide />
                                       <YAxis domain={['auto', 'auto']} hide />
                                       {win.type === 'original' && (
                                          <>
                                             {!winHiddenLines.includes('A') && <Line type="monotone" dataKey="A" stroke={settings.faultDetection.curveColors.phaseA} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('B') && <Line type="monotone" dataKey="B" stroke={settings.faultDetection.curveColors.phaseB} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('C') && <Line type="monotone" dataKey="C" stroke={settings.faultDetection.curveColors.phaseC} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                          </>
                                       )}
                                       {win.type === 'karenbauer' && (
                                          <>
                                             {!winHiddenLines.includes('alpha') && <Line type="monotone" dataKey="alpha" stroke={settings.faultDetection.curveColors.alpha} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('beta') && <Line type="monotone" dataKey="beta" stroke={settings.faultDetection.curveColors.beta} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('zero') && <Line type="monotone" dataKey="zero" stroke={settings.faultDetection.curveColors.zero} strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                          </>
                                       )}
                                       {win.type === 'teo' && !winHiddenLines.includes('teo') && (
                                          <Line type="monotone" dataKey="teo" stroke={settings.faultDetection.curveColors.teo} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                       )}
                                       {win.type === 'differential' && (
                                          <>
                                             {!winHiddenLines.includes('diff1') && <Line type="monotone" dataKey="diff1" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('diff2') && <Line type="monotone" dataKey="diff2" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
                                          </>
                                       )}
                                       {win.type === 'user-debug' && (
                                          <>
                                             {!winHiddenLines.includes('original') && <Line type="monotone" dataKey="original" stroke="#3b82f6" strokeWidth={1} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('diff1') && <Line type="monotone" dataKey="diff1" stroke="#f97316" strokeWidth={1} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('diff2') && <Line type="monotone" dataKey="diff2" stroke="#ef4444" strokeWidth={1} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('diff3') && <Line type="monotone" dataKey="diff3" stroke="#8b5cf6" strokeWidth={1} dot={false} isAnimationActive={false} />}
                                          </>
                                       )}
                                       {win.type === 'calibration' && (
                                          <>
                                             <Line type="monotone" dataKey="A" stroke={getCalibrationLineColor(settings.faultDetection.curveColors)} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                             {point.calibration?.heads.map((h, i) => {
                                                const originalVal = point.phaseA[h.index] || 0;
                                                return (
                                                  <ReferenceDot 
                                                    key={`list-head-${i}`} 
                                                    x={h.index / samplingFreq} 
                                                    y={originalVal} 
                                                    r={2} 
                                                    fill="#ef4444" 
                                                    stroke="#fff" 
                                                    strokeWidth={1} 
                                                  />
                                                );
                                             })}
                                          </>
                                       )}
                                       {(win.type === 'noise' || win.type === 'denoise') && !winHiddenLines.includes('value') && (
                                          <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                                       )}
                                       {win.type === 'pso-compare' && (
                                          <>
                                             {!winHiddenLines.includes('modal') && <Line type="monotone" dataKey="modal" stroke="#10b981" strokeWidth={1.2} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('reconstructed') && <Line type="monotone" dataKey="reconstructed" stroke="#f59e0b" strokeWidth={1.2} dot={false} isAnimationActive={false} />}
                                             {!winHiddenLines.includes('filtered') && <Line type="monotone" dataKey="filtered" stroke="#3b82f6" strokeWidth={1.2} dot={false} isAnimationActive={false} />}
                                          </>
                                       )}
                                     </LineChart>
                                   </ResponsiveContainer>
                                 </div>
                               </Card>
                             ))}
                          </div>
                        );
                     })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resize handle between Middle and Right */}
          <div 
            className="w-1.5 bg-transparent hover:bg-blue-400 cursor-col-resize transition-colors shrink-0 z-20 group relative"
            onMouseDown={startResizing}
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 bg-gray-200 group-hover:bg-blue-400" />
          </div>
          
          {/* 3. Right Panel: Detailed View */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
             <div className="px-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
              <div className="flex items-center space-x-4">
                <h2 className="text-sm font-semibold text-gray-700">波形观测</h2>
              </div>
              
              <div className="flex items-center space-x-4 text-[10px] text-gray-400">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-500">缩放:</span> 鼠标左键框选
                </div>
                <div className="h-3 w-px bg-gray-200" />
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-500">平移:</span> 鼠标右键拖拽
                </div>
                <div className="h-3 w-px bg-gray-200" />
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-500">滚轮:</span> 水平缩放(Shift+滚轮:垂直)
                </div>
              </div>
            </div>
            
            <div className="flex-1 min-h-0 flex flex-col relative group">
              {activePoint ? (
                <div className="flex flex-col h-full">
                  {/* Waveform View Area (Top) */}
                  <div className="flex-1 min-h-0 relative border-b border-gray-100">
                    <Card className="h-full border-none shadow-none rounded-none flex flex-col overflow-hidden relative">
                      {/* Top Overlay UI */}
                      <div className="absolute top-4 left-12 right-12 flex justify-between items-start pointer-events-none z-30">
                        <div className="flex items-center space-x-3 pointer-events-auto">
                          <Select value={singleWaveType} onValueChange={(v) => {
                            setSingleWaveType(v);
                            resetWaveformView();
                            triggerTransitionAnimation();
                          }}>
                            <SelectTrigger className="w-[110px] h-7 bg-white/80 backdrop-blur-sm text-[10px] border-gray-200 shadow-sm">
                              <SelectValue placeholder="显示波形">
                                {getWindowOptions(detectionType).find(o => o.value === singleWaveType)?.label || '显示波形'}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent className="z-[101]">
                              {getWindowOptions(detectionType).map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className="text-[10px]" disabled={!hasProcessed && opt.value !== 'original'}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          
                          <div className="text-[11px] font-medium text-gray-500 px-2 py-0.5">
                            {(() => {
                               if (!activePointId) return '';
                               const pIdx = activeCondition?.points.findIndex(p => p.id === activePointId) ?? 0;
                               return `测点M${pIdx + 1}(节点${machineListFromTopology[pIdx] ?? pIdx + 1})`;
                            })()}
                          </div>
                        </div>

                        <div className="flex items-center gap-4 pointer-events-auto">
                           {manualCalibratingPointId ? (
                             <div className="flex items-center gap-3 bg-blue-600 text-white px-3.5 py-1.5 rounded-full shadow-md border border-blue-400 animate-in fade-in slide-in-from-top-4">
                               <div className="flex items-center gap-2">
                                 <span className="text-[11px] font-bold">在曲线上点击标定波头</span>
                               </div>
                               <div className="flex items-center gap-1.5">
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     e.preventDefault();
                                     if (manualCalibratingPointId) {
                                       setConditions(prev => prev.map(cond => ({
                                         ...cond,
                                         points: cond.points.map(point => {
                                           if (point.id === manualCalibratingPointId) {
                                             const backup = backupCalibrations[manualCalibratingPointId];
                                             const newHeads = backup ? backup.heads : [];
                                             const isManual = backup ? backup.isManual : undefined;
                                             const initialHeads = detectionType === 'initial' ? newHeads : (point.calibration?.initialHeads || []);
                                             const sequenceHeads = (detectionType === 'sequence' || detectionType === 'sequence-user-upload') ? newHeads : (point.calibration?.sequenceHeads || []);
                                             return {
                                               ...point,
                                               calibration: point.calibration ? {
                                                 ...point.calibration,
                                                 heads: newHeads,
                                                 initialHeads,
                                                 sequenceHeads,
                                                 isManual
                                               } : undefined
                                             };
                                           }
                                           return point;
                                         })
                                       })));
                                     }
                                     setManualCalibratingPointId(null);
                                   }}
                                   className="bg-red-500 hover:bg-red-600 text-white px-3 py-0.5 rounded-full text-[10px] font-bold transition-colors shadow-sm"
                                 >
                                   取消标定
                                 </button>
                                 <button 
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     e.preventDefault();
                                     if (manualCalibratingPointId) {
                                       setConditions(prev => prev.map(cond => ({
                                         ...cond,
                                         points: cond.points.map(point => {
                                           if (point.id === manualCalibratingPointId) {
                                             const isManual = (point.calibration?.heads && point.calibration.heads.length > 0) ? true : point.calibration?.isManual;
                                             const initialHeads = detectionType === 'initial' ? (point.calibration?.heads || []) : (point.calibration?.initialHeads || []);
                                             const sequenceHeads = (detectionType === 'sequence' || detectionType === 'sequence-user-upload') ? (point.calibration?.heads || []) : (point.calibration?.sequenceHeads || []);
                                             return {
                                               ...point,
                                               calibration: point.calibration ? {
                                                 ...point.calibration,
                                                 isManual,
                                                 initialHeads,
                                                 sequenceHeads
                                               } : undefined
                                             };
                                           }
                                           return point;
                                         })
                                       })));
                                     }
                                     setManualCalibratingPointId(null);
                                   }}
                                   className="bg-white text-blue-600 px-3 py-0.5 rounded-full text-[10px] font-bold hover:bg-blue-50 transition-colors shadow-sm"
                                 >
                                   完成标定
                                 </button>
                               </div>
                             </div>
                           ) : (singleWaveType === 'original' || singleWaveType === 'karenbauer' || singleWaveType === 'differential' || singleWaveType === 'pso-compare') && (
                             <div className="flex items-center gap-3 px-3 py-1">
                                {singleWaveType === 'original' ? (
                                  <>
                                    <button onClick={() => toggleAnalysisLine('A')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('A') ? 'bg-gray-300' : 'bg-yellow-400'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">A相</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('B')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('B') ? 'bg-gray-300' : 'bg-green-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">B相</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('C')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('C') ? 'bg-gray-300' : 'bg-red-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">C相</span>
                                    </button>
                                  </>
                                ) : singleWaveType === 'karenbauer' ? (
                                  <>
                                    <button onClick={() => toggleAnalysisLine('alpha')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('alpha') ? 'bg-gray-300' : 'bg-blue-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">α模</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('beta')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('beta') ? 'bg-gray-300' : 'bg-purple-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">β模</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('zero')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('zero') ? 'bg-gray-300' : 'bg-slate-400'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">0模</span>
                                    </button>
                                  </>
                                ) : singleWaveType === 'pso-compare' ? (
                                  <>
                                    <button onClick={() => toggleAnalysisLine('modal')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('modal') ? 'bg-gray-300' : 'bg-emerald-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">线模信号</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('reconstructed')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('reconstructed') ? 'bg-gray-300' : 'bg-amber-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">工频重构信号</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('filtered')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('filtered') ? 'bg-gray-300' : 'bg-blue-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">工频滤除信号</span>
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button onClick={() => toggleAnalysisLine('value')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('value') ? 'bg-gray-300' : 'bg-blue-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">线模行波</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('diff1')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('diff1') ? 'bg-gray-300' : 'bg-orange-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">一阶差分</span>
                                    </button>
                                    <button onClick={() => toggleAnalysisLine('diff2')} className="flex items-center gap-1 hover:opacity-70 transition-opacity">
                                       <div className={`w-2 h-2 rounded-full ${analysisHiddenLines.includes('diff2') ? 'bg-gray-300' : 'bg-red-500'}`} />
                                       <span className="text-[10px] text-gray-500 font-medium">二阶差分</span>
                                    </button>
                                  </>
                                )}
                             </div>
                           )}
                        </div>
                      </div>

                      {/* Axis Controls (Annotate / Reset) - Top Right of Graph */}
                      <div className={`absolute top-[80px] right-8 flex flex-col gap-1.5 z-40 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
                        <div className="relative group/tooltip">
                          <Button 
                            size="icon" 
                            variant="secondary" 
                            className={`h-5 w-5 bg-white/90 shadow-sm border border-gray-100 hover:bg-white ${cursorMode === 'data' ? 'text-blue-600' : 'text-gray-500'}`}
                            onClick={() => setCursorMode(prev => {
                              const next = prev === 'data' ? 'zoom' : 'data';
                              if (next === 'zoom') {
                                setHoverDataPoint(null);
                              }
                              return next;
                            })}
                          >
                            <Crosshair className="h-2.5 w-2.5" />
                          </Button>
                          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
                            标注数据
                          </div>
                        </div>
                        <div className="relative group/tooltip">
                          <Button 
                            size="icon" 
                            variant="secondary" 
                            className="h-5 w-5 bg-white/90 shadow-sm border border-gray-100 hover:bg-white text-gray-500"
                            onClick={resetZoom}
                          >
                            <RefreshCcw className="h-2.5 w-2.5" />
                          </Button>
                          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 bg-gray-800/90 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/tooltip:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
                            重置视图
                          </div>
                        </div>
                      </div>

                      <div 
                        className="flex-1 w-full min-h-0 relative select-none" 
                        ref={chartRef}
                        onWheelCapture={handleWheel}
                        onPointerDownCapture={handleMouseDown}
                        onPointerMoveCapture={handleMouseMove}
                        onPointerUpCapture={handleMouseUp}
                        onPointerLeave={handleMouseUp}
                        onMouseDownCapture={(e) => { if (e.button === 2) e.preventDefault(); }}
                        onDoubleClick={resetZoom}
                        onContextMenu={(e) => { e.preventDefault(); return false; }}
                        style={{ touchAction: 'none' }}
                      >
                         {isZooming && dragStartPos && currentMousePos && chartRef.current && (
                           <div 
                             className={`absolute pointer-events-none z-50 flex items-center justify-center overflow-hidden ${
                               (() => {
                                 const dx = Math.abs(currentMousePos.x - dragStartPos.x);
                                 const dy = Math.abs(currentMousePos.y - dragStartPos.y);
                                 return (dx > 10 && dy <= 10) || (dy > 10 && dx <= 10) ? "" : "border border-blue-500 bg-blue-500/10";
                               })()
                             }`}
                             style={(() => {
                                const dx = Math.abs(currentMousePos.x - dragStartPos.x);
                                const dy = Math.abs(currentMousePos.y - dragStartPos.y);
                                const leftVal = Math.max(margins.left + 25, Math.min(dragStartPos.x, currentMousePos.x) - chartRef.current.getBoundingClientRect().left);
                                const widthVal = Math.abs(currentMousePos.x - dragStartPos.x);

                                if (dx > 10 && dy <= 10) {
                                  const bounds = getZoomBoxVerticalBounds();
                                  return {
                                    left: leftVal,
                                    top: bounds.middle - 10,
                                    width: widthVal,
                                    height: 20
                                  };
                                } else if (dy > 10 && dx <= 10) {
                                  const topVal = Math.max(margins.top, Math.min(dragStartPos.y, currentMousePos.y) - chartRef.current.getBoundingClientRect().top);
                                  const heightVal = Math.abs(currentMousePos.y - dragStartPos.y);
                                  return {
                                    left: leftVal - 10,
                                    top: topVal,
                                    width: 20,
                                    height: heightVal
                                  };
                                } else {
                                  const topVal = Math.max(margins.top, Math.min(dragStartPos.y, currentMousePos.y) - chartRef.current.getBoundingClientRect().top);
                                  const heightVal = Math.abs(currentMousePos.y - dragStartPos.y);
                                  return {
                                    left: leftVal,
                                    top: topVal,
                                    width: widthVal,
                                    height: heightVal
                                  };
                                }
                              })()}
                           >
                              {(() => {
                                const dx = Math.abs(currentMousePos.x - dragStartPos.x);
                                const dy = Math.abs(currentMousePos.y - dragStartPos.y);
                                if (dx > 10 && dy <= 10) {
                                  return (
                                    <div className="w-full h-px bg-blue-600 relative flex justify-between items-center">
                                       <div className="w-[1.5px] h-3 bg-blue-600 absolute -left-0" />
                                       <div className="w-[1.5px] h-3 bg-blue-600 absolute -right-0" />
                                    </div>
                                  );
                                }
                                if (dy > 10 && dx <= 10) {
                                  return (
                                    <div className="h-full w-px bg-blue-600 relative flex flex-col justify-between items-center">
                                       <div className="h-[1.5px] w-3 bg-blue-600 absolute -top-0" />
                                       <div className="h-[1.5px] w-3 bg-blue-600 absolute -bottom-0" />
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                           </div>
                         )}

                         {singleWaveType === 'differential' ? (
                          <div className="flex flex-col h-full w-full gap-2 p-1 pt-14">
                            {/* 子图1: 线模行波 */}
                            <div className="flex-1 min-h-0 relative">
                              <div className="absolute right-4 top-1 text-[10px] font-semibold text-blue-600 bg-blue-50/90 border border-blue-100 px-1.5 py-0.5 rounded z-10">线模行波</div>
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart syncId="diffSync" data={focusData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }} onMouseDown={handleChartMouseDown}>
                                  <defs>
                                    <linearGradient id="caliShadingGradSub1" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6}/>
                                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1}/>
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                  <XAxis dataKey="time" type="number" domain={actualDomains.x} allowDataOverflow hide />
                                  <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={getSubplotYDomain('value')} allowDataOverflow tickFormatter={(val) => Math.round(val).toString()} />
                                  
                                  {/* Wave Head Shading (matching Figure 5.9) */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const sIdx = h.startIdx !== undefined ? h.startIdx : Math.max(0, h.index - 8);
                                    const sVal = getCalibrationY(activePoint, sIdx, 'differential', 'value');
                                    return (
                                      <Area
                                        key={`area-shading-diff-${i}`}
                                        type="linear"
                                        dataKey={`caliShading_${i}`}
                                        stroke="none"
                                        fill="url(#caliShadingGradSub1)"
                                        baseValue={sVal}
                                        isAnimationActive={false}
                                        activeDot={false}
                                        connectNulls={false}
                                      />
                                    );
                                  })}

                                  {!analysisHiddenLines.includes('value') && (
                                    <Line key={`val-${animationKey}`} name="线模行波" type="linear" dataKey="value" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                                  )}

                                  {/* Vertical Reference Lines for alignment correspondence */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const xVal = h.index / samplingFreq;
                                    return (
                                      <ReferenceLine
                                        key={`refline-diff1-${i}`}
                                        x={xVal}
                                        stroke="#3b82f6"
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                        label={{ value: `波头 ${i + 1}`, fill: '#3b82f6', fontSize: 9, position: 'top' }}
                                      />
                                    );
                                  })}

                                  {/* Render custom annotations for Subplot 1 */}
                                  {annotations.filter(ann => ann.curveKey === 'value').map((ann) => {
                                    const isSelected = selectedAnnotationId === ann.id;
                                    const labelPos = ann.labelPosition || 'top-right';
                                    const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                                    return (
                                      <ReferenceDot
                                        key={`ann-${ann.id}`}
                                        x={ann.time}
                                        y={ann.value}
                                        shape={(props: any) => {
                                          const { cx, cy } = props;
                                          return (
                                            <g>
                                              <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || "#3b82f6"} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                              <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : ann.color || "#3b82f6"} strokeWidth={0.8} rx={4} />
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                              </g>
                                            </g>
                                          );
                                        }}
                                      />
                                    );
                                  })}

                                  {/* Render hover dot for Subplot 1 */}
                                  {hoverDataPoint && hoverDataPoint.curveKey === 'value' && !draggingAnnotationId && !isCalibratingDrag && (
                                    <ReferenceDot
                                      key="hover-dot-sub1"
                                      x={hoverDataPoint.time}
                                      y={hoverDataPoint.value}
                                      shape={(props: any) => {
                                        const { cx, cy } = props;
                                        const layout = getLabelLayout('top-right', 4);
                                        return (
                                          <g>
                                            <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || "#3b82f6"} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                            <g style={{ pointerEvents: 'none' }}>
                                              <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || "#3b82f6"} strokeWidth={0.8} rx={4} />
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                            </g>
                                          </g>
                                        );
                                      }}
                                    />
                                  )}
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                            
                            {/* 子图2: 二阶差分 */}
                            <div className="flex-1 min-h-0 relative">
                              <div className="absolute right-4 top-1 text-[10px] font-semibold text-red-600 bg-red-50/90 border border-red-100 px-1.5 py-0.5 rounded z-10">二阶差分</div>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart syncId="diffSync" data={focusData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} onMouseDown={handleChartMouseDown}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                  <XAxis dataKey="time" type="number" domain={actualDomains.x} allowDataOverflow hide />
                                  <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={getSubplotYDomain('diff2')} allowDataOverflow tickFormatter={(val) => Math.round(val).toString()} />
                                  {!analysisHiddenLines.includes('diff2') && (
                                    <Line key={`diff2-${animationKey}`} name="二阶差分" type="linear" dataKey="diff2" stroke="#ef4444" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                                  )}

                                  {/* Vertical Reference Lines for alignment correspondence */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const xVal = h.index / samplingFreq;
                                    return (
                                      <ReferenceLine
                                        key={`refline-diff2-${i}`}
                                        x={xVal}
                                        stroke="#3b82f6"
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                      />
                                    );
                                  })}

                                  {/* Starting point (红色圆点) */}
                                  {activePoint?.calibration?.heads?.flatMap((h: any, i: number) => {
                                    const dots = [];
                                    if (h.point1 !== undefined) {
                                      const xVal = h.point1 / samplingFreq;
                                      const yVal = getCalibrationY(activePoint, h.point1, 'differential', 'diff2') || 0;
                                      dots.push({ key: `start-diff2-p1-${i}`, x: xVal, y: yVal, color: '#ef4444' });
                                    }
                                    if (h.point2 !== undefined) {
                                      const xVal = h.point2 / samplingFreq;
                                      const yVal = getCalibrationY(activePoint, h.point2, 'differential', 'diff2') || 0;
                                      dots.push({ key: `start-diff2-p2-${i}`, x: xVal, y: yVal, color: '#ef4444' });
                                    }
                                    if (dots.length === 0) {
                                      const startIdx = h.startIdx !== undefined ? h.startIdx : Math.max(0, h.index - 5);
                                      const xVal = startIdx / samplingFreq;
                                      const yVal = getCalibrationY(activePoint, startIdx, 'differential', 'diff2') || 0;
                                      dots.push({ key: `start-diff2-fallback-${i}`, x: xVal, y: yVal, color: '#ef4444' });
                                    }
                                    return dots.map((d) => (
                                      <ReferenceDot
                                        key={d.key}
                                        x={d.x}
                                        y={d.y}
                                        r={4}
                                        fill={d.color}
                                        stroke="#fff"
                                        strokeWidth={1.5}
                                      />
                                    ));
                                  })}

                                  {/* Render custom annotations for Subplot 2 */}
                                  {annotations.filter(ann => ann.curveKey === 'diff2').map((ann) => {
                                    const isSelected = selectedAnnotationId === ann.id;
                                    const labelPos = ann.labelPosition || 'top-right';
                                    const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                                    return (
                                      <ReferenceDot
                                        key={`ann-${ann.id}`}
                                        x={ann.time}
                                        y={ann.value}
                                        shape={(props: any) => {
                                          const { cx, cy } = props;
                                          return (
                                            <g>
                                              <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || "#ef4444"} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                              <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : ann.color || "#ef4444"} strokeWidth={0.8} rx={4} />
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                              </g>
                                            </g>
                                          );
                                        }}
                                      />
                                    );
                                  })}

                                  {/* Render hover dot for Subplot 2 */}
                                  {hoverDataPoint && hoverDataPoint.curveKey === 'diff2' && !draggingAnnotationId && !isCalibratingDrag && (
                                    <ReferenceDot
                                      key="hover-dot-sub2"
                                      x={hoverDataPoint.time}
                                      y={hoverDataPoint.value}
                                      shape={(props: any) => {
                                        const { cx, cy } = props;
                                        const layout = getLabelLayout('top-right', 4);
                                        return (
                                          <g>
                                            <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || "#ef4444"} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                            <g style={{ pointerEvents: 'none' }}>
                                              <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || "#ef4444"} strokeWidth={0.8} rx={4} />
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                            </g>
                                          </g>
                                        );
                                      }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>

                            {/* 子图3: 一阶差分 */}
                            <div className="flex-1 min-h-0 relative">
                              <div className="absolute right-4 top-1 text-[10px] font-semibold text-orange-600 bg-orange-50/90 border border-orange-100 px-1.5 py-0.5 rounded z-10">一阶差分</div>
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart syncId="diffSync" data={focusData} margin={{ top: 5, right: 30, left: 20, bottom: 20 }} onMouseDown={handleChartMouseDown}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                  <XAxis 
                                    dataKey="time" 
                                    type="number" 
                                    domain={actualDomains.x} 
                                    allowDataOverflow 
                                    stroke="#94a3b8" 
                                    tickFormatter={(val) => val.toFixed(3)} 
                                    tick={{fontSize: 9, fill: '#64748b'}}
                                    label={{ value: '时间 (s)', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
                                  />
                                  <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={getSubplotYDomain('diff1')} allowDataOverflow tickFormatter={(val) => Math.round(val).toString()} />
                                  {!analysisHiddenLines.includes('diff1') && (
                                    <Line key={`diff1-${animationKey}`} name="一阶差分" type="linear" dataKey="diff1" stroke="#f97316" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={false} />
                                  )}

                                  {/* Vertical Reference Lines for alignment correspondence */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const xVal = h.index / samplingFreq;
                                    return (
                                      <ReferenceLine
                                        key={`refline-diff3-${i}`}
                                        x={xVal}
                                        stroke="#3b82f6"
                                        strokeDasharray="3 3"
                                        strokeWidth={1}
                                      />
                                    );
                                  })}

                                  {/* Peak point (黑色圆点) */}
                                  {activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                    const xVal = h.index / samplingFreq;
                                    const yVal = getCalibrationY(activePoint, h.index, 'differential', 'diff1');
                                    return (
                                      <ReferenceDot
                                        key={`head-diff3-${i}`}
                                        x={xVal}
                                        y={yVal}
                                        r={4}
                                        fill="#000000"
                                        stroke="#fff"
                                        strokeWidth={1.5}
                                      />
                                    );
                                  })}

                                  {/* Render custom annotations for Subplot 3 */}
                                  {annotations.filter(ann => ann.curveKey === 'diff1').map((ann) => {
                                    const isSelected = selectedAnnotationId === ann.id;
                                    const labelPos = ann.labelPosition || 'top-right';
                                    const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                                    return (
                                      <ReferenceDot
                                        key={`ann-${ann.id}`}
                                        x={ann.time}
                                        y={ann.value}
                                        shape={(props: any) => {
                                          const { cx, cy } = props;
                                          return (
                                            <g>
                                              <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || "#f97316"} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                              <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : ann.color || "#f97316"} strokeWidth={0.8} rx={4} />
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                              </g>
                                            </g>
                                          );
                                        }}
                                      />
                                    );
                                  })}

                                  {/* Render hover dot for Subplot 3 */}
                                  {hoverDataPoint && hoverDataPoint.curveKey === 'diff1' && !draggingAnnotationId && !isCalibratingDrag && (
                                    <ReferenceDot
                                      key="hover-dot-sub3"
                                      x={hoverDataPoint.time}
                                      y={hoverDataPoint.value}
                                      shape={(props: any) => {
                                        const { cx, cy } = props;
                                        const layout = getLabelLayout('top-right', 4);
                                        return (
                                          <g>
                                            <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || "#f97316"} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                            <g style={{ pointerEvents: 'none' }}>
                                              <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || "#f97316"} strokeWidth={0.8} rx={4} />
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                              <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                            </g>
                                          </g>
                                        );
                                      }}
                                    />
                                  )}
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        ) : singleWaveType === 'user-debug' ? (
                          !activePoint.calibration?.debugWaves ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
                              <div className="w-16 h-16 mb-4 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100">
                                <Activity className="w-8 h-8 text-gray-300" />
                              </div>
                              <p className="text-sm font-medium text-gray-500 mb-1">暂无调试数据</p>
                              <p className="text-xs text-gray-400 max-w-[200px]">请在检测算法中选择“波头序列标定-用户上传版”以生成实时差分调试波形</p>
                            </div>
                          ) : (
                            <div className="flex flex-row h-full w-full overflow-hidden pt-12">
                              {/* Left Column: Subplot Waveforms */}
                              <div className="flex-1 flex flex-col h-full gap-1 p-1 overflow-hidden">
                                {[
                                  { key: 'original', label: '原始波形', color: '#3b82f6' },
                                  { key: 'diff1', label: '一阶差分', color: '#f97316' },
                                  { key: 'diff2', label: '二阶差分', color: '#ef4444' },
                                  { key: 'diff3', label: '三阶差分', color: '#8b5cf6' }
                                ].map((cfg, idx) => (
                                  <div key={cfg.key} className="flex-1 min-h-0 relative border-b border-gray-100 last:border-0">
                                    <div className={`absolute right-4 top-1 text-[9px] font-semibold bg-white/80 border px-1.5 py-0.5 rounded z-10`} style={{ color: cfg.color, borderColor: `${cfg.color}33` }}>{cfg.label}</div>
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart syncId="userDebugSync" data={focusData} margin={{ top: 5, right: 30, left: 20, bottom: idx === 3 ? 20 : 5 }} onMouseDown={handleChartMouseDown}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis 
                                          dataKey="time" 
                                          type="number" 
                                          domain={actualDomains.x} 
                                          allowDataOverflow 
                                          hide={idx !== 3}
                                          stroke="#94a3b8" 
                                          tickFormatter={(val) => val.toFixed(3)} 
                                          tick={{fontSize: 9, fill: '#64748b'}}
                                        />
                                        <YAxis width={25} stroke="#94a3b8" tick={{fontSize: 9, fill: '#64748b'}} domain={['auto', 'auto']} allowDataOverflow tickFormatter={(val) => val.toFixed(1)} />
                                        <Line 
                                          name={cfg.label} 
                                          type="linear" 
                                          dataKey={cfg.key} 
                                          stroke={cfg.color} 
                                          strokeWidth={1.2} 
                                          dot={false} 
                                          activeDot={false} 
                                          isAnimationActive={false} 
                                          connectNulls
                                        />
                                        
                                        {/* Threshold line for original wave */}
                                        {cfg.key === 'original' && activePoint.calibration?.debugInfo?.threshold && (
                                          <ReferenceLine 
                                            y={activePoint.calibration.debugInfo.threshold} 
                                            stroke="#ef4444" 
                                            strokeDasharray="3 3" 
                                            strokeWidth={1}
                                            label={{ value: '阈值', position: 'right', fill: '#ef4444', fontSize: 8 }} 
                                            isAnimationActive={false}
                                          />
                                        )}

                                        {/* Vertical lines for detected peaks - shown in all subplots for alignment */}
                                        {activePoint?.calibration?.debugInfo?.T_head?.map((idx: number, i: number) => {
                                          const xVal = idx / samplingFreq;
                                          return (
                                            <ReferenceLine
                                              key={`refline-peak-${idx}-${i}`}
                                              x={xVal}
                                              stroke="#94a3b8"
                                              strokeDasharray="2 2"
                                              strokeWidth={0.5}
                                              isAnimationActive={false}
                                            />
                                          );
                                        })}

                                        {/* Red Markers (Dots) - ONLY shown in diff2 subplot to match MATLAB subplot(413) logic */}
                                        {cfg.key === 'diff2' && activePoint?.calibration?.debugInfo?.T_head?.map((idx: number, i: number) => {
                                          const xVal = idx / samplingFreq;
                                          const dw = activePoint.calibration?.debugWaves;
                                          const yVal = dw?.diff2 ? dw.diff2[idx] : 0;

                                          return (
                                            <ReferenceDot
                                              key={`headdot-peak-${i}`}
                                              x={xVal}
                                              y={yVal}
                                              r={2.5}
                                              fill="#f43f5e"
                                              stroke="#fff"
                                              strokeWidth={1}
                                              isAnimationActive={false}
                                            />
                                          );
                                        })}

                                        {/* Hover Debug Highlight Line & Dot */}
                                        {hoveredDebugIndex !== null && (
                                          <>
                                            <ReferenceLine
                                              x={hoveredDebugIndex / samplingFreq}
                                              stroke="#d97706"
                                              strokeWidth={1.5}
                                              strokeDasharray="3 3"
                                              isAnimationActive={false}
                                            />
                                            <ReferenceDot
                                              x={hoveredDebugIndex / samplingFreq}
                                              y={getCalibrationY(activePoint, hoveredDebugIndex, 'user-debug', cfg.key) || 0}
                                              r={4}
                                              fill="#d97706"
                                              stroke="#fff"
                                              strokeWidth={1.5}
                                              isAnimationActive={false}
                                            />
                                          </>
                                        )}

                                        {/* Calibrated Result Markers - shown in original waveform subplot */}
                                        {cfg.key === 'original' && activePoint?.calibration?.heads?.map((h: any, i: number) => {
                                          const xEnd = h.index / samplingFreq;
                                          const xStart = h.startIdx / samplingFreq;
                                          const yEnd = h.value;
                                          const yStart = h.startVal;

                                          return (
                                            <React.Fragment key={`head-result-${i}`}>
                                              <ReferenceDot
                                                x={xStart}
                                                y={yStart}
                                                r={3.5}
                                                fill="#ef4444"
                                                stroke="#fff"
                                                strokeWidth={1.5}
                                                isAnimationActive={false}
                                              />
                                              <ReferenceDot
                                                x={xEnd}
                                                y={yEnd}
                                                r={3.5}
                                                fill="#3b82f6"
                                                stroke="#fff"
                                                strokeWidth={1.5}
                                                isAnimationActive={false}
                                              />
                                            </React.Fragment>
                                          );
                                        })}

                                        {/* Render custom annotations for this user-debug subplot */}
                                        {annotations.filter(ann => (ann.curveKey || 'original') === cfg.key).map((ann) => {
                                          const isSelected = selectedAnnotationId === ann.id;
                                          const labelPos = ann.labelPosition || 'top-right';
                                          const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                                          return (
                                            <ReferenceDot
                                              key={`ann-debug-${ann.id}`}
                                              x={ann.time}
                                              y={ann.value}
                                              shape={(props: any) => {
                                                const { cx, cy } = props;
                                                return (
                                                  <g>
                                                    <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || cfg.color} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                                    <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                                      <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : ann.color || cfg.color} strokeWidth={0.8} rx={4} />
                                                      <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                                      <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                                    </g>
                                                  </g>
                                                );
                                              }}
                                            />
                                          );
                                        })}

                                        {/* Render hover dot for this user-debug subplot */}
                                        {hoverDataPoint && hoverDataPoint.curveKey === cfg.key && !draggingAnnotationId && !isCalibratingDrag && (
                                          <ReferenceDot
                                            key={`hover-dot-debug-${cfg.key}`}
                                            x={hoverDataPoint.time}
                                            y={hoverDataPoint.value}
                                            shape={(props: any) => {
                                              const { cx, cy } = props;
                                              const layout = getLabelLayout('top-right', 4);
                                              return (
                                                <g>
                                                  <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || cfg.color} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                                  <g style={{ pointerEvents: 'none' }}>
                                                    <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || cfg.color} strokeWidth={0.8} rx={4} />
                                                    <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                                    <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                                  </g>
                                                </g>
                                              );
                                            }}
                                          />
                                        )}
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                ))}
                              </div>

                              {/* Right Column: Interactive Algorithm Debugging Panel */}
                              <div className="w-[380px] border-l border-gray-200 bg-slate-50 flex flex-col h-full overflow-hidden select-none">
                                {/* Tab buttons */}
                                <div className="flex border-b border-gray-200 bg-white px-2 pt-2">
                                  <button
                                    onClick={() => setDebugActiveTab('pairing')}
                                    className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-all duration-200 ${
                                      debugActiveTab === 'pairing'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                  >
                                    配对标定追踪 ({activePoint.calibration?.debugInfo?.pairingSteps?.length || 0})
                                  </button>
                                  <button
                                    onClick={() => setDebugActiveTab('extrema')}
                                    className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 transition-all duration-200 ${
                                      debugActiveTab === 'extrema'
                                        ? 'border-blue-600 text-blue-600'
                                        : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                  >
                                    二阶差分极值 ({activePoint.calibration?.debugInfo?.extrema?.length || 0})
                                  </button>
                                </div>

                                {/* Filter parameters config summary banner */}
                                <div className="px-3 py-2 bg-slate-100 border-b border-gray-200 flex flex-col gap-1 text-[10px] text-gray-500 font-mono">
                                  <div className="flex justify-between">
                                    <span>启动阈值 (Doorsill):</span>
                                    <span className="font-semibold text-blue-600">{(activePoint.calibration?.debugInfo?.threshold ?? 0.1).toFixed(4)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>最大筛选点数 (Sift Limit):</span>
                                    <span className="font-semibold text-gray-600">{settings.faultDetection.para_cali_hist_sift ?? 30}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>允许相邻间隔时间 (Proximity):</span>
                                    <span className="font-semibold text-gray-600">{settings.faultDetection.user_diff2_time ?? 7} 点</span>
                                  </div>
                                </div>

                                {/* Scrolling log list */}
                                <div className="flex-1 overflow-auto p-2 space-y-2">
                                  {debugActiveTab === 'pairing' ? (
                                    !activePoint.calibration?.debugInfo?.pairingSteps || activePoint.calibration.debugInfo.pairingSteps.length === 0 ? (
                                      <div className="text-center text-gray-400 py-8 text-xs">暂无配对标定步骤</div>
                                    ) : (
                                      activePoint.calibration.debugInfo.pairingSteps.map((step: any, i: number) => {
                                        const isSuccess = step.status === 'success';
                                        const isFailedDist = step.status === 'failed_distance';
                                        const isFailedSign = step.status === 'failed_sign';
                                        const isIncomplete = step.status === 'incomplete';
                                        const isSkipped = step.status === 'skipped';

                                        let statusBg = 'bg-gray-100 text-gray-700';
                                        let statusText = '未知';
                                        if (isSuccess) { statusBg = 'bg-green-100 text-green-800'; statusText = '标定成功'; }
                                        else if (isFailedDist) { statusBg = 'bg-yellow-100 text-yellow-800'; statusText = '间隔超限'; }
                                        else if (isFailedSign) { statusBg = 'bg-orange-100 text-orange-800'; statusText = '同极性'; }
                                        else if (isIncomplete) { statusBg = 'bg-slate-200 text-slate-800'; statusText = '末尾孤立'; }
                                        else if (isSkipped) { statusBg = 'bg-red-100 text-red-800'; statusText = '提取异常'; }

                                        const isHovered = hoveredDebugIndex === step.point1 || hoveredDebugIndex === step.point2;

                                        return (
                                          <div
                                            key={`step-${i}`}
                                            className={`p-2.5 rounded-lg border text-xs transition-all duration-150 ${
                                              isHovered
                                                ? 'bg-amber-50/90 border-amber-300 shadow-sm'
                                                : isSuccess
                                                ? 'bg-green-50/30 border-green-100'
                                                : 'bg-white border-gray-200 hover:border-gray-300'
                                            }`}
                                            onMouseEnter={() => {
                                              if (step.point1 !== undefined) {
                                                setHoveredDebugIndex(step.point1);
                                              }
                                            }}
                                            onMouseLeave={() => setHoveredDebugIndex(null)}
                                          >
                                            <div className="flex items-center justify-between gap-1.5 mb-1 text-[10px] font-mono">
                                              <span className="font-bold text-gray-700">步骤 #{i + 1} (k1={step.k1})</span>
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-semibold ${statusBg}`}>{statusText}</span>
                                            </div>
                                            <p className="text-gray-600 text-[11px] leading-relaxed mb-1">{step.description}</p>
                                            
                                            {step.point1 !== undefined && (
                                              <div className="mt-1.5 pt-1 border-t border-dashed border-gray-100 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-mono text-gray-400">
                                                <span>极值点1: <b className="text-gray-600">{step.point1}点</b> ({((step.point1)/samplingFreq).toFixed(6)}s)</span>
                                                {step.point2 !== undefined && (
                                                  <span>极值点2: <b className="text-gray-600">{step.point2}点</b> ({((step.point2)/samplingFreq).toFixed(6)}s)</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )
                                  ) : (
                                    // Extrema list
                                    !activePoint.calibration?.debugInfo?.extrema || activePoint.calibration.debugInfo.extrema.length === 0 ? (
                                      <div className="text-center text-gray-400 py-8 text-xs">未搜索到局域二阶极值点</div>
                                    ) : (
                                      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                                        <table className="w-full text-left border-collapse text-[11px]">
                                          <thead>
                                            <tr className="bg-slate-100 text-slate-600 font-mono text-[10px] border-b border-gray-200">
                                              <th className="p-1.5 pl-2">极值点</th>
                                              <th className="p-1.5">二阶差分值</th>
                                              <th className="p-1.5">超阈值</th>
                                              <th className="p-1.5">排序名次</th>
                                              <th className="p-1.5 pr-2">最终决策</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {activePoint.calibration.debugInfo.extrema.map((ext: any, idx: number) => {
                                              const isHovered = hoveredDebugIndex === ext.index;
                                              return (
                                                <tr
                                                  key={`extrema-row-${idx}`}
                                                  className={`border-b border-gray-50 last:border-0 font-mono transition-colors duration-150 ${
                                                    isHovered ? 'bg-amber-100 font-semibold' : 'hover:bg-slate-100'
                                                  }`}
                                                  onMouseEnter={() => setHoveredDebugIndex(ext.index)}
                                                  onMouseLeave={() => setHoveredDebugIndex(null)}
                                                >
                                                  <td className="p-1.5 pl-2 text-gray-700">{ext.index}</td>
                                                  <td className="p-1.5 text-gray-600">{ext.val.toFixed(4)}</td>
                                                  <td className="p-1.5">
                                                    {ext.passedThreshold ? (
                                                      <span className="text-green-600 font-semibold">是</span>
                                                    ) : (
                                                      <span className="text-gray-300">否</span>
                                                    )}
                                                  </td>
                                                  <td className="p-1.5 text-gray-500">{ext.rank !== undefined ? `#${ext.rank}` : '-'}</td>
                                                  <td className="p-1.5 pr-2">
                                                    {ext.passedSift ? (
                                                      <span className="px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-semibold text-[9px]">入选配对</span>
                                                    ) : ext.passedThreshold ? (
                                                      <span className="text-yellow-600 text-[9px] font-medium">降序筛除</span>
                                                    ) : (
                                                      <span className="text-gray-300">-</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart 
                            data={focusData}
                            margin={margins}
                            onMouseDown={handleChartMouseDown}
                          >
                            <defs>
                              <linearGradient id="caliShadingGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#0b74ba" stopOpacity={0.8}/>
                                <stop offset="100%" stopColor="#0b74ba" stopOpacity={0.1}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis 
                              dataKey="time" 
                              type="number"
                              domain={actualDomains.x}
                              allowDataOverflow
                              stroke="#94a3b8"
                              tickFormatter={(val) => val.toFixed(3)}
                              tick={{fontSize: 9, fill: '#64748b'}}
                              label={{ value: '时间 (s)', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
                            />
                        <YAxis 
                              width={25}
                              stroke="#94a3b8" 
                              tick={{fontSize: 9, fill: '#64748b'}}
                              tickFormatter={(val) => Math.round(val).toString()}
                              domain={actualDomains.y}
                              allowDataOverflow
                            />
                            {singleWaveType === 'original' && (
                              <>
                                {!analysisHiddenLines.includes('A') && (
                                  <Line key={`A-${animationKey}`} name="A相" type="monotone" dataKey="A" stroke={settings.faultDetection.curveColors.phaseA} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('B') && (
                                  <Line key={`B-${animationKey}`} name="B相" type="monotone" dataKey="B" stroke={settings.faultDetection.curveColors.phaseB} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('C') && (
                                  <Line key={`C-${animationKey}`} name="C相" type="monotone" dataKey="C" stroke={settings.faultDetection.curveColors.phaseC} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                              </>
                            )}
                            {singleWaveType === 'karenbauer' && (
                              <>
                                {!analysisHiddenLines.includes('alpha') && (
                                  <Line key={`alpha-${animationKey}`} name="α模" type="monotone" dataKey="alpha" stroke={settings.faultDetection.curveColors.alpha} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('beta') && (
                                  <Line key={`beta-${animationKey}`} name="β模" type="monotone" dataKey="beta" stroke={settings.faultDetection.curveColors.beta} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('zero') && (
                                  <Line key={`zero-${animationKey}`} name="0模" type="monotone" dataKey="zero" stroke={settings.faultDetection.curveColors.zero} strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                              </>
                            )}
                            {(singleWaveType === 'teo' || singleWaveType === 'calibration' || singleWaveType === 'denoise') && (
                              <Line 
                                key={`val-${animationKey}`}
                                name="分析波形"
                                type="monotone" 
                                dataKey="value" 
                                stroke={singleWaveType === 'calibration' ? settings.faultDetection.curveColors.calibration : settings.faultDetection.curveColors.teo} 
                                strokeWidth={1.5} 
                                dot={false} 
                                activeDot={false}
                                isAnimationActive={chartAnimationMode !== 'none'}
                                animationDuration={chartAnimationMode === 'draw' ? 1000 : 500}
                              />
                            )}
                            {singleWaveType === 'pso-compare' && (
                              <>
                                {!analysisHiddenLines.includes('modal') && (
                                  <Line key={`modal-${animationKey}`} name="线模信号" type="monotone" dataKey="modal" stroke="#10b981" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('reconstructed') && (
                                  <Line key={`reconstructed-${animationKey}`} name="工频重构信号" type="monotone" dataKey="reconstructed" stroke="#f59e0b" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                                {!analysisHiddenLines.includes('filtered') && (
                                  <Line key={`filtered-${animationKey}`} name="工频滤除信号" type="monotone" dataKey="filtered" stroke="#3b82f6" strokeWidth={1.5} dot={false} activeDot={false} isAnimationActive={chartAnimationMode !== 'none'} animationDuration={chartAnimationMode === 'draw' ? 1000 : 500} />
                                )}
                              </>
                            )}
                            
                            {/* Wave Head Shading Areas (replicates MATLAB fill) */}
                            {singleWaveType === 'calibration' && activePoint?.calibration?.heads?.map((h, i) => {
                              const sIdx = h.startIdx !== undefined ? h.startIdx : Math.max(0, h.index - 8);
                              const sVal = getCalibrationY(activePoint, sIdx, 'calibration');
                              return (
                                <Area
                                  key={`area-shading-${i}`}
                                  type="monotone"
                                  dataKey={`caliShading_${i}`}
                                  stroke="none"
                                  fill="url(#caliShadingGrad)"
                                  baseValue={sVal}
                                  isAnimationActive={false}
                                  activeDot={false}
                                />
                              );
                            })}
                            
                            {!isCalibratingDrag && activePoint?.calibration?.heads?.map((h, i) => {
                              const displayVal = getCalibrationY(activePoint, h.index, singleWaveType);
                              const timeVal = h.index / samplingFreq;
                              const showLabel = manualCalibratingPointId === activePoint?.id;
                              const labelPos = h.labelPosition || 'top-right';
                              const layout = getLabelLayout(labelPos, 5);
                              return (
                                <ReferenceDot 
                                  key={`head-${i}`} 
                                  x={timeVal} 
                                  y={displayVal} 
                                  shape={(props: any) => {
                                    const { cx, cy } = props;
                                    return (
                                      <g>
                                        <circle 
                                          cx={cx} 
                                          cy={cy} 
                                          r={5} 
                                          fill="#ef4444" 
                                          stroke="#fff" 
                                          strokeWidth={2} 
                                          style={{ cursor: manualCalibratingPointId ? 'pointer' : 'default' }} 
                                        />
                                        {showLabel && (
                                          <g style={{ cursor: 'move' }}>
                                            <rect 
                                              x={cx + layout.rx} 
                                              y={cy + layout.ry} 
                                              width={layout.width} 
                                              height={layout.height} 
                                              fill="white" 
                                              stroke="#ef4444" 
                                              strokeWidth={0.8} 
                                              rx={4} 
                                            />
                                            <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {timeVal.toFixed(timePrecision)}</text>
                                            <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#ef4444">y: {displayVal.toFixed(3)}</text>
                                          </g>
                                        )}
                                      </g>
                                    );
                                  }}
                                />
                              );
                            })}

                            {isCalibratingDrag && activeCalibratingPoint && (
                              <ReferenceDot
                                key="dragging-calibration"
                                x={activeCalibratingPoint.time}
                                y={activeCalibratingPoint.value}
                                shape={(props: any) => {
                                  const { cx, cy } = props;
                                  const layout = getLabelLayout('top-right', 5);
                                  return (
                                    <g>
                                      <circle cx={cx} cy={cy} r={5} fill={activeCalibratingPoint.color} stroke="#fff" strokeWidth={2} />
                                      <g style={{ pointerEvents: 'none' }}>
                                        <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={activeCalibratingPoint.color} strokeWidth={0.8} rx={4} />
                                        <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {activeCalibratingPoint.time.toFixed(timePrecision)}</text>
                                        <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill={activeCalibratingPoint.color}>y: {activeCalibratingPoint.value.toFixed(3)}</text>
                                      </g>
                                    </g>
                                  );
                                }}
                              />
                            )}

                            {annotations.map((ann) => {
                              const isSelected = selectedAnnotationId === ann.id;
                              const labelPos = ann.labelPosition || 'top-right';
                              const layout = getLabelLayout(labelPos, isSelected ? 5 : 4);
                              return (
                                <ReferenceDot
                                  key={`ann-${ann.id}`}
                                  x={ann.time}
                                  y={ann.value}
                                  shape={(props: any) => {
                                    const { cx, cy } = props;
                                    return (
                                      <g>
                                        <circle cx={cx} cy={cy} r={isSelected ? 5 : 4} fill={ann.color || "#3b82f6"} stroke={isSelected ? "#000" : "#fff"} strokeWidth={2} style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }} />
                                        <g style={{ cursor: cursorMode === 'data' ? 'move' : 'default' }}>
                                          <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={isSelected ? "#ef4444" : ann.color || "#3b82f6"} strokeWidth={0.8} rx={4} />
                                          <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {ann.time.toFixed(timePrecision)}</text>
                                          <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {ann.value.toFixed(3)}</text>
                                        </g>
                                      </g>
                                    );
                                  }}
                                />
                              );
                            })}
                            {hoverDataPoint && !draggingAnnotationId && !isCalibratingDrag && (
                              <ReferenceDot
                                key="hover-dot"
                                x={hoverDataPoint.time}
                                y={hoverDataPoint.value}
                                shape={(props: any) => {
                                  const { cx, cy } = props;
                                  const layout = getLabelLayout('top-right', 4);
                                  return (
                                    <g>
                                      <circle cx={cx} cy={cy} r={4} fill={hoverDataPoint.color || "#3b82f6"} stroke="#fff" strokeWidth={1} pointerEvents="none" />
                                      <g style={{ pointerEvents: 'none' }}>
                                        <rect x={cx + layout.rx} y={cy + layout.ry} width={layout.width} height={layout.height} fill="white" stroke={hoverDataPoint.color || "#3b82f6"} strokeWidth={0.8} rx={4} />
                                        <text x={cx + layout.rx + 35} y={cy + layout.ry + 10} textAnchor="middle" fontSize={9} fill="#374151">x: {hoverDataPoint.time.toFixed(timePrecision)}</text>
                                        <text x={cx + layout.rx + 35} y={cy + layout.ry + 21} textAnchor="middle" fontSize={9} fill="#374151">y: {hoverDataPoint.value.toFixed(3)}</text>
                                      </g>
                                    </g>
                                  );
                                }}
                              />
                            )}
                          </ComposedChart>
                        </ResponsiveContainer>
                       )}
                      </div>
                    </Card>
                  </div>

                  {/* Vertical Resize Handle */}
                  <div 
                    className="h-1 bg-gray-100 hover:bg-blue-400 cursor-row-resize transition-colors shrink-0 z-20 group relative"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      isResizingBottomRef.current = true;
                      const startY = e.clientY;
                      const startHeight = bottomPanelHeight;
                      
                      const onMouseMove = (moveEvent: MouseEvent) => {
                        if (!isResizingBottomRef.current) return;
                        const dy = moveEvent.clientY - startY;
                        setBottomPanelHeight(Math.max(100, Math.min(600, startHeight - dy)));
                      };
                      
                      const onMouseUp = () => {
                        isResizingBottomRef.current = false;
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                      };
                      
                      document.addEventListener('mousemove', onMouseMove);
                      document.addEventListener('mouseup', onMouseUp);
                    }}
                  >
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gray-200 group-hover:bg-blue-400" />
                  </div>

                  {/* Wave Head Data Area (Bottom) */}
                  <div className="shrink-0 bg-white flex flex-col overflow-hidden" style={{ height: `${bottomPanelHeight}px` }}>
                    <div className="px-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold text-gray-700">波头标定结果</h2>
                      </div>
                      { (detectionType === 'sequence' || detectionType === 'sequence-user-upload') && (
                        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                          <button 
                            className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all ${matrixDisplayType === 'time' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setMatrixDisplayType('time')}
                          >
                            波头时间序列
                          </button>
                          <button 
                            className={`px-3 py-1 text-[10px] font-medium rounded-md transition-all ${matrixDisplayType === 'amplitude' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            onClick={() => setMatrixDisplayType('amplitude')}
                          >
                            波头幅值序列
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4">
                      {!hasProcessed ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2">
                           <Target className="w-8 h-8 opacity-20" />
                           <p className="text-xs">请先导入数据并点击“标定波头”以获取波头标定结果</p>
                        </div>
                      ) : detectionType === 'initial' ? (
                        <div className="border border-gray-100 rounded-lg overflow-hidden">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-gray-50 text-gray-500">
                              <tr>
                                <th className="px-4 py-2 font-medium border-b border-gray-100">测点</th>
                                <th className="px-4 py-2 font-medium border-b border-gray-100">节点编号</th>
                                <th className="px-4 py-2 font-medium border-b border-gray-100">初始波头到达时间 (s)</th>
                                <th className="px-4 py-2 font-medium border-b border-gray-100">状态</th>
                                <th className="px-4 py-2 font-medium border-b border-gray-100">手动标定</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {activeCondition?.points.map((p, idx) => {
                                const isCalibratingThis = manualCalibratingPointId === p.id;
                                  const backup = backupCalibrations[p.id];
                                  const head = isCalibratingThis ? backup?.heads?.[0] : p.calibration?.heads?.[0];
                                  const isManual = isCalibratingThis ? backup?.isManual : (p.calibration?.isManual || p.calibration?.heads?.some(h => h.isManual));
                                  return (
                                    <tr key={p.id} className={activePointId === p.id ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}>
                                      <td className="px-4 py-2 text-gray-700 font-medium">M{idx + 1}</td>
                                      <td className="px-4 py-2 text-gray-600">{machineListFromTopology[idx] ?? idx + 1}</td>
                                      <td className="px-4 py-2 font-mono text-blue-600">
                                        {head ? (
                                          (head.index / samplingFreq).toFixed(timePrecision)
                                        ) : (
                                          <div className="flex items-center gap-1">
                                            <span className="text-gray-400">--</span>
                                            <div className="relative">
                                              <button 
                                                className="text-blue-600 hover:text-blue-800 underline decoration-dotted underline-offset-2 ml-1 cursor-pointer transition-colors text-[10px]"
                                                onClick={(e) => {
                                                  const btn = e.currentTarget;
                                                  const popover = btn.nextElementSibling as HTMLElement;
                                                  if (popover) {
                                                    const isHidden = popover.classList.contains('hidden');
                                                    if (isHidden) {
                                                      popover.classList.remove('hidden');
                                                      popover.classList.add('block');
                                                    } else {
                                                      popover.classList.add('hidden');
                                                      popover.classList.remove('block');
                                                    }
                                                  }
                                                }}
                                              >
                                                查询原因
                                              </button>
                                              <div className="absolute bottom-full left-0 mb-2 hidden w-64 bg-white text-gray-900 text-[10px] p-3 rounded-lg shadow-2xl z-[100] border border-amber-200">
                                                <div className="flex justify-between items-center border-b border-gray-100 mb-2 pb-1">
                                                  <div className="font-bold flex items-center gap-1.5 text-amber-600">
                                                    <Target className="w-3.5 h-3.5" />
                                                    识别分析详情
                                                  </div>
                                                  <button 
                                                    onClick={(e) => {
                                                      const popover = (e.currentTarget as HTMLElement).parentElement?.parentElement;
                                                      if (popover) popover.classList.add('hidden');
                                                    }}
                                                    className="text-gray-400 hover:text-gray-600"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                </div>
                                                {p.calibration?.debugInfo ? (
                                                  <>
                                                    <div className="mt-2 space-y-1.5 border-t border-amber-50 pt-1.5">
                                                      <div className="flex justify-between items-center text-gray-500">
                                                        <span>基准时窗占比 (Pre-Fault):</span>
                                                        <span className="font-mono">{(settings.faultDetection.preFaultWindowRatio * 100).toFixed(1)}%</span>
                                                      </div>
                                                      <div className="flex justify-between items-center">
                                                        <span className="text-gray-500">正常波形突变阈值 (A):</span>
                                                        <span className="font-mono font-medium">{p.calibration.debugInfo.baseline?.toFixed(6) ?? <span className="text-gray-300">-</span>}</span>
                                                      </div>
                                                      <div className="flex justify-between items-center">
                                                        <span className="text-gray-500">阈值系数 (K):</span>
                                                        <span className="font-mono font-medium">{p.calibration.debugInfo.factor?.toFixed(2) ?? <span className="text-gray-300">-</span>}</span>
                                                      </div>
                                                      <div className="flex justify-between items-center text-amber-600 font-bold border-t border-amber-50 pt-1.5 mt-1">
                                                        <span>故障判别阈值 (A×K):</span>
                                                        <span className="font-mono">{p.calibration.debugInfo.threshold?.toFixed(6) ?? <span className="text-gray-300">-</span>}</span>
                                                      </div>
                                                    </div>
                                                    <div className="mt-2 text-gray-400 italic text-[9px] leading-tight bg-amber-50/50 p-1.5 rounded">
                                                      当前波形突变峰值未达到判别阈值，系统判定为非故障扰动，未自动标记波头。
                                                    </div>
                                                  </>
                                                ) : (
                                                  <div className="py-2 text-gray-500 italic text-center">
                                                    该点暂无详细分析数据（可能由于测点故障或尚未运行标定算法）。
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                    </td>
                                      <td className="px-4 py-2">
                                      {head ? (
                                        isManual ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                                            已手动标定
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                                            已标定
                                          </span>
                                        )
                                      ) : (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                                          待处理
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-2">
                                      <button 
                                        onClick={() => {
                                          setActivePointId(p.id);
                                          setManualCalibratingPointId(p.id);
                                          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                                            detail: { message: `【手动标定】已开启 测量点 M${idx + 1} 的手动校准模式。您可直接在右侧波形图上点击或拖动黄色标定竖线来自定义调整反射波头。` } 
                                          }));
                                          setSingleWaveType('calibration');
                                          
                                          // Backup the current calibration (heads & isManual)
                                          const backup = p.calibration ? { 
                                            heads: [...p.calibration.heads], 
                                            isManual: p.calibration.isManual 
                                          } : { 
                                            heads: [] 
                                          };
                                          setBackupCalibrations(prev => ({ ...prev, [p.id]: backup }));
                                        }}
                                        onMouseEnter={() => {
                                          window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                                            detail: { message: `【手动标定】点击开启 测量点 M${idx + 1} 的手动标定模式。可在右侧波形图上精准调整波头位置。` } 
                                          }));
                                        }}
                                        className={`inline-flex items-center px-3 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                                          manualCalibratingPointId === p.id 
                                            ? 'bg-blue-500 border-blue-500 text-white font-bold animate-pulse' 
                                            : 'border-blue-200 text-blue-600 bg-blue-50/50 hover:bg-blue-100 hover:text-blue-700'
                                        }`}
                                      >
                                        {manualCalibratingPointId === p.id ? '正在标定...' : '手动标定'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 text-[10px] text-gray-500 mb-2">
                             <div className="w-2 h-2 rounded-full bg-blue-500" />
                             <span>当前矩阵: {matrixDisplayType === 'time' ? '各测点波头到达时间序列' : '各测点波头幅值序列'}</span>
                           </div>
                           <div className="border border-gray-100 rounded-lg overflow-x-auto">
                            <table className="w-full text-[10px] text-center border-collapse whitespace-nowrap">
                              <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                  <th className="px-3 py-2 font-medium border border-gray-100">测点 \ 序号</th>
                                  {Array.from({ length: activeCondition?.points.reduce((max, p) => Math.max(max, p.calibration?.heads.length || 0), 0) || 1 }, (_, i) => i + 1).map(n => (
                                    <th key={n} className="px-3 py-2 font-medium border border-gray-100">#{n}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {activeCondition?.points.map((p, pIdx) => (
                                  <tr key={p.id} className={activePointId === p.id ? 'bg-blue-50/30' : 'hover:bg-gray-50/50'}>
                                    <td className="px-3 py-2 font-bold text-gray-700 bg-gray-50/50 border border-gray-100">M{pIdx + 1}</td>
                                    {Array.from({ length: activeCondition?.points.reduce((max, p) => Math.max(max, p.calibration?.heads.length || 0), 0) || 1 }, (_, i) => i).map(hIdx => {
                                      const head = p.calibration?.heads[hIdx];
                                      return (
                                        <td key={hIdx} className="px-3 py-2 border border-gray-100 font-mono">
                                          {head ? (
                                            matrixDisplayType === 'time' 
                                              ? (head.index / samplingFreq).toFixed(timePrecision)
                                              : (head.amplitude !== undefined ? head.amplitude : (p.phaseA[head.index] || 0)).toFixed(3)
                                          ) : '-'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                           </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-[#f8fafc]">
                  {conditions.length > 0 && (
                    <p className="text-sm">请选择测点以观察</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
      
    {/* Footer Area for Guidance */}
    <footer className="h-8 shrink-0 bg-white border-t border-gray-200 flex items-center px-4 text-xs text-gray-500">
      {(() => {
        const activeStyle = isGuidanceError
          ? (settings.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true })
          : (settings.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false });
        return (
          <>
            <Info className="w-3.5 h-3.5 mr-1.5" style={{ color: activeStyle.color }} />
            <span 
              className={`truncate w-full transition-opacity duration-300 ${activeStyle.fontFamily || 'font-sans'}`}
              style={{ 
                fontSize: `${activeStyle.fontSize || 12}px`, 
                color: activeStyle.color,
                fontStyle: activeStyle.isItalic ? 'italic' : 'normal',
                fontWeight: activeStyle.isBold ? 'bold' : 'normal',
              }}
            >
              {guidanceMsg}
            </span>
          </>
        );
      })()}
    </footer>

    {/* Overwrite Confirmation Dialog */}
    {showOverwriteModal && (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[200]">
        <div 
          className="bg-white rounded-xl shadow-xl w-[400px] max-w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150 relative"
          style={{ transform: `translate(${overwritePos.x}px, ${overwritePos.y}px)` }}
        >
          <div 
            className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 cursor-move select-none"
            onMouseDown={(e) => {
              setModalDragState({
                type: 'overwrite',
                startX: e.clientX,
                startY: e.clientY,
                startPosX: overwritePos.x,
                startPosY: overwritePos.y,
              });
            }}
          >
            <div className="flex items-center gap-2 text-amber-600">
              <Info className="w-5 h-5" />
              <h3 className="font-bold text-sm text-gray-800">标定算法设置</h3>
            </div>
            <button 
              onClick={() => setShowOverwriteModal(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-6 space-y-4">
            <p className="text-xs text-gray-600 leading-relaxed">
              已存在波头标定结果，请选择：
            </p>
            
            <div className="space-y-3">
              <label 
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-all"
                onClick={() => setOverwriteOption('all')}
              >
                <input 
                  type="radio" 
                  name="overwrite_option"
                  checked={overwriteOption === 'all'}
                  onChange={() => setOverwriteOption('all')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div>
                  <p className="text-xs font-semibold text-gray-800">1）标定结果全覆盖</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">清空旧的所有波头（含手动标定波头），重新执行自动标定</p>
                </div>
              </label>
              
              <label 
                className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-all"
                onClick={() => setOverwriteOption('protect_manual')}
              >
                <input 
                  type="radio" 
                  name="overwrite_option"
                  checked={overwriteOption === 'protect_manual'}
                  onChange={() => setOverwriteOption('protect_manual')}
                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <div>
                  <p className="text-xs font-semibold text-gray-800">2）手动标定结果保护</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">保留您手动添加或编辑的波头，仅更新自动标定的波头</p>
                </div>
              </label>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowOverwriteModal(false)}
              className="text-xs px-4 h-8"
            >
              取消
            </Button>
            <Button 
              onClick={() => {
                setShowOverwriteModal(false);
                executeCalibration(overwriteOption === 'protect_manual');
              }}
              className="text-xs px-4 h-8 bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              确认
            </Button>
          </div>
        </div>
      </div>
    )}

    {/* Export Result MAT-file Dialog */}
    {showExportModal && (
      <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-[200]">
        <div 
          className="bg-white rounded-xl shadow-xl w-[450px] max-w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150 relative"
          style={{ transform: `translate(${exportPos.x}px, ${exportPos.y}px)` }}
        >
          <div 
            className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 cursor-move select-none"
            onMouseDown={(e) => {
              setModalDragState({
                type: 'export',
                startX: e.clientX,
                startY: e.clientY,
                startPosX: exportPos.x,
                startPosY: exportPos.y,
              });
            }}
          >
            <div className="flex items-center gap-2 text-green-600">
              <Download className="w-5 h-5" />
              <h3 className="font-bold text-sm text-gray-800">导出数据选择</h3>
            </div>
            <button 
              onClick={() => setShowExportModal(false)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">选择导出的工况组</p>
                <div className="flex gap-2 text-[10px]">
                  <button 
                    className="text-blue-600 hover:underline"
                    onClick={() => setSelectedExportConditions(conditions.map((_, i) => i))}
                  >全选</button>
                  <button 
                    className="text-blue-600 hover:underline"
                    onClick={() => setSelectedExportConditions([])}
                  >取消全选</button>
                </div>
              </div>
              
              <div className="space-y-1 max-h-[120px] overflow-y-auto border border-gray-100 rounded p-2">
                {conditions.map((cond, idx) => (
                  <label key={idx} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                    <input 
                      type="checkbox" 
                      className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      checked={selectedExportConditions.includes(idx)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedExportConditions(prev => [...prev, idx]);
                        } else {
                          setSelectedExportConditions(prev => prev.filter(i => i !== idx));
                        }
                      }}
                    />
                    <span className="text-xs text-gray-700">{cond.name}</span>
                  </label>
                ))}
                {conditions.length === 0 && (
                  <div className="text-xs text-gray-400 text-center py-2">无可用数据</div>
                )}
              </div>
            </div>
          </div>
          
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-end gap-2 border-t border-gray-100">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowExportModal(false)}
              className="text-xs px-4 h-8"
            >
              取消
            </Button>
            <Button 
              onClick={executeExport}
              className="text-xs px-4 h-8 bg-green-600 hover:bg-green-700 text-white font-medium"
            >
              确认导出
            </Button>
          </div>
        </div>
      </div>
    )}


      {/* Calculation Data View Modal */}
      {isCalcDataOpen && (
        <div className="fixed inset-0 z-[110] pointer-events-none overflow-hidden">
          <motion.div 
            drag
            dragMomentum={false}
            dragElastic={0}
            // Use a function to get constraints if needed, but for now fixed values based on viewport
            dragConstraints={{ 
              left: 0, 
              right: window.innerWidth - 800, 
              top: 0, 
              bottom: window.innerHeight - 500 
            }}
            initial={{ 
              opacity: 0, 
              scale: 0.95, 
              x: Math.max(0, (window.innerWidth - 800) / 2), 
              y: 100 
            }}
            animate={{ opacity: 1, scale: 1 }}
            className="pointer-events-auto bg-white rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.15)] w-[800px] max-h-[80vh] flex flex-col overflow-hidden border border-gray-200 absolute"
            style={{ touchAction: 'none' }}
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50 cursor-move select-none active:cursor-grabbing">
              <div className="flex items-center gap-2 text-blue-600">
                <Database className="w-5 h-5" />
                <h3 className="text-base font-bold">工频重构与 PSO 计算数据查看</h3>
              </div>
              <button 
                onClick={() => setIsCalcDataOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="px-5 pt-3 border-b border-gray-100 flex gap-4 bg-gray-50/50 select-none">
              <button
                className={`pb-2 text-xs font-semibold border-b-2 px-1 transition-all duration-200 ${
                  psoActiveTab === 'errors'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
                onClick={() => setPsoActiveTab('errors')}
              >
                全局最优粒子误差 (PSO Error)
              </button>
              <button
                className={`pb-2 text-xs font-semibold border-b-2 px-1 transition-all duration-200 ${
                  psoActiveTab === 'parameters'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}
                onClick={() => setPsoActiveTab('parameters')}
              >
                工频重构参数详情 (Reconstructed Parameters)
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              <div className="space-y-6">
                {!conditions.some(c => c.points.some(p => p.psoErrors)) ? (
                  <div className="text-center py-20 text-gray-400">
                    <Eraser className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>暂无计算数据，请先导入并运行标定算法。</p>
                  </div>
                ) : psoActiveTab === 'errors' ? (
                  <div className="grid gap-6">
                    {conditions.filter(c => c.points.some(p => p.psoErrors)).map((cond, cIdx) => (
                      <div key={cond.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-700">工况 {cIdx + 1}</span>
                          <span className="text-xs text-gray-400">包含 {cond.points.length} 个测点</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-white border-b border-gray-100 text-gray-500">
                              <tr>
                                <th className="px-4 py-2 font-medium">测点 ID</th>
                                <th className="px-4 py-2 font-medium text-center">Wave 0 误差</th>
                                <th className="px-4 py-2 font-medium text-center">Wave Alpha 误差</th>
                                <th className="px-4 py-2 font-medium text-center">Wave Beta 误差</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {cond.points.map((pt, pIdx) => (
                                <tr key={pt.id} className="hover:bg-blue-50/30 transition-colors">
                                  <td className="px-4 py-2 font-medium text-gray-600">M{pIdx + 1}</td>
                                  <td className="px-4 py-2 text-center font-mono">
                                    {pt.psoErrors?.wave_0?.toFixed(6) ?? <span className="text-gray-300">-</span>}
                                  </td>
                                  <td className="px-4 py-2 text-center font-mono">
                                    {pt.psoErrors?.wave_alpha?.toFixed(6) ?? <span className="text-gray-300">-</span>}
                                  </td>
                                  <td className="px-4 py-2 text-center font-mono">
                                    {pt.psoErrors?.wave_beta?.toFixed(6) ?? <span className="text-gray-300">-</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-6">
                    {conditions.filter(c => c.points.some(p => p.psoErrors)).map((cond, cIdx) => (
                      <div key={cond.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                          <span className="text-sm font-bold text-gray-700">工况 {cIdx + 1}</span>
                          <span className="text-xs text-gray-400">包含 {cond.points.length} 个测点</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-white border-b border-gray-100 text-gray-500">
                              <tr>
                                <th className="px-4 py-2.5 font-medium">测点 ID</th>
                                <th className="px-4 py-2.5 font-medium text-center">拟合分量</th>
                                <th className="px-4 py-2.5 font-medium text-right">幅值 (A)</th>
                                <th className="px-4 py-2.5 font-medium text-right">频率 (f, Hz)</th>
                                <th className="px-4 py-2.5 font-medium text-right">相位 (θ, rad)</th>
                                <th className="px-4 py-2.5 font-medium text-right">相位 (θ, °)</th>
                                <th className="px-4 py-2.5 font-medium text-right">拟合误差</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {cond.points.map((pt, pIdx) => {
                                const mName = `M${pIdx + 1}`;
                                const waveTypes = [
                                  { key: 'wave_0', label: '0 模分量' },
                                  { key: 'wave_alpha', label: 'α 模分量' },
                                  { key: 'wave_beta', label: 'β 模分量' }
                                ] as const;

                                return waveTypes.map((wt, wtIdx) => {
                                  const param = pt.psoParams?.[wt.key];
                                  const err = pt.psoErrors?.[wt.key];
                                  let thetaDeg = '';
                                  if (param?.theta !== undefined) {
                                    let deg = (param.theta * 180) / Math.PI;
                                    deg = deg % 360;
                                    if (deg < 0) deg += 360;
                                    thetaDeg = `${deg.toFixed(2)}°`;
                                  }

                                  return (
                                    <tr key={`${pt.id}-${wt.key}`} className="hover:bg-blue-50/30 transition-colors">
                                      {wtIdx === 0 && (
                                        <td className="px-4 py-2.5 font-semibold text-gray-700 bg-gray-50/40 border-r border-gray-100" rowSpan={3}>
                                          {mName}
                                        </td>
                                      )}
                                      <td className="px-4 py-2.5 text-center font-medium text-gray-600">
                                        {wt.label}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-emerald-600 font-medium">
                                        {param?.A?.toFixed(4) ?? <span className="text-gray-300">-</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-blue-600 font-medium">
                                        {param?.f?.toFixed(2) ?? <span className="text-gray-300">-</span>} Hz
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-indigo-600">
                                        {param?.theta?.toFixed(4) ?? <span className="text-gray-300">-</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-purple-600">
                                        {thetaDeg || <span className="text-gray-300">-</span>}
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-mono text-amber-600">
                                        {err?.toFixed(6) ?? <span className="text-gray-300">-</span>}
                                      </td>
                                    </tr>
                                  );
                                });
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end bg-gray-50/50">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsCalcDataOpen(false)}
                className="text-xs"
              >
                关闭
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

export default WaveformAnalyzer;