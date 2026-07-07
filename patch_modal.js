const fs = require('fs');
let content = fs.readFileSync('src/components/LocalLibraryModal.tsx', 'utf8');

// Add import
content = content.replace("import { Button } from '../../components/ui/button';", "import { Button } from '../../components/ui/button';\nimport { useSettings } from '../contexts/SettingsContext';");

// Add settings to component
content = content.replace("export function LocalLibraryModal({ isOpen, onClose, onLoadProject, currentProjectId }: LocalLibraryModalProps) {", "export function LocalLibraryModal({ isOpen, onClose, onLoadProject, currentProjectId }: LocalLibraryModalProps) {\n  const { settings } = useSettings();\n  const [modalPos, setModalPos] = useState({ x: 0, y: 0 });\n  const [dragState, setDragState] = useState<{startX: number, startY: number, startPosX: number, startPosY: number} | null>(null);\n\n  useEffect(() => {\n    const handleMouseMove = (e: MouseEvent) => {\n      if (!dragState) return;\n      const dx = e.clientX - dragState.startX;\n      const dy = e.clientY - dragState.startY;\n      let newX = dragState.startPosX + dx;\n      let newY = dragState.startPosY + dy;\n      const w = settings.system.localLibraryWidth;\n      const h = settings.system.localLibraryHeight;\n      const maxX = Math.max(0, (window.innerWidth - w) / 2);\n      const minX = -maxX;\n      const maxY = Math.max(0, (window.innerHeight - h) / 2);\n      const minY = -maxY;\n      newX = Math.max(minX, Math.min(newX, maxX));\n      newY = Math.max(minY, Math.min(newY, maxY));\n      setModalPos({ x: newX, y: newY });\n    };\n    const handleMouseUp = () => setDragState(null);\n    if (dragState) {\n      document.addEventListener('mousemove', handleMouseMove);\n      document.addEventListener('mouseup', handleMouseUp);\n      return () => {\n        document.removeEventListener('mousemove', handleMouseMove);\n        document.removeEventListener('mouseup', handleMouseUp);\n      };\n    }\n  }, [dragState, settings.system.localLibraryWidth, settings.system.localLibraryHeight]);\n\n  useEffect(() => {\n    if (isOpen) { setModalPos({x:0, y:0}); }\n  }, [isOpen]);");

// Add drag handlers and styling
content = content.replace(
  '<div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-gray-200 relative">',
  `<div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 relative transition-none" style={{ width: settings.system.localLibraryWidth, height: settings.system.localLibraryHeight, transform: \`translate(\${modalPos.x}px, \${modalPos.y}px)\` }}>`
);

content = content.replace(
  '<div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white">',
  `<div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-white cursor-move select-none" onMouseDown={(e) => { setDragState({ startX: e.clientX, startY: e.clientY, startPosX: modalPos.x, startPosY: modalPos.y }); }}>`
);

fs.writeFileSync('src/components/LocalLibraryModal.tsx', content);
