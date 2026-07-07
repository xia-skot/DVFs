import React, { useState, useEffect } from 'react';
import { X, Save, Settings, Database, Activity, RefreshCw, MessageSquare, Info, MapPin } from 'lucide-react';
import { useSettings, defaultSettings, AppSettings } from '../contexts/SettingsContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface HotkeyRecorderProps {
  label: string;
  value: string;
  onChange: (newValue: string) => void;
}

const HotkeyRecorder: React.FC<HotkeyRecorderProps> = ({ label, value, onChange }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedStrokes, setRecordedStrokes] = useState<string[]>([]);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);
  const recordedStrokesRef = React.useRef<string[]>([]);

  useEffect(() => {
    recordedStrokesRef.current = recordedStrokes;
  }, [recordedStrokes]);

  useEffect(() => {
    if (!isRecording) {
      setRecordedStrokes([]);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const saveAndClose = (strokes: string[]) => {
      if (strokes.length > 0) {
        onChange(strokes.join(' '));
      }
      setIsRecording(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecording(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        return;
      }

      const isModifierOnly = ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph'].includes(e.key);
      if (isModifierOnly) return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Meta');

      let mainKey = e.key;
      if (mainKey === ' ') mainKey = 'Space';
      if (mainKey.length === 1) {
        mainKey = mainKey.toUpperCase();
      } else {
        mainKey = mainKey.charAt(0).toUpperCase() + mainKey.slice(1);
      }
      if (!parts.includes(mainKey)) {
        parts.push(mainKey);
      }
      const stroke = parts.join('+');

      const nextStrokes = [...recordedStrokesRef.current, stroke];
      setRecordedStrokes(nextStrokes);

      if (timerRef.current) clearTimeout(timerRef.current);

      if (nextStrokes.length >= 3) {
        saveAndClose(nextStrokes);
      } else {
        timerRef.current = setTimeout(() => {
          saveAndClose(recordedStrokesRef.current);
        }, 800);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isRecording, onChange]);

  return (
    <div className="flex flex-col space-y-1">
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsRecording(true)}
        className={`w-full h-8 px-2.5 rounded text-left text-xs font-mono flex items-center justify-between border transition-all ${
          isRecording
            ? 'border-blue-500 ring-2 ring-blue-100 bg-blue-50 text-blue-700 font-semibold'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300'
        }`}
      >
        <span className="truncate">
          {isRecording 
            ? (recordedStrokes.length > 0 
                ? `${recordedStrokes.join(' , ')} ...` 
                : '请按键... (Esc退出)') 
            : (() => {
                if (typeof value === 'string') {
                  return value.split(' ').join(', ') || '未设置';
                }
                if (value && typeof value === 'object') {
                  const parts: string[] = [];
                  if ((value as any).ctrl) parts.push('Ctrl');
                  if ((value as any).shift) parts.push('Shift');
                  if ((value as any).alt) parts.push('Alt');
                  if ((value as any).meta) parts.push('Meta');
                  if ((value as any).key) {
                    let keyName = (value as any).key;
                    if (keyName === ' ') keyName = 'Space';
                    if (keyName.length === 1) keyName = keyName.toUpperCase();
                    parts.push(keyName);
                  }
                  return parts.join('+') || '未设置';
                }
                return '未设置';
              })()}
        </span>
        {isRecording && <span className="animate-pulse text-[9px] bg-blue-200 text-blue-800 px-1 rounded shrink-0">录制</span>}
      </button>
    </div>
  );
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, initialSettings } = useSettings();
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeCategory, setActiveCategory] = useState<keyof AppSettings | 'all'>('system');

  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState<{startX: number, startY: number, startPosX: number, startPosY: number} | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      let newX = dragState.startPosX + dx;
      let newY = dragState.startPosY + dy;
      
      const w = 800; // fixed width in code
      const h = 560; // fixed height in code
      const maxX = Math.max(0, (window.innerWidth - w) / 2);
      const minX = -maxX;
      const maxY = Math.max(0, (window.innerHeight - h) / 2);
      const minY = -maxY;
      newX = Math.max(minX, Math.min(newX, maxX));
      newY = Math.max(minY, Math.min(newY, maxY));
      setModalPos({ x: newX, y: newY });
    };
    const handleMouseUp = () => setDragState(null);
    if (dragState) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState]);

  useEffect(() => {
    if (isOpen) { setModalPos({x:0, y:0}); }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    updateSettings(localSettings);
    onClose();
  };

  const handleReset = () => {
    if (confirm('确定要恢复默认设置吗？')) {
      setLocalSettings(initialSettings);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const renderCategoryContent = () => {
    switch (activeCategory) {
      case 'topology':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">拓扑构建设置</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认节点数量</label>
                  <input
                    type="number"
                    value={localSettings.topology.defaultNodeCount}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, defaultNodeCount: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认测量点数量</label>
                  <input
                    type="number"
                    value={localSettings.topology.defaultMeasuringPointCount}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, defaultMeasuringPointCount: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-2">
                <input
                  type="checkbox"
                  id="shortcutsEnabled"
                  checked={localSettings.topology.shortcutsEnabled}
                  onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, shortcutsEnabled: e.target.checked } }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="shortcutsEnabled" className="text-sm text-gray-700 cursor-pointer">启用快捷键操作</label>
              </div>
              
              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">界面布局与视图</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">拓扑构建操作区默认宽度(%)</label>
                    <input
                      type="number"
                      value={localSettings.topology.panelWidths.leftSidebar}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, panelWidths: { ...prev.topology.panelWidths, leftSidebar: Number(e.target.value) } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">测量点设置区默认宽度(%)</label>
                    <input
                      type="number"
                      value={localSettings.topology.panelWidths.rightSidebar}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, panelWidths: { ...prev.topology.panelWidths, rightSidebar: Number(e.target.value) } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-medium text-gray-700">双击自适应恢复视图边距 (px)</label>
                    <input
                      type="number"
                      value={localSettings.topology.canvasResetMargin}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, topology: { ...prev.topology, canvasResetMargin: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'faultDetection':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">故障检测与分析设置</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认采样频率 (Hz)</label>
                  <input
                    type="number"
                    value={localSettings.faultDetection.defaultSamplingFrequency}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, defaultSamplingFrequency: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">计算阈值时正常波形时窗占比</label>
                  <select
                    value={localSettings.faultDetection.preFaultWindowRatio}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, preFaultWindowRatio: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    <option value={0.25}>1/4 (前25%)</option>
                    <option value={0.333}>1/3 (前33.3%)</option>
                    <option value={0.5}>1/2 (前50%)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认检测算法</label>
                  <select
                    value={localSettings.faultDetection.defaultDetectionAlgorithm}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, defaultDetectionAlgorithm: e.target.value } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    <option value="initial">初始波头时间标定</option>
                    <option value="sequence">波头序列标定</option>
                    <option value="sequence-user-upload">波头序列标定-用户上传版</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认波头标定算法</label>
                  <select
                    value={localSettings.faultDetection.defaultCalibrationAlgorithm}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, defaultCalibrationAlgorithm: e.target.value } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  >
                    <option value="teo">TEO能量算子</option>
                    <option value="wavelet">小波变换</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">阈值系数 (K x Noise)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={localSettings.faultDetection.thresholdFactor}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, thresholdFactor: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                {localSettings.faultDetection.defaultCalibrationAlgorithm === 'wavelet' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">默认小波函数</label>
                    <select
                      value={localSettings.faultDetection.defaultWavelet}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, defaultWavelet: e.target.value } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    >
                      <option value="db2">db2</option>
                      <option value="db4">db4</option>
                      <option value="db8">db8</option>
                      <option value="sym2">sym2</option>
                      <option value="sym4">sym4</option>
                      <option value="haar">haar</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">序列标定算法配置 (PSO)</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">PSO 粒子群规模</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.psoPopulation}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, psoPopulation: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">PSO 最大迭代次数</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.psoIterations}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, psoIterations: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-xs font-medium text-gray-700">工频拟合时窗长度 (%)</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={localSettings.faultDetection.fittingWindowPercent}
                        onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, fittingWindowPercent: Number(e.target.value) } }))}
                        className="w-full h-8 px-2.5 pr-8 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                      />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">波头序列标定参数</h4>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">标定时间窗口长度</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.para_cali_windows_length ?? 3000}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, para_cali_windows_length: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">初始波头判定阈值</label>
                    <input
                      type="number"
                      step="0.01"
                      value={localSettings.faultDetection.para_cali_start_doorsill ?? 0.01}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, para_cali_start_doorsill: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">寻峰最小距离 (hist)</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.para_cali_hist ?? 200}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, para_cali_hist: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">局部极值点筛选数量</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.para_cali_hist_sift ?? 30}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, para_cali_hist_sift: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">差分点距离上限</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.user_diff2_time ?? 10}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, user_diff2_time: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">寻峰搜索范围上限</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.user_diff2_time_end ?? 50}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, user_diff2_time_end: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">标定波头数量上限</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.para_cali_head_count ?? 15}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, para_cali_head_count: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">算法执行范围控制</h4>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="calib_scope"
                      checked={localSettings.faultDetection.calibrationScope === 'all'}
                      onChange={() => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, calibrationScope: 'all' } }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-600">标定波头：采取直接计算所有工况</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="calib_scope"
                      checked={localSettings.faultDetection.calibrationScope === 'current'}
                      onChange={() => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, calibrationScope: 'current' } }))}
                      className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-600">标定波头：采取仅计算当前工况</span>
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">界面与显示</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">左侧操作栏默认宽度 (px)</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.panelWidths.leftSidebar}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, panelWidths: { ...prev.faultDetection.panelWidths, leftSidebar: Number(e.target.value) } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">测点波形默认高度 (px)</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.waveformChartHeight}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, waveformChartHeight: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">鼠标触发点距离 (px)</label>
                    <input
                      type="number"
                      value={localSettings.faultDetection.tooltipTriggerDistance}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, tooltipTriggerDistance: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">波形曲线默认颜色</h4>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(localSettings.faultDetection.curveColors).map(([key, color]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setLocalSettings(prev => ({
                          ...prev,
                          faultDetection: {
                            ...prev.faultDetection,
                            curveColors: { ...prev.faultDetection.curveColors, [key]: e.target.value }
                          }
                        }))}
                        className="w-6 h-6 p-0 border-0 rounded cursor-pointer"
                      />
                      <span className="text-xs text-gray-600">
                        {key === 'phaseA' ? 'A相' : 
                         key === 'phaseB' ? 'B相' : 
                         key === 'phaseC' ? 'C相' : 
                         key === 'alpha' ? 'Alpha模' : 
                         key === 'beta' ? 'Beta模' : 
                         key === 'teo' ? 'TEO算子' :
                         key === 'calibration' ? '标定曲线' : 'Zero模'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <h4 className="text-sm font-medium text-gray-700 mb-3">数据导出设置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">默认变量命名规则</label>
                    <input
                      type="text"
                      value={localSettings.faultDetection.exportVariableNaming}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, exportVariableNaming: e.target.value } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                      placeholder="e.g., waveform_results"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">默认导出文件夹 (建议值)</label>
                    <input
                      type="text"
                      value={localSettings.faultDetection.defaultExportFolder}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, faultDetection: { ...prev.faultDetection, defaultExportFolder: e.target.value } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                      placeholder="e.g., downloads, documents"
                    />
                    <p className="text-[10px] text-gray-400">受浏览器安全限制，仅能建议标准文件夹位置。</p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
            case 'system':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">系统全局配置</h3>
            <div className="space-y-6">
              
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-800">基本设置</h4>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">系统数据导入默认文件夹</label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={localSettings.system?.dataImportFolder || ''}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, dataImportFolder: e.target.value } }))}
                      className="flex-1 h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                      placeholder="输入文件夹路径，或留空使用浏览器默认"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">凡是导入的数据默认都会在这个文件夹中寻找，提高操作效率。</p>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800">本地数据管理中心弹窗设置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">弹窗默认宽度 (px)</label>
                    <input
                      type="number"
                      value={localSettings.system?.localLibraryWidth || 672}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, localLibraryWidth: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">弹窗默认高度 (px)</label>
                    <input
                      type="number"
                      value={localSettings.system?.localLibraryHeight || 500}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, localLibraryHeight: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">引导语与提示样式设置</h4>
                  <p className="text-xs text-gray-500 mt-0.5">单独设置常规提示和错误提示的字体样式，并能实时在下方进行预览。</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 常规提示设置 */}
                  <div className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span>
                        常规提示样式 (Regular Prompt)
                      </span>
                    </div>

                    <div className="space-y-3">
                      {/* 字体 & 字号 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-600">选择字体</label>
                          <select
                            value={localSettings.guidance?.regular?.fontFamily || 'font-sans'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  fontFamily: e.target.value
                                }
                              }
                            }))}
                            className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
                          >
                            <option value="font-sans">系统无衬线 (Sans)</option>
                            <option value="font-serif">优雅衬线体 (Serif)</option>
                            <option value="font-mono">程序员等宽 (Mono)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-600">字体大小 (px)</label>
                          <input
                            type="number"
                            min="9"
                            max="24"
                            value={localSettings.guidance?.regular?.fontSize || 12}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  fontSize: Number(e.target.value)
                                }
                              }
                            }))}
                            className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
                          />
                        </div>
                      </div>

                      {/* 颜色选择器 */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-600">文字颜色</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={localSettings.guidance?.regular?.color || '#6b7280'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  color: e.target.value
                                }
                              }
                            }))}
                            className="w-8 h-8 p-0 border border-gray-300 rounded cursor-pointer overflow-hidden"
                          />
                          <input
                            type="text"
                            value={localSettings.guidance?.regular?.color || '#6b7280'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  color: e.target.value
                                }
                              }
                            }))}
                            className="flex-1 h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white uppercase font-mono"
                            placeholder="#6B7280"
                          />
                        </div>
                      </div>

                      {/* 样式属性 */}
                      <div className="flex space-x-4 pt-1">
                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={localSettings.guidance?.regular?.isItalic ?? true}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  isItalic: e.target.checked
                                }
                              }
                            }))}
                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-600">使用斜体 (Italic)</span>
                        </label>

                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={localSettings.guidance?.regular?.isBold ?? false}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                regular: {
                                  ...(prev.guidance?.regular || { fontFamily: 'font-sans', fontSize: 12, color: '#6b7280', isItalic: true, isBold: false }),
                                  isBold: e.target.checked
                                }
                              }
                            }))}
                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-600">使用加粗 (Bold)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* 错误提示设置 */}
                  <div className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                      <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                        错误提示样式 (Error Prompt)
                      </span>
                    </div>

                    <div className="space-y-3">
                      {/* 字体 & 字号 */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-600">选择字体</label>
                          <select
                            value={localSettings.guidance?.error?.fontFamily || 'font-sans'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true }),
                                  fontFamily: e.target.value
                                }
                              }
                            }))}
                            className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
                          >
                            <option value="font-sans">系统无衬线 (Sans)</option>
                            <option value="font-serif">优雅衬线体 (Serif)</option>
                            <option value="font-mono">程序员等宽 (Mono)</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-medium text-gray-600">字体大小 (px)</label>
                          <input
                            type="number"
                            min="9"
                            max="24"
                            value={localSettings.guidance?.error?.fontSize || 12}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true }),
                                  fontSize: Number(e.target.value)
                                }
                              }
                            }))}
                            className="w-full h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white"
                          />
                        </div>
                      </div>

                      {/* 颜色选择器 */}
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-600">文字颜色</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={localSettings.guidance?.error?.color || '#dc2626'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true }),
                                  color: e.target.value
                                }
                              }
                            }))}
                            className="w-8 h-8 p-0 border border-gray-300 rounded cursor-pointer overflow-hidden"
                          />
                          <input
                            type="text"
                            value={localSettings.guidance?.error?.color || '#dc2626'}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true }),
                                  color: e.target.value
                                }
                              }
                            }))}
                            className="flex-1 h-8 px-2 text-xs border border-gray-300 rounded focus:border-blue-500 outline-none bg-white uppercase font-mono"
                            placeholder="#DC2626"
                          />
                        </div>
                      </div>

                      {/* 样式属性 */}
                      <div className="flex space-x-4 pt-1">
                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={localSettings.guidance?.error?.isItalic ?? true}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: true }),
                                  isItalic: e.target.checked
                                }
                              }
                            }))}
                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-600">使用斜体 (Italic)</span>
                        </label>

                        <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={localSettings.guidance?.error?.isBold ?? false}
                            onChange={(e) => setLocalSettings(prev => ({
                              ...prev,
                              guidance: {
                                ...prev.guidance,
                                error: {
                                  ...(prev.guidance?.error || { fontFamily: 'font-sans', fontSize: 12, color: '#dc2626', isItalic: true, isBold: false }),
                                  isBold: e.target.checked
                                }
                              }
                            }))}
                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-xs text-gray-600">使用加粗 (Bold)</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 实时效果预览 */}
                <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-2 mt-2">
                  <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1">实时预设样式预览 (Real-time Preview)</div>
                  
                  {/* 常规预览 */}
                  <div className="flex items-center text-xs">
                    <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded mr-2 font-semibold">常规</span>
                    <div className="flex items-center py-1 flex-1 border-b border-dashed border-gray-100">
                      <span
                        className={localSettings.guidance?.regular?.fontFamily || 'font-sans'}
                        style={{
                          fontSize: `${localSettings.guidance?.regular?.fontSize || 12}px`,
                          color: localSettings.guidance?.regular?.color || '#6b7280',
                          fontStyle: (localSettings.guidance?.regular?.isItalic ?? true) ? 'italic' : 'normal',
                          fontWeight: (localSettings.guidance?.regular?.isBold ?? false) ? 'bold' : 'normal',
                        }}
                      >
                        提示：请拖动测量点图标或通过快捷键来校准选中的故障检测点。
                      </span>
                    </div>
                  </div>

                  {/* 错误预览 */}
                  <div className="flex items-center text-xs">
                    <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded mr-2 font-semibold">错误</span>
                    <div className="flex items-center py-1 flex-1">
                      <span
                        className={localSettings.guidance?.error?.fontFamily || 'font-sans'}
                        style={{
                          fontSize: `${localSettings.guidance?.error?.fontSize || 12}px`,
                          color: localSettings.guidance?.error?.color || '#dc2626',
                          fontStyle: (localSettings.guidance?.error?.isItalic ?? true) ? 'italic' : 'normal',
                          fontWeight: (localSettings.guidance?.error?.isBold ?? false) ? 'bold' : 'normal',
                        }}
                      >
                        错误：无法建立网络连接，请检查当前配置并确认拓扑结构无环！
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">全局快捷键配置</h4>
                  <p className="text-[11px] text-gray-400 mt-0.5">点击下方任一快捷键框，然后按下键盘按键组合即可直接修改。支持单键或多组合键（支持 Ctrl/Alt/Shift 组合键）。</p>
                </div>

                {/* Group 1: System and Library */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-gray-700 border-l-2 border-blue-500 pl-1.5 py-0.5 bg-gray-50 rounded">系统及本地存储快捷键</div>
                  <div className="grid grid-cols-2 gap-3 pl-1">
                    <HotkeyRecorder
                      label="保存项目 (Ctrl+S 默认)"
                      value={localSettings.system?.shortcuts?.saveProject || 'Ctrl+S'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, saveProject: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="打开本地库"
                      value={localSettings.system?.shortcuts?.openLibrary || 'Ctrl+O'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, openLibrary: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="导入行波录波信号"
                      value={localSettings.system?.shortcuts?.importData || 'Ctrl+I'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, importData: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="自动算法标定波头"
                      value={localSettings.system?.shortcuts?.calibrate || 'Ctrl+B'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, calibrate: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="导出测距/标定结果"
                      value={localSettings.system?.shortcuts?.export || 'Ctrl+E'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, export: newValue }
                        }
                      }))}
                    />
                  </div>
                </div>

                {/* Group 2: Topology Builder */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-gray-700 border-l-2 border-green-500 pl-1.5 py-0.5 bg-gray-50 rounded">网络拓扑构建模块快捷键</div>
                  <div className="grid grid-cols-2 gap-3 pl-1">
                    <HotkeyRecorder
                      label="撤销 (Undo)"
                      value={localSettings.system?.shortcuts?.topoUndo || 'Ctrl+Z'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoUndo: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="重做 (Redo)"
                      value={localSettings.system?.shortcuts?.topoRedo || 'Ctrl+Y'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoRedo: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="复制节点 (Copy)"
                      value={localSettings.system?.shortcuts?.topoCopy || 'Ctrl+C'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoCopy: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="粘贴节点 (Paste)"
                      value={localSettings.system?.shortcuts?.topoPaste || 'Ctrl+V'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoPaste: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="剪切节点 (Cut)"
                      value={localSettings.system?.shortcuts?.topoCut || 'Ctrl+X'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoCut: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="镜像对称节点 (Mirror)"
                      value={localSettings.system?.shortcuts?.topoMirror || 'Ctrl+M'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoMirror: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="旋转对称节点 (Rotate)"
                      value={localSettings.system?.shortcuts?.topoRotate || 'Ctrl+R'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoRotate: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="删除选中节点 (Delete)"
                      value={localSettings.system?.shortcuts?.topoDelete || 'Delete'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, topoDelete: newValue }
                        }
                      }))}
                    />
                  </div>
                </div>

                {/* Group 3: Fault Detection */}
                <div className="space-y-2 pt-2">
                  <div className="text-xs font-semibold text-gray-700 border-l-2 border-orange-500 pl-1.5 py-0.5 bg-gray-50 rounded">故障检测与波形标注快捷键</div>
                  <div className="grid grid-cols-2 gap-3 pl-1">
                    <HotkeyRecorder
                      label="切换标注模式/缩放模式"
                      value={localSettings.system?.shortcuts?.waveToggleMode || 'Alt+D'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, waveToggleMode: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="撤销标注点"
                      value={localSettings.system?.shortcuts?.waveUndo || 'Ctrl+Z'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, waveUndo: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="重做标注点"
                      value={localSettings.system?.shortcuts?.waveRedo || 'Ctrl+Y'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, waveRedo: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="删除选中标注点"
                      value={localSettings.system?.shortcuts?.waveDelete || 'Ctrl+X'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, waveDelete: newValue }
                        }
                      }))}
                    />
                    <HotkeyRecorder
                      label="一键清除所有标注点"
                      value={localSettings.system?.shortcuts?.waveClearAll || 'Alt+D, D'}
                      onChange={(newValue) => setLocalSettings(prev => ({
                        ...prev,
                        system: {
                          ...prev.system,
                          shortcuts: { ...prev.system?.shortcuts, waveClearAll: newValue }
                        }
                      }))}
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        );
      case 'faultLocalization':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-4">故障定位配置</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认定位计算方法</label>
                  <select
                    value={localSettings.faultLocalization.defaultAlgorithm}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultLocalization: { ...prev.faultLocalization, defaultAlgorithm: e.target.value } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors bg-white"
                  >
                    <option value="double-ended">双端行波测距法</option>
                    <option value="single-ended">单端行波测距法</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">行波传播速度 (m/μs)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={localSettings.faultLocalization.waveVelocity}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultLocalization: { ...prev.faultLocalization, waveVelocity: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">默认线路总长度 (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={localSettings.faultLocalization.lineLength}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultLocalization: { ...prev.faultLocalization, lineLength: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">对时同步时钟误差上限 (μs)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={localSettings.faultLocalization.timeSyncAccuracy}
                    onChange={(e) => setLocalSettings(prev => ({ ...prev, faultLocalization: { ...prev.faultLocalization, timeSyncAccuracy: Number(e.target.value) } }))}
                    className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h4 className="text-xs font-medium text-gray-700 mb-2">定位计算参数说明</h4>
                <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-lg text-xs text-blue-800 space-y-1.5">
                  <p>1. <strong>双端行波法：</strong>利用故障发生时产生的行波传至线路两端测点的时刻差，结合线路长度和波速精确计算故障点位置。公式为：x = (L + v * dt) / 2。</p>
                  <p>2. <strong>单端行波法：</strong>利用首次到达故障行波与故障点反射波之间的时间差，结合波速计算位置。公式为：x = v * dt / 2。</p>
                  <p>3. <strong>波速 (v)：</strong>通常在线路空载情况下接近光速，标准架空线波速约为 280 ~ 298 m/μs。</p>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[1000]"
      onMouseDown={handleOverlayClick}
    >
      <div 
        className="bg-white rounded-lg shadow-2xl w-[800px] h-[560px] max-w-[90vw] max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative transition-none"
        style={{ transform: `translate(${modalPos.x}px, ${modalPos.y}px)` }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 shrink-0 cursor-move select-none"
          onMouseDown={(e) => {
            setDragState({
              startX: e.clientX,
              startY: e.clientY,
              startPosX: modalPos.x,
              startPosY: modalPos.y
            });
          }}
        >
          <div className="flex items-center space-x-2">
            <Settings className="w-5 h-5 text-gray-600" />
            <h2 className="text-base font-semibold text-gray-800">系统设置选项</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-200 rounded text-gray-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-48 bg-[#f8fafc] border-r border-gray-200 flex flex-col py-2 shrink-0 overflow-y-auto">
            <button
              onClick={() => setActiveCategory('system')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors ${
                activeCategory === 'system' ? 'bg-blue-100/50 text-blue-700 font-medium border-l-2 border-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>系统全局配置</span>
            </button>
            <button
              onClick={() => setActiveCategory('topology')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors ${
                activeCategory === 'topology' ? 'bg-blue-100/50 text-blue-700 font-medium border-l-2 border-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>拓扑构建配置</span>
            </button>
            <button
              onClick={() => setActiveCategory('faultDetection')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors ${
                activeCategory === 'faultDetection' ? 'bg-blue-100/50 text-blue-700 font-medium border-l-2 border-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>故障检测配置</span>
            </button>
            <button
              onClick={() => setActiveCategory('faultLocalization')}
              className={`flex items-center space-x-2 px-4 py-2.5 text-sm transition-colors ${
                activeCategory === 'faultLocalization' ? 'bg-blue-100/50 text-blue-700 font-medium border-l-2 border-blue-600' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 border-l-2 border-transparent'
              }`}
            >
              <MapPin className="w-4 h-4" />
              <span>故障定位配置</span>
            </button>
          </div>

          {/* Main Settings Area */}
          <div className="flex-1 p-6 overflow-y-auto bg-white">
            {renderCategoryContent()}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
          <button 
            onClick={handleReset}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>恢复默认</span>
          </button>
          <div className="flex items-center space-x-3">
            <button 
              onClick={onClose}
              className="px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-200 rounded border border-gray-300 transition-colors bg-white"
            >
              取消
            </button>
            <button 
              onClick={handleSave}
              className="flex items-center space-x-1.5 px-4 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm"
            >
              <Save className="w-3.5 h-3.5" />
              <span>确定保存</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
