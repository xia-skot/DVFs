const fs = require('fs');
let content = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');

const systemReplacement = `      case 'system':
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
                      value={localSettings.system.dataImportFolder}
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
                      value={localSettings.system.localLibraryWidth || 672}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, localLibraryWidth: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">弹窗默认高度 (px)</label>
                    <input
                      type="number"
                      value={localSettings.system.localLibraryHeight || 500}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, localLibraryHeight: Number(e.target.value) } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800">引导语与提示</h4>
                <p className="text-xs text-gray-500 mb-2">您可以集中管理和修改所有引导词及帮助提示。</p>
                <button
                  onClick={() => alert('引导词全量配置面板即将开放，敬请期待！')}
                  className="px-4 py-1.5 text-sm bg-blue-50 text-blue-600 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                >
                  打开所有引导词配置面板
                </button>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h4 className="text-sm font-semibold text-gray-800">全局快捷键配置</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">保存项目</label>
                    <input
                      type="text"
                      value={localSettings.system.shortcuts?.saveProject || 'Ctrl+S'}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, shortcuts: { ...prev.system.shortcuts, saveProject: e.target.value } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">打开本地库</label>
                    <input
                      type="text"
                      value={localSettings.system.shortcuts?.openLibrary || 'Ctrl+O'}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, shortcuts: { ...prev.system.shortcuts, openLibrary: e.target.value } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">导入数据</label>
                    <input
                      type="text"
                      value={localSettings.system.shortcuts?.importData || 'Ctrl+I'}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, shortcuts: { ...prev.system.shortcuts, importData: e.target.value } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">自动标定</label>
                    <input
                      type="text"
                      value={localSettings.system.shortcuts?.calibrate || 'Ctrl+B'}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, shortcuts: { ...prev.system.shortcuts, calibrate: e.target.value } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-gray-700">导出数据</label>
                    <input
                      type="text"
                      value={localSettings.system.shortcuts?.export || 'Ctrl+E'}
                      onChange={(e) => setLocalSettings(prev => ({ ...prev, system: { ...prev.system, shortcuts: { ...prev.system.shortcuts, export: e.target.value } } }))}
                      className="w-full h-8 px-2.5 text-sm border border-gray-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    />
                  </div>
                </div>
              </div>

            </div>
          </div>
        );`;

// Regex matching the case 'system': ... up to case 'guidance':
content = content.replace(/case 'system':[\s\S]*?(?=case 'guidance':)/, systemReplacement);

// Just in case we also want to remove the fourth 'guidance' sidebar tab, the user said "设置中第四大模块是“系统”"
// which means we should hide guidance as a separate tab or maybe just leave it (doesn't hurt). But user asked:
// "设置中第四大模块是“系统”，其中包含引导词区域的设置..." 
// I'll keep the sidebar as is but it has system now containing all that was asked.

fs.writeFileSync('src/components/SettingsModal.tsx', content);
