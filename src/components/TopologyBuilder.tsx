import React, {
  useState,
  useRef,
  useEffect,
  MouseEvent as ReactMouseEvent,
  WheelEvent as ReactWheelEvent,
  ChangeEvent,
} from "react";
import {
  Upload,
  Download,
  Trash2,
  Plus,
  Move,
  MousePointer2,
  Settings,
  Save,
  Check,
  MousePointerClick,
  Network,
  Info,
  Calculator,
  Hand,
} from "lucide-react";
import { read as readMat } from "mat-for-js";
import { useSettings, matchShortcut } from "../contexts/SettingsContext";

interface NodeData {
  id: number;
  x: number;
  y: number;
}

export function TopologyBuilder({ onPointsCountChange, onMachineListChange }: { onPointsCountChange?: (count: number) => void, onMachineListChange?: (list: number[]) => void }) {
  const { settings } = useSettings();
  
  const [isGuidanceError, setIsGuidanceError] = useState(false);
  const [guidanceMsg, setGuidanceMsg] = useState("提示: 可通过拖动分割线调整工作区布局。支持导入包含 link, long, machine, x1, y1 等变量的 .mat 工作区数据文件。配置测量点时点击画布上的节点即可快速设定。");

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

  const [nodeCount, setNodeCount] = useState<string>(settings.topology.defaultNodeCount.toString());
  const [measurementCount, setMeasurementCount] = useState<string>(settings.topology.defaultMeasuringPointCount.toString());

  useEffect(() => {
    if (onPointsCountChange) {
      const parsed = parseInt(measurementCount);
      if (!isNaN(parsed) && parsed > 0) {
        onPointsCountChange(parsed);
      }
    }
  }, [measurementCount, onPointsCountChange]);

  const [isCreated, setIsCreated] = useState(false);

  const [activeMatrix, setActiveMatrix] = useState<"link" | "long">("link");
  const [linkMatrix, setLinkMatrix] = useState<number[][]>([]);
  const [longMatrix, setLongMatrix] = useState<number[][]>([]);
  const [machineList, setMachineList] = useState<number[]>([]);
  const [nodes, setNodes] = useState<NodeData[]>([]);

  useEffect(() => {
    if (onMachineListChange) {
      onMachineListChange(machineList);
    }
  }, [machineList, onMachineListChange]);

  // Resizing state
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(settings.topology.panelWidths.leftSidebar);
  const [middleSidebarWidth, setMiddleSidebarWidth] = useState(settings.topology.panelWidths.rightSidebar);

  useEffect(() => {
    setLeftSidebarWidth(settings.topology.panelWidths.leftSidebar);
    setMiddleSidebarWidth(settings.topology.panelWidths.rightSidebar);
  }, [settings.topology.panelWidths]);

  // Canvas pan & zoom
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const initialViewState = useRef<{ scale: number; pan: { x: number; y: number } } | null>(null);

  // Edit Topology Mode
  const [isEditingTopology, setIsEditingTopology] = useState(false);
  const [selectedNodes, setSelectedNodes] = useState<number[]>([]);
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);

  // Backup state for canceling edit
  const backupTopologyRef = useRef<{
    nodes: NodeData[];
    linkMatrix: number[][];
    longMatrix: number[][];
  }>({ nodes: [], linkMatrix: [], longMatrix: [] });

  const [addNodeModalOpen, setAddNodeModalOpen] = useState(false);
  const [newNodeIdInput, setNewNodeIdInput] = useState("");

  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const dragStartNodes = useRef<NodeData[]>([]);
  const dragStartSelectedNodes = useRef<number[]>([]);

  const [hGuides, setHGuides] = useState<{ id: string; val: number }[]>([]);
  const [vGuides, setVGuides] = useState<{ id: string; val: number }[]>([]);
  const [draggedGuide, setDraggedGuide] = useState<{
    type: "v" | "h";
    id: string;
  } | null>(null);
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);
  const [snapLines, setSnapLines] = useState<
    { type: "v" | "h"; pos: number }[]
  >([]);

  const [draggedNode, setDraggedNode] = useState<number | null>(null);

  const isDraggingNodeRef = useRef(false);
  const dragCopyTriggeredRef = useRef(false);
  const mouseDownModifiers = useRef<{ ctrl: boolean; shift: boolean }>({ ctrl: false, shift: false });

  // History & Shortcuts
  const historyRef = useRef<any[]>([]);
  const futureRef = useRef<any[]>([]);
  const clipboardRef = useRef<{
    nodes: NodeData[];
    isMeasurement: boolean[];
    links?: number[][];
    longs?: number[][];
  } | null>(null);
  
  const currentStateRef = useRef({ nodes, linkMatrix, longMatrix, machineList, nodeCount, measurementCount });
  useEffect(() => {
    currentStateRef.current = { nodes, linkMatrix, longMatrix, machineList, nodeCount, measurementCount };
  }, [nodes, linkMatrix, longMatrix, machineList, nodeCount, measurementCount]);

  const handleFitToView = React.useCallback(() => {
    if (!isCreated || nodes.length === 0 || !svgContainerRef.current) return;
    
    const rect = svgContainerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    
    if (width === 0 || height === 0) return;
    
    const minX = Math.min(...nodes.map(n => n.x));
    const maxX = Math.max(...nodes.map(n => n.x));
    const minY = Math.min(...nodes.map(n => n.y));
    const maxY = Math.max(...nodes.map(n => n.y));
    
    let contentWidth = maxX - minX;
    let contentHeight = maxY - minY;
    let centerX = (minX + maxX) / 2;
    let centerY = (minY + maxY) / 2;

    if (contentWidth === 0 && contentHeight === 0) {
      contentWidth = 300;
      contentHeight = 300;
      centerX = 150;
      centerY = -150;
    } else {
      contentWidth = contentWidth || 1;
      contentHeight = contentHeight || 1;
    }
    
    const padding = settings.topology.canvasResetMargin;
    const availableWidth = Math.max(width - padding * 2, 20);
    const availableHeight = Math.max(height - padding * 2, 20);
    
    const scaleX = availableWidth / contentWidth;
    const scaleY = availableHeight / contentHeight;
    // Use the smaller scale to fit everything, and allow it to go up to 10 for small networks
    const finalScale = Math.min(scaleX, scaleY, 10.0);
    
    // Calculate pan to center the content in the visible area
    const finalPan = {
      x: width / 2 - centerX * finalScale,
      y: height / 2 - centerY * finalScale
    };
    
    setPan(finalPan);
    setScale(finalScale);
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: '【拓扑操作】视图重置已完成！已自动将电网拓扑恢复至可视区域中心。' } 
    }));

    // If it wasn't set, set it now so next double click is consistent
    if (!initialViewState.current) {
      initialViewState.current = { scale: finalScale, pan: finalPan };
    }
  }, [isCreated, nodes, settings.topology.canvasResetMargin]);

  useEffect(() => {
    if (isCreated && nodes.length > 0 && !initialViewState.current) {
      handleFitToView();
    }
  }, [isCreated, nodes, handleFitToView]);

  useEffect(() => {
    const handleRequest = () => {
      window.dispatchEvent(new CustomEvent('COMPONENT_PROVIDE_DATA', {
        detail: {
          type: 'topology',
          data: {
            nodes,
            linkMatrix,
            longMatrix,
            machineList,
            nodeCount,
            measurementCount,
            isCreated
          }
        }
      }));
    };
    
    const handleLoad = (e: any) => {
      const project = e.detail;
      if (project.topology) {
        setNodes(project.topology.nodes);
        setLinkMatrix(project.topology.linkMatrix);
        setLongMatrix(project.topology.longMatrix);
        setMachineList(project.topology.machineList);
        setNodeCount(project.topology.nodeCount);
        setMeasurementCount(project.topology.measurementCount);
        setIsCreated(true);
      }
    };

    window.addEventListener('APP_REQUEST_DATA', handleRequest);
    window.addEventListener('APP_LOAD_DATA', handleLoad);

    return () => {
      window.removeEventListener('APP_REQUEST_DATA', handleRequest);
      window.removeEventListener('APP_LOAD_DATA', handleLoad);
    };
  }, [nodes, linkMatrix, longMatrix, machineList, nodeCount, measurementCount, isCreated]);

  const saveState = () => {
    const current = currentStateRef.current;
    
    // Save initial view if not set
    if (!initialViewState.current) {
      initialViewState.current = { scale, pan };
    }

    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(current.nodes)),
      linkMatrix: JSON.parse(JSON.stringify(current.linkMatrix)),
      longMatrix: JSON.parse(JSON.stringify(current.longMatrix)),
      machineList: [...current.machineList],
      nodeCount: current.nodeCount,
      measurementCount: current.measurementCount
    });
    futureRef.current = [];
  };

  const undo = () => {
    if (historyRef.current.length > 0) {
      const current = currentStateRef.current;
      futureRef.current.push({
        nodes: JSON.parse(JSON.stringify(current.nodes)),
        linkMatrix: JSON.parse(JSON.stringify(current.linkMatrix)),
        longMatrix: JSON.parse(JSON.stringify(current.longMatrix)),
        machineList: [...current.machineList],
        nodeCount: current.nodeCount,
        measurementCount: current.measurementCount
      });
      const prev = historyRef.current.pop();
      if (prev) {
        setNodes(prev.nodes);
        setLinkMatrix(prev.linkMatrix);
        setLongMatrix(prev.longMatrix);
        setMachineList(prev.machineList);
        setNodeCount(prev.nodeCount);
        setMeasurementCount(prev.measurementCount);
        setSelectedNodes([]);
      }
    }
  };

  const redo = () => {
    if (futureRef.current.length > 0) {
      const current = currentStateRef.current;
      historyRef.current.push({
        nodes: JSON.parse(JSON.stringify(current.nodes)),
        linkMatrix: JSON.parse(JSON.stringify(current.linkMatrix)),
        longMatrix: JSON.parse(JSON.stringify(current.longMatrix)),
        machineList: [...current.machineList],
        nodeCount: current.nodeCount,
        measurementCount: current.measurementCount
      });
      const next = futureRef.current.pop();
      if (next) {
        setNodes(next.nodes);
        setLinkMatrix(next.linkMatrix);
        setLongMatrix(next.longMatrix);
        setMachineList(next.machineList);
        setNodeCount(next.nodeCount);
        setMeasurementCount(next.measurementCount);
        setSelectedNodes([]);
      }
    }
  };

  const copySelected = (withLinks: boolean, nodeIds?: number[]) => {
    const targetIds = nodeIds || selectedNodes;
    if (targetIds.length > 0) {
      const selNodes = nodes.filter(n => targetIds.includes(n.id));
      const isMeasurement = selNodes.map(n => machineList.includes(n.id));
      
      let links: number[][] | undefined;
      let longs: number[][] | undefined;

      if (withLinks) {
        links = Array(selNodes.length).fill(0).map(() => Array(selNodes.length).fill(0));
        longs = Array(selNodes.length).fill(0).map(() => Array(selNodes.length).fill(Infinity));
        
        selNodes.forEach((n1, i) => {
          selNodes.forEach((n2, j) => {
            if (i === j) {
              longs![i][j] = 0;
              return;
            }
            const idx1 = n1.id - 1;
            const idx2 = n2.id - 1;
            links![i][j] = linkMatrix[idx1][idx2];
            longs![i][j] = longMatrix[idx1][idx2];
          });
        });
      }

      clipboardRef.current = {
        nodes: JSON.parse(JSON.stringify(selNodes)),
        isMeasurement,
        links,
        longs
      };
    }
  };

  const performPaste = (withLinks: boolean, offset: { x: number; y: number } = { x: 20, y: 20 }) => {
    if (!clipboardRef.current || clipboardRef.current.nodes.length === 0) return null;
    
    const current = currentStateRef.current;
    let nextNodes = [...current.nodes];
    let nextLink = current.linkMatrix.length > 0 ? current.linkMatrix.map((row) => [...row]) : [];
    let nextLong = current.longMatrix.map((row) => [...row]);
    let nextMachine = [...current.machineList];
    
    const newSelected: number[] = [];
    const oldIdToNewId = new Map<number, number>();

    clipboardRef.current.nodes.forEach((node, i) => {
      const maxId = nextNodes.length > 0 ? Math.max(...nextNodes.map(n => n.id)) : 0;
      const newId = maxId + 1;
      oldIdToNewId.set(node.id, newId);
      
      nextNodes.push({
         ...node,
         id: newId,
         x: node.x + offset.x,
         y: node.y + offset.y
      });
      
      // Expand matrices
      nextLink.forEach(row => row.push(0));
      nextLink.push(new Array(nextLink.length + 1).fill(0));
      
      nextLong.forEach(row => row.push(Infinity));
      const newRow = new Array(nextLong.length + 1).fill(Infinity);
      newRow[newRow.length - 1] = 0;
      nextLong.push(newRow);
      
      if (clipboardRef.current?.isMeasurement[i]) {
        nextMachine.push(newId);
      }
      
      newSelected.push(newId);
    });

    // Apply links if requested and available
    if (withLinks && clipboardRef.current.links && clipboardRef.current.longs) {
      clipboardRef.current.nodes.forEach((n1, i) => {
        clipboardRef.current!.nodes.forEach((n2, j) => {
          const linkVal = clipboardRef.current!.links![i][j];
          const longVal = clipboardRef.current!.longs![i][j];
          if (linkVal === 1) {
            const newId1 = oldIdToNewId.get(n1.id)!;
            const newId2 = oldIdToNewId.get(n2.id)!;
            nextLink[newId1 - 1][newId2 - 1] = 1;
            nextLink[newId2 - 1][newId1 - 1] = 1;
            nextLong[newId1 - 1][newId2 - 1] = longVal;
            nextLong[newId2 - 1][newId1 - 1] = longVal;
          }
        });
      });
    }

    return { nextNodes, nextLink, nextLong, nextMachine, newSelected };
  };

  const pasteClipboard = (withLinks: boolean) => {
    const result = performPaste(withLinks);
    if (result) {
      saveState();
      setNodes(result.nextNodes);
      setLinkMatrix(result.nextLink);
      setLongMatrix(result.nextLong);
      setMachineList(result.nextMachine);
      setNodeCount(String(result.nextNodes.length));
      setMeasurementCount(String(result.nextMachine.length));
      setSelectedNodes(result.newSelected);
    }
  };

  const mirrorSelected = () => {
    if (selectedNodes.length > 0) {
      saveState();
      const current = currentStateRef.current;
      const selNodes = current.nodes.filter(n => selectedNodes.includes(n.id));
      const minX = Math.min(...selNodes.map(n => n.x));
      const maxX = Math.max(...selNodes.map(n => n.x));
      const centerX = (minX + maxX) / 2;
      
      setNodes(current.nodes.map(n => {
         if (selectedNodes.includes(n.id)) {
           return { ...n, x: centerX - (n.x - centerX) };
         }
         return n;
      }));
    }
  };

  const rotateSelected = () => {
    if (selectedNodes.length > 0) {
      saveState();
      const current = currentStateRef.current;
      const selNodes = current.nodes.filter(n => selectedNodes.includes(n.id));
      const minX = Math.min(...selNodes.map(n => n.x));
      const maxX = Math.max(...selNodes.map(n => n.x));
      const minY = Math.min(...selNodes.map(n => n.y));
      const maxY = Math.max(...selNodes.map(n => n.y));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      
      setNodes(current.nodes.map(n => {
         if (selectedNodes.includes(n.id)) {
           const dx = n.x - centerX;
           const dy = n.y - centerY;
           return { ...n, x: centerX - dy, y: centerY + dx };
         }
         return n;
      }));
    }
  };

  const handleAlignX = () => {
    if (selectedNodes.length < 2) return;
    saveState();
    setNodes(prev => {
      const selected = prev.filter(n => selectedNodes.includes(n.id));
      const avgX = selected.reduce((sum, n) => sum + n.x, 0) / selected.length;
      return prev.map(n => selectedNodes.includes(n.id) ? { ...n, x: avgX } : n);
    });
  };

  const handleAlignY = () => {
    if (selectedNodes.length < 2) return;
    saveState();
    setNodes(prev => {
      const selected = prev.filter(n => selectedNodes.includes(n.id));
      const avgY = selected.reduce((sum, n) => sum + n.y, 0) / selected.length;
      return prev.map(n => selectedNodes.includes(n.id) ? { ...n, y: avgY } : n);
    });
  };

  const handleDistribute = (axis: "x" | "y") => {
    if (selectedNodes.length < 3) return;
    saveState();
    setNodes((prev) => {
      const selected = prev
        .filter((n) => selectedNodes.includes(n.id))
        .sort((a, b) => a[axis] - b[axis]);
      const first = selected[0];
      const last = selected[selected.length - 1];
      const span = last[axis] - first[axis];
      const step = span / (selected.length - 1);

      const next = prev.map((n) => ({ ...n }));
      selected.forEach((node, i) => {
        if (i === 0 || i === selected.length - 1) return;
        const target = next.find((n) => n.id === node.id);
        if (target) {
          target[axis] = first[axis] + step * i;
        }
      });
      return next;
    });
  };

  const handleAddNode = () => {
    setNewNodeIdInput(String(nodes.length + 1));
    setAddNodeModalOpen(true);
  };

  const confirmAddNode = () => {
    const newId = parseInt(newNodeIdInput);
    if (isNaN(newId) || newId < 1 || newId > nodes.length + 1) {
      alert(`无效的编号，请输入 1 到 ${nodes.length + 1} 之间的数字`);
      return;
    }
    
    saveState();

    const rect = svgContainerRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 400;
    const cy = rect ? rect.height / 2 : 300;
    const svgX = (cx - pan.x) / scale;
    const svgY = (cy - pan.y) / scale;

    setNodes((prev) => {
      let next = [...prev];
      if (next.some((n) => n.id === newId) || newId <= next.length) {
        next = next.map((n) => (n.id >= newId ? { ...n, id: n.id + 1 } : n));
      }
      next.push({ id: newId, x: svgX, y: svgY });
      next.sort((a, b) => a.id - b.id);
      return next;
    });

    setNodeCount((prev) => String(parseInt(prev) + 1));

    setLinkMatrix((prev) => {
      const targetIdx = newId - 1;
      const n = prev.length;
      let next = prev.map((row) => {
        const newRow = [...row];
        newRow.splice(targetIdx, 0, 0);
        return newRow;
      });
      const newRow = Array(n + 1).fill(0);
      next.splice(targetIdx, 0, newRow);
      return next;
    });

    setLongMatrix((prev) => {
      const targetIdx = newId - 1;
      const n = prev.length;
      let next = prev.map((row) => {
        const newRow = [...row];
        newRow.splice(targetIdx, 0, Infinity);
        return newRow;
      });
      const newRow = Array(n + 1).fill(Infinity);
      newRow[targetIdx] = 0;
      next.splice(targetIdx, 0, newRow);
      return next;
    });

    setMachineList((prev) =>
      prev.map((m) => (m >= newId && m !== 0 ? m + 1 : m)),
    );

    setAddNodeModalOpen(false);
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!settings.topology.shortcutsEnabled || !isEditingTopology) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const scs = settings.system?.shortcuts;
      if (!scs) return;

      if (matchShortcut(e, scs.topoDelete)) {
        if (selectedNodes.length > 0) {
          e.preventDefault();
          handleDeleteSelectedNodes();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.topology.shortcutsEnabled, isEditingTopology, selectedNodes, settings.system?.shortcuts]);

  const handleDeleteSelectedNodes = () => {
    if (selectedNodes.length === 0) return;
    
    saveState();

    const sortedDeletions = [...selectedNodes].sort((a, b) => b - a);

    let nextNodes = [...nodes];
    let nextLink = linkMatrix.map((row) => [...row]);
    let nextLong = longMatrix.map((row) => [...row]);
    let nextMachine = [...machineList];

    for (const delId of sortedDeletions) {
      const delIdx = delId - 1;

      nextNodes = nextNodes.filter((n) => n.id !== delId);
      nextNodes = nextNodes.map((n) =>
        n.id > delId ? { ...n, id: n.id - 1 } : n,
      );

      nextLink.splice(delIdx, 1);
      nextLink = nextLink.map((row) => {
        row.splice(delIdx, 1);
        return row;
      });

      nextLong.splice(delIdx, 1);
      nextLong = nextLong.map((row) => {
        row.splice(delIdx, 1);
        return row;
      });

      nextMachine = nextMachine.filter((m) => m !== delId);
      nextMachine = nextMachine.map((m) => (m > delId ? m - 1 : m));
    }

    setNodes(nextNodes);
    setLinkMatrix(nextLink);
    setLongMatrix(nextLong);
    setMachineList(nextMachine);
    setMeasurementCount(String(nextMachine.length));
    setNodeCount(String(nextNodes.length));
    setSelectedNodes([]);
  };

  // Measurement configuration mode
  const [isConfiguringMeasurement, setIsConfiguringMeasurement] =
    useState(false);
  const [originalMachineList, setOriginalMachineList] = useState<number[]>([]);
  const [draggedMachineIdx, setDraggedMachineIdx] = useState<number | null>(
    null,
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Resizing logic ---
  const handleLeftSidebarResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftSidebarWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPercent = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
      setLeftSidebarWidth(
        Math.max(15, Math.min(45, startWidth + deltaPercent))
      );
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleMiddleSidebarResize = (e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = middleSidebarWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPercent = ((moveEvent.clientX - startX) / window.innerWidth) * 100;
      setMiddleSidebarWidth(
        Math.max(15, Math.min(40, startWidth + deltaPercent))
      );
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  // --- Network Creation ---
  const handleCreateNetwork = () => {
    const n = parseInt(nodeCount);
    const m = parseInt(measurementCount);
    if (isNaN(n) || isNaN(m) || n < 2 || m < 1 || m > n) {
      alert("请输入有效的节点数量和测量点数量！");
      return;
    }

    const newLink = Array(n)
      .fill(0)
      .map(() => Array(n).fill(0));
    const newLong = Array(n)
      .fill(0)
      .map((_, i) => {
        const row = Array(n).fill(Infinity);
        row[i] = 0;
        return row;
      });

    setLinkMatrix(newLink);
    setLongMatrix(newLong);
    setMachineList(Array(m).fill(0));

    // Auto-generate all nodes centered at (150, -150) within the xy:0-300 region
    const initialNodes: NodeData[] = [];
    for (let i = 0; i < n; i++) {
      initialNodes.push({
        id: i + 1,
        x: 150,
        y: -150,
      });
    }
    setNodes(initialNodes);

    // Position the camera so that the [0, 300] region is beautifully fitted and centered
    let finalScale = 1;
    let finalPan = { x: 0, y: 0 };
    if (svgContainerRef.current) {
      const rect = svgContainerRef.current.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      if (width > 0 && height > 0) {
        const padding = settings.topology.canvasResetMargin;
        const availableWidth = Math.max(width - padding * 2, 20);
        const availableHeight = Math.max(height - padding * 2, 20);
        
        const scaleX = availableWidth / 300;
        const scaleY = availableHeight / 300;
        finalScale = Math.min(scaleX, scaleY, 10.0);
        
        finalPan = {
          x: width / 2 - 150 * finalScale,
          y: height / 2 - (-150) * finalScale
        };
      }
    }

    setScale(finalScale);
    setPan(finalPan);
    initialViewState.current = { scale: finalScale, pan: finalPan };
    
    backupTopologyRef.current = {
      nodes: initialNodes,
      linkMatrix: newLink.map((r) => [...r]),
      longMatrix: newLong.map((r) => [...r]),
    };
    setIsEditingTopology(true);
    setSelectedNodes([]);
    setIsCreated(true);
  };

  const handleDeleteNetwork = () => {
    setIsCreated(false);
    setLinkMatrix([]);
    setLongMatrix([]);
    setMachineList([]);
    setNodes([]);
    setIsConfiguringMeasurement(false);
    setIsEditingTopology(false);
    initialViewState.current = null;
  };

  const handleCalculateDistances = () => {
    if (!isCreated) return;
    const newLong = [...longMatrix];
    for (let i = 0; i < nodes.length; i++) {
      newLong[i] = [...newLong[i]];
      for (let j = 0; j < nodes.length; j++) {
        if (i === j) {
          newLong[i][j] = 0;
        } else if (linkMatrix[i][j] === 1) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          // Calculate Euclidean distance and round to 2 decimal places
          const dist = Math.round(Math.sqrt(dx * dx + dy * dy) * 100) / 100;
          newLong[i][j] = dist;
        } else {
          newLong[i][j] = Infinity;
        }
      }
    }
    setLongMatrix(newLong);
  };

  // --- Import / Export ---
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".mat")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const buffer = event.target?.result as ArrayBuffer;
          const matData = readMat(buffer);
          const data = matData.data;

          // Check if data is array-like
          const isArrayLike = (val: any) =>
            val && typeof val === "object" && "length" in val;

          if (
            !data.link ||
            !data.long ||
            !data.machine ||
            !data.x1 ||
            !data.y1
          ) {
            alert("MAT文件中缺少必要的变量 (link, long, machine, x1, y1)");
            return;
          }

          let link = isArrayLike(data.link[0])
            ? Array.from(data.link).map((row) => Array.from(row as any))
            : [];
          let long = isArrayLike(data.long[0])
            ? Array.from(data.long).map((row) => Array.from(row as any))
            : [];

          if (
            link.length === 0 &&
            (Array.isArray(data.link) || isArrayLike(data.link))
          ) {
            // It's flat
            const flatLink = Array.from(data.link) as number[];
            const size = Math.sqrt(flatLink.length);
            if (Number.isInteger(size)) {
              // MATLAB is column-major
              for (let i = 0; i < size; i++) {
                const row = [];
                for (let j = 0; j < size; j++) {
                  row.push(flatLink[j * size + i]);
                }
                link.push(row);
              }
            } else {
              link = [flatLink];
            }
          }

          if (
            long.length === 0 &&
            (Array.isArray(data.long) || isArrayLike(data.long))
          ) {
            const flatLong = Array.from(data.long) as number[];
            const size = Math.sqrt(flatLong.length);
            if (Number.isInteger(size)) {
              for (let i = 0; i < size; i++) {
                const row = [];
                for (let j = 0; j < size; j++) {
                  row.push(flatLong[j * size + i]);
                }
                long.push(row);
              }
            } else {
              long = [flatLong];
            }
          }

          const machine = Array.from(data.machine) as number[];
          const x1 = Array.from(data.x1) as number[];
          const y1 = Array.from(data.y1) as number[];

          const n = link.length;
          const m = machine.length;

          setNodeCount(String(n));
          setMeasurementCount(String(m));
          setLinkMatrix(link);
          setLongMatrix(long);
          setMachineList(machine);

          const newNodes: NodeData[] = [];
          for (let i = 0; i < n; i++) {
            newNodes.push({
              id: i + 1,
              x: x1[i],
              y: -y1[i], 
            });
          }

          setNodes(newNodes);
          setIsCreated(true);
          initialViewState.current = null; // Trigger handleFitToView via useEffect
        } catch (err: any) {
          console.error(err);
          const errorMsg = err?.message || err || "";
          if (typeof errorMsg === 'string' && errorMsg.includes("Version identifier 1 unknown")) {
            alert("无法解析较新格式的 .mat 文件 (v7.3)。\n请在 MATLAB 中使用 '-v7' 选项重新保存：\nsave('filename.mat', '-v7')");
          } else {
            alert(`解析MAT文件失败，请确保格式正确且包含必要的变量。\n如果使用的是较新格式(v7.3)，请尝试使用 MATLAB 的 '-v7' 选项重新保存。\n错误信息: ${errorMsg}`);
          }
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const data = JSON.parse(content);

          if (data.nodeCount && data.linkMatrix) {
            setNodeCount(String(data.nodeCount));
            setMeasurementCount(String(data.machineList?.length || 0));
            setLinkMatrix(data.linkMatrix);
            setLongMatrix(data.longMatrix || []);
            setMachineList(data.machineList || []);
            if (data.nodes) setNodes(data.nodes);
            initialViewState.current = null;
            setIsCreated(true);
          } else {
            alert("文件格式不正确！");
          }
        } catch (err) {
          alert("解析文件失败，请确保是合法的JSON或.mat文件。");
        }
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleExport = (format: 'json' | 'mat') => {
    if (!isCreated) return;
    const data = {
      nodeCount: parseInt(nodeCount),
      measurementCount: parseInt(measurementCount),
      linkMatrix,
      longMatrix,
      machineList,
      nodes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: format === 'json' ? "application/json" : "application/octet-stream",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `topology_config.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // --- Matrix & List edits ---
  const handleLinkMatrixChange = (row: number, col: number, value: string) => {
    const val = parseInt(value);
    if (val !== 0 && val !== 1) return;
    if (row === col && val !== 0) return;

    setLinkMatrix((prev) => {
      const next = [...prev];
      next[row] = [...next[row]];
      next[col] = [...next[col]];
      next[row][col] = val;
      next[col][row] = val;
      return next;
    });
  };

  const handleMachineChange = (index: number, value: string) => {
    const val = parseInt(value);
    setMachineList((prev) => {
      const next = [...prev];
      next[index] = isNaN(val) ? 0 : val;
      return next;
    });
  };

  // --- Canvas Interactions ---
  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    if (!isCreated) return;
    e.preventDefault();

    const zoomSensitivity = 0.002;
    const delta = -e.deltaY * zoomSensitivity;
    const newScale = Math.max(0.1, Math.min(10, scale * (1 + delta)));

    if (!svgContainerRef.current) return;
    const rect = svgContainerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const svgX = (mouseX - pan.x) / scale;
    const svgY = (mouseY - pan.y) / scale;

    const newPanX = mouseX - svgX * newScale;
    const newPanY = mouseY - svgY * newScale;

    setScale(newScale);
    setPan({ x: newPanX, y: newPanY });
    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
      detail: { message: `【拓扑操作】画布缩放中 (比率: ${(newScale * 100).toFixed(0)}%)。提示：双击画布任意空白处可恢复居中自适应视图。` } 
    }));
  };

  const handleMouseDownCanvas = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || e.button === 2) {
      // Middle click or Right click
      e.preventDefault();
      setIsDraggingCanvas(true);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (e.button === 0) {
      // Left click
      setSelectedGuide(null);
      if (isEditingTopology) {
        // Start selection box
        const rect = svgContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const svgX = (mouseX - pan.x) / scale;
        const svgY = (mouseY - pan.y) / scale;

        setSelectionBox({
          startX: svgX,
          startY: svgY,
          currentX: svgX,
          currentY: svgY,
        });
        setSelectedNodes([]); // Clear previous selection
      } else {
        // If not editing, maybe they want to pan with left click too, but user said middle pan.
        // Let's enforce middle pan only, or allow left pan if not editing. Let's allow left pan if not editing.
        setIsDraggingCanvas(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    }
  };

  const handleMouseDownNode = (
    e: ReactMouseEvent<SVGCircleElement | SVGTextElement>,
    id: number,
  ) => {
    e.stopPropagation();
    setSelectedGuide(null);
    if (isConfiguringMeasurement) {
      setMachineList((prev) => {
        const next = [...prev];
        const index = next.indexOf(id);
        if (index !== -1) {
          next[index] = 0;
        } else {
          const firstEmptyIdx = next.indexOf(0);
          if (firstEmptyIdx !== -1) {
            next[firstEmptyIdx] = id;
          }
        }
        return next;
      });
    } else if (isEditingTopology) {
      if (e.button === 0) {
        mouseDownModifiers.current = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
        
        if (e.ctrlKey || e.metaKey) {
          // Toggle selection
          setSelectedNodes(prev => 
            prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]
          );
        } else {
          // Single select or keep current if id in selection (for dragging)
          if (!selectedNodes.includes(id)) {
            setSelectedNodes([id]);
          }
        }
        
        setDraggedNode(id);
        isDraggingNodeRef.current = false;
        dragCopyTriggeredRef.current = false;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        dragStartNodes.current = nodes;
      }
    }
  };

  const handleMouseMove = (e: ReactMouseEvent<SVGSVGElement> | MouseEvent) => {
    if (isDraggingCanvas) {
      const dx = e.clientX - (lastMousePos.current?.x || e.clientX);
      const dy = e.clientY - (lastMousePos.current?.y || e.clientY);
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    } else if (selectionBox && isEditingTopology) {
      const rect = svgContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const svgX = (mouseX - pan.x) / scale;
      const svgY = (mouseY - pan.y) / scale;
      setSelectionBox((prev) =>
        prev ? { ...prev, currentX: svgX, currentY: svgY } : null,
      );
    } else if (draggedGuide) {
      const rect = svgContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const svgX = (mouseX - pan.x) / scale;
      const svgY = (mouseY - pan.y) / scale;

      if (draggedGuide.type === "v") {
        if (mouseX < 20) {
          setVGuides((prev) => prev.filter((g) => g.id !== draggedGuide.id));
          setDraggedGuide(null);
        } else {
          setVGuides((prev) =>
            prev.map((g) =>
              g.id === draggedGuide.id ? { ...g, val: svgX } : g,
            ),
          );
        }
      } else {
        if (mouseY < 20) {
          setHGuides((prev) => prev.filter((g) => g.id !== draggedGuide.id));
          setDraggedGuide(null);
        } else {
          setHGuides((prev) =>
            prev.map((g) =>
              g.id === draggedGuide.id ? { ...g, val: svgY } : g,
            ),
          );
        }
      }
    } else if (draggedNode !== null) {
      const dx = (e.clientX - (dragStartPos.current?.x || e.clientX)) / scale;
      const dy = (e.clientY - (dragStartPos.current?.y || e.clientY)) / scale;

      if (!isDraggingNodeRef.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
        isDraggingNodeRef.current = true;
        
        // Handle Copy-Drag
        if (mouseDownModifiers.current.ctrl) {
          const idsToCopy = selectedNodes.includes(draggedNode) 
            ? selectedNodes 
            : [...selectedNodes, draggedNode];
            
          copySelected(mouseDownModifiers.current.shift, idsToCopy);
          const result = performPaste(mouseDownModifiers.current.shift, { x: 0, y: 0 });
          if (result) {
            dragCopyTriggeredRef.current = true;
            saveState(); // Save state with the original nodes
            
            // Apply the new nodes immediately to state and refs
            setNodes(result.nextNodes);
            setLinkMatrix(result.nextLink);
            setLongMatrix(result.nextLong);
            setMachineList(result.nextMachine);
            setNodeCount(String(result.nextNodes.length));
            setMeasurementCount(String(result.nextMachine.length));
            setSelectedNodes(result.newSelected);
            
            // Re-initialize drag start after paste with the new state
            dragStartPos.current = { x: e.clientX, y: e.clientY };
            dragStartNodes.current = result.nextNodes;
          }
          return;
        } else {
          saveState();
        }
      }

      let snapDx = 0;
      let snapDy = 0;
      const newSnapLines: { type: "v" | "h"; pos: number }[] = [];

      if (!e.ctrlKey) {
        const startDraggedNode = dragStartNodes.current.find(
          (n) => n.id === draggedNode,
        );
        if (startDraggedNode) {
          const rawNewX = startDraggedNode.x + dx;
          const rawNewY = startDraggedNode.y + dy;
          const SNAP_DIST = 10 / scale;

          let closestX = rawNewX;
          let closestY = rawNewY;
          let minDiffX = SNAP_DIST;
          let minDiffY = SNAP_DIST;

          dragStartNodes.current.forEach((n) => {
            if (
              n.id === draggedNode ||
              (isEditingTopology && selectedNodes.includes(n.id))
            )
              return;
            const diffX = Math.abs(rawNewX - n.x);
            if (diffX < minDiffX) {
              minDiffX = diffX;
              closestX = n.x;
            }
            const diffY = Math.abs(rawNewY - n.y);
            if (diffY < minDiffY) {
              minDiffY = diffY;
              closestY = n.y;
            }
          });

          vGuides.forEach((g) => {
            const diffX = Math.abs(rawNewX - g.val);
            if (diffX < minDiffX) {
              minDiffX = diffX;
              closestX = g.val;
            }
          });
          hGuides.forEach((g) => {
            const diffY = Math.abs(rawNewY - g.val);
            if (diffY < minDiffY) {
              minDiffY = diffY;
              closestY = g.val;
            }
          });

          if (minDiffX < SNAP_DIST) {
            snapDx = closestX - rawNewX;
            newSnapLines.push({ type: "v", pos: closestX });
          }
          if (minDiffY < SNAP_DIST) {
            snapDy = closestY - rawNewY;
            newSnapLines.push({ type: "h", pos: closestY });
          }
        }
      }

      setSnapLines(newSnapLines);

      const effectiveDx = dx + snapDx;
      const effectiveDy = dy + snapDy;

      setNodes((prev) =>
        dragStartNodes.current.map((n) =>
          (
            isEditingTopology
              ? selectedNodes.includes(n.id) || (n.id === draggedNode && !dragCopyTriggeredRef.current)
              : n.id === draggedNode
          )
            ? { ...n, x: n.x + effectiveDx, y: n.y + effectiveDy }
            : n,
        ),
      );

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = (e: ReactMouseEvent) => {
    if (draggedNode !== null && !isDraggingNodeRef.current && !mouseDownModifiers.current.ctrl) {
      // It was a simple click without drag and without ctrl, ensure only this node is selected
      setSelectedNodes([draggedNode]);
    }

    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.currentX);
      const maxX = Math.max(selectionBox.startX, selectionBox.currentX);
      const minY = Math.min(selectionBox.startY, selectionBox.currentY);
      const maxY = Math.max(selectionBox.startY, selectionBox.currentY);

      const newSelected = nodes
        .filter((n) => n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY)
        .map((n) => n.id);
      setSelectedNodes(newSelected);
      setSelectionBox(null);
    }
    setDraggedNode(null);
    setIsDraggingCanvas(false);
    setDraggedGuide(null);
    setSnapLines([]);
    lastMousePos.current = null;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 bg-gray-50 overflow-hidden">
        {/* Hidden File Input */}
        <input
          type="file"
          accept=".json,.mat"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
        />

        <div
          className="bg-white overflow-y-auto flex flex-col space-y-4 flex-shrink-0 relative z-10 border-r border-gray-200"
          style={{ width: `${leftSidebarWidth}%` }}
        >
          <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
            <h2 className="text-sm font-semibold text-gray-700">
              拓扑构建操作区
            </h2>
          </div>
          
          <div className="px-4 pb-4 space-y-4">
            {/* Node & Measurement Settings */}
            <div className="shrink-0">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  节点数量 (N)
                </label>
                <input
                  type="number"
                  disabled={isCreated}
                  value={nodeCount}
                  onChange={(e) => setNodeCount(e.target.value)}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  测量点数量 (M)
                </label>
                <input
                  type="number"
                  disabled={isCreated}
                  value={measurementCount}
                  onChange={(e) => {
                    setMeasurementCount(e.target.value);
                    const newCount = parseInt(e.target.value);
                    if (!isNaN(newCount) && newCount >= 0) {
                      setMachineList((prev) => {
                        const next = [...prev];
                        if (newCount > next.length) {
                          return [
                            ...next,
                            ...Array(newCount - next.length).fill(0),
                          ];
                        } else if (newCount < next.length) {
                          return next.slice(0, newCount);
                        }
                        return next;
                      });
                    }
                  }}
                  className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleCreateNetwork}
                disabled={isCreated}
                className="bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center h-9"
              >
                创建网络
              </button>
              <button
                onClick={handleImportClick}
                className="flex items-center justify-center bg-orange-500 text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-orange-600 transition-all h-9"
              >
                <Download className="w-4 h-4 mr-1" /> 导入网络
              </button>
              
              {isEditingTopology ? (
                <div className="flex space-x-1">
                  <button
                    onClick={() => {
                      if (backupTopologyRef.current) {
                        setNodes(backupTopologyRef.current.nodes);
                        setLinkMatrix(backupTopologyRef.current.linkMatrix);
                        setLongMatrix(backupTopologyRef.current.longMatrix);
                        setNodeCount(
                          String(backupTopologyRef.current.nodes.length),
                        );
                        setIsEditingTopology(false);
                        setSelectedNodes([]);
                        window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                          detail: { message: '【拓扑还原】已取消网络修改。拓扑网络已成功还原为上一次保存的初始状态。' } 
                        }));
                      }
                    }}
                    className="flex-1 px-2 py-2 bg-gray-100 text-gray-600 rounded-md text-sm hover:bg-gray-200 transition-colors border border-gray-200 h-9"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingTopology(false);
                      setSelectedNodes([]);
                      window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                        detail: { message: '【拓扑更新】网络修改已保存成功。生成的网络拓扑模型已实时同步至系统的核心分析引擎中。' } 
                      }));
                    }}
                    className="flex-1 px-2 py-2 bg-green-500 text-white rounded-md text-sm hover:bg-green-600 transition-colors h-9"
                  >
                    完成
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (!isCreated) return;
                    backupTopologyRef.current = {
                      nodes: [...nodes],
                      linkMatrix: linkMatrix.map((r) => [...r]),
                      longMatrix: longMatrix.map((r) => [...r]),
                    };
                    setIsEditingTopology(true);
                    window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                      detail: { message: '【网络修改模式】已开启！双击画布空白处可创建新节点，选中节点并拖动可任意调整物理拓扑位置。' } 
                    }));
                    setSelectedNodes([]);
                  }}
                  disabled={!isCreated}
                  className={`flex-1 px-3 py-2 rounded-md text-sm border transition-all h-9 ${isCreated ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100" : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed"}`}
                >
                  修改网络
                </button>
              )}

              <button
                onClick={handleDeleteNetwork}
                className="bg-white text-gray-600 border border-gray-200 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-all h-9"
                disabled={!isCreated}
              >
                删除网络
              </button>
            </div>
          </div>
        </div>

          {isCreated && (
            <>
              {/* Matrix Editors */}
              <div className="border border-gray-200 rounded-md p-4 flex flex-col shrink-0 bg-white relative flex-1 min-h-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="flex items-center space-x-3">
                    <h3 className="text-sm font-semibold text-gray-700">
                      拓扑矩阵设置
                    </h3>
                    <select
                      value={activeMatrix}
                      onChange={(e) =>
                        setActiveMatrix(e.target.value as "link" | "long")
                      }
                      className="text-sm border-gray-300 rounded-md p-1 border"
                    >
                      <option value="link">邻接矩阵 (Link)</option>
                      <option value="long">距离矩阵 (Distance)</option>
                    </select>
                  </div>
                  {activeMatrix === "long" && (
                    <button
                      onClick={handleCalculateDistances}
                      className="flex items-center px-2 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded text-xs hover:bg-blue-100 transition-colors"
                      title="根据节点实际坐标计算连接节点的欧式距离"
                    >
                      <Calculator className="w-3 h-3 mr-1" /> 根据坐标计算
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-auto border border-gray-200 rounded min-h-0">
                  <table className="w-full text-xs text-center border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="p-0 border-b border-r border-gray-200 w-8 h-8"></th>
                        {Array(parseInt(nodeCount))
                          .fill(0)
                          .map((_, i) => (
                            <th
                              key={i}
                              className="p-0 border-b border-r border-gray-200 font-medium w-8 h-8 text-xs"
                            >
                              {i + 1}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeMatrix === "link" &&
                        linkMatrix.map((row, i) => (
                          <tr key={i}>
                            <td className="p-0 border-b border-r border-gray-200 font-medium bg-gray-50 sticky left-0 z-10 w-8 h-8 text-xs">
                              {i + 1}
                            </td>
                            {row.map((val, j) => (
                              <td
                                key={j}
                                className="p-0 border-b border-r border-gray-200 w-8 h-8"
                              >
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) =>
                                    handleLinkMatrixChange(i, j, e.target.value)
                                  }
                                  className={`w-full h-full text-center p-0 m-0 focus:outline-none focus:bg-blue-50 text-xs ${i === j || !isEditingTopology ? "bg-gray-100 text-gray-400" : ""}`}
                                  readOnly={i === j || !isEditingTopology}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      {activeMatrix === "long" &&
                        longMatrix.map((row, i) => (
                          <tr key={i}>
                            <td className="p-0 border-b border-r border-gray-200 font-medium bg-gray-50 sticky left-0 z-10 w-8 h-8 text-xs">
                              {i + 1}
                            </td>
                            {row.map((val, j) => (
                              <td
                                key={j}
                                className="p-0 border-b border-r border-gray-200 w-8 h-8"
                              >
                                <input
                                  type="text"
                                  value={val === Infinity ? "inf" : val}
                                  onChange={(e) => {
                                    const newVal = e.target.value === "inf" ? Infinity : parseFloat(e.target.value);
                                    if (!isNaN(newVal)) {
                                      const next = longMatrix.map(r => [...r]);
                                      next[i][j] = newVal;
                                      next[j][i] = newVal;
                                      setLongMatrix(next);
                                    }
                                  }}
                                  readOnly={!isEditingTopology}
                                  className={`w-full h-full text-center p-0 m-0 text-xs focus:outline-none focus:bg-blue-50 ${i === j ? "bg-gray-100 text-gray-400" : isEditingTopology ? "bg-white" : "bg-gray-50 text-gray-500"}`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex space-x-2 mt-auto shrink-0 pt-2">
                <button
                  onClick={() => handleExport('json')}
                  className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors h-9"
                >
                  <Download className="w-4 h-4 mr-1.5" /> 导出 JSON
                </button>
                <button
                  onClick={() => handleExport('mat')}
                  className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 transition-colors h-9"
                >
                  <Download className="w-4 h-4 mr-1.5" /> 导出 MAT
                </button>
              </div>
            </>
          )}
        </div>

      {/* Vertical Drag Handle for Left Sidebar Width */}
        <div
          className="w-2 -ml-1 flex items-center justify-center cursor-col-resize z-20 shrink-0 group hover:bg-gray-200/50 transition-colors"
          onMouseDown={handleLeftSidebarResize}
        >
          <div className="h-12 w-1 bg-gray-300 rounded-full group-hover:bg-blue-400 transition-colors"></div>
        </div>

        {/* Middle Panel: Measurement Settings (Only visible if created) */}
        {isCreated && (
          <>
            <div
              className="bg-white overflow-y-auto flex flex-col border-l border-gray-200 shrink-0 relative z-10"
              style={{ width: `${middleSidebarWidth}%` }}
            >
              <div className="px-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
                <h2 className="text-sm font-semibold text-gray-700">
                  测量点设置
                </h2>
              </div>
              <div className="p-4 flex-1 overflow-y-auto">
                {isEditingTopology && (
                  <div className="mb-4 flex flex-col space-y-2 bg-gray-50 p-2.5 rounded-md border border-gray-100">
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] text-gray-500 font-medium">
                        {isConfiguringMeasurement ? "正在点击节点配置测量点..." : "测量点配置"}
                      </div>
                      {!isConfiguringMeasurement && (
                        <div className="relative group/pick">
                          <button
                            onClick={() => {
                              setOriginalMachineList([...machineList]);
                              setIsConfiguringMeasurement(true);
                              window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                                detail: { message: '【测量点配置】已开启！请直接在右侧画布中点击节点，以将其设置为测量点（或取消设置）。' } 
                              }));
                            }}
                            onMouseEnter={() => {
                              window.dispatchEvent(new CustomEvent('APP_GUIDANCE_MESSAGE', { 
                                detail: { message: '【测量点配置】点击开启配置模式。开启后可通过点击画布中的节点快速分配测量点。' } 
                              }));
                            }}
                            className="p-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-md hover:bg-blue-100 transition-all"
                            title="测量点配置"
                          >
                            <Hand className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    {isConfiguringMeasurement && (
                      <div className="flex space-x-2 w-full pt-1 border-t border-gray-200 mt-1">
                        <button
                          onClick={() => {
                            setMachineList(originalMachineList);
                            setMeasurementCount(String(originalMachineList.length));
                            setIsConfiguringMeasurement(false);
                          }}
                          className="flex-1 flex items-center justify-center px-2 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-md text-[10px] hover:bg-gray-50 transition-colors shadow-sm"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => setIsConfiguringMeasurement(false)}
                          className="flex-1 flex items-center justify-center px-3 py-1.5 bg-blue-600 text-white rounded-md text-[10px] hover:bg-blue-700 transition-colors shadow-sm"
                        >
                          <Check className="w-3 h-3 mr-1" /> 完成配置
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className={`grid grid-cols-1 gap-2 overflow-auto pr-1 pb-4 ${isEditingTopology ? "" : "mt-2"}`}>
                {machineList.map((val, i) => (
                  <div
                    key={i}
                    draggable={isEditingTopology}
                    onDragStart={() => {
                      if (isEditingTopology) setDraggedMachineIdx(i);
                    }}
                    onDragOver={(e) => {
                      if (isEditingTopology) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (!isEditingTopology) return;
                      if (draggedMachineIdx === null || draggedMachineIdx === i)
                        return;
                      setMachineList((prev) => {
                        const next = [...prev];
                        const item = next.splice(draggedMachineIdx, 1)[0];
                        next.splice(i, 0, item);
                        return next;
                      });
                      setDraggedMachineIdx(null);
                    }}
                    onDragEnd={() => setDraggedMachineIdx(null)}
                    className={`flex items-center border rounded transition-colors ${isEditingTopology ? "cursor-move" : ""} ${val !== 0 ? "border-blue-300 bg-blue-50/50" : "border-gray-200"} ${draggedMachineIdx === i ? "opacity-50" : ""}`}
                  >
                    <span className="bg-gray-100/50 px-3 py-2 text-xs font-medium text-gray-600 border-r border-gray-200 shrink-0 w-12 text-center">
                      M{i + 1}
                    </span>
                    <input
                      type="text"
                      value={val === 0 ? "" : val}
                      placeholder="未设置"
                      onChange={(e) => handleMachineChange(i, e.target.value)}
                      readOnly={!isEditingTopology}
                      className={`w-full p-2 text-sm text-center focus:outline-none bg-transparent ${!isEditingTopology ? "text-gray-400" : ""}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

            {/* Vertical Drag Handle for Middle Sidebar Width */}
            <div
              className="w-2 -ml-1 flex items-center justify-center cursor-col-resize z-20 shrink-0 group hover:bg-gray-200/50 transition-colors"
              onMouseDown={handleMiddleSidebarResize}
            >
              <div className="h-12 w-1 bg-gray-300 rounded-full group-hover:bg-blue-400 transition-colors"></div>
            </div>
          </>
        )}

        {/* Right Panel: Visualization */}
        <div
          className="flex-1 relative flex flex-col bg-gray-50 min-w-0"
          tabIndex={0} // To capture keyboard events
          onKeyDown={(e) => {
            const scs = settings.system?.shortcuts;
            if (!isEditingTopology || !scs) return;

            if (matchShortcut(e, scs.topoDelete)) {
              if (selectedNodes.length > 0) {
                e.preventDefault();
                handleDeleteSelectedNodes();
              } else if (selectedGuide) {
                e.preventDefault();
                setVGuides((prev) =>
                  prev.filter((g) => g.id !== selectedGuide),
                );
                setHGuides((prev) =>
                  prev.filter((g) => g.id !== selectedGuide),
                );
                setSelectedGuide(null);
              }
            } else if (matchShortcut(e, scs.topoUndo)) {
              e.preventDefault();
              undo();
            } else if (matchShortcut(e, scs.topoRedo)) {
              e.preventDefault();
              redo();
            } else if (matchShortcut(e, scs.topoCopy)) {
              e.preventDefault();
              copySelected(e.shiftKey);
            } else if (matchShortcut(e, scs.topoPaste)) {
              e.preventDefault();
              pasteClipboard(e.shiftKey);
            } else if (matchShortcut(e, scs.topoCut)) {
              e.preventDefault();
              if (selectedNodes.length > 0) {
                copySelected(false);
                handleDeleteSelectedNodes();
              }
            } else if (matchShortcut(e, scs.topoMirror)) {
              e.preventDefault();
              mirrorSelected();
            } else if (matchShortcut(e, scs.topoRotate)) {
              e.preventDefault();
              rotateSelected();
            }
          }}
        >
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0 h-[50px]">
              <h2 className="text-sm font-semibold text-gray-700">
                网络拓扑视图
              </h2>
              <div className="flex items-center space-x-2">
                {isEditingTopology && (
                  <div className="flex mr-4 space-x-1 border-r border-gray-200 pr-4">
                    {selectedNodes.length >= 2 && (
                      <>
                        <button
                          onClick={handleAlignX}
                          className="px-2 py-1 bg-gray-50 text-gray-600 rounded-md text-xs border border-gray-200 hover:bg-gray-100 transition-colors"
                          title="水平居中对齐"
                        >
                          水平居中
                        </button>
                        <button
                          onClick={handleAlignY}
                          className="px-2 py-1 bg-gray-50 text-gray-600 rounded-md text-xs border border-gray-200 hover:bg-gray-100 transition-colors"
                          title="垂直居中对齐"
                        >
                          垂直居中
                        </button>
                      </>
                    )}
                    {selectedNodes.length >= 3 && (
                      <>
                        <button
                          onClick={() => handleDistribute("x")}
                          className="px-2 py-1 bg-gray-50 text-gray-600 rounded-md text-xs border border-gray-200 hover:bg-gray-100 transition-colors"
                          title="水平等间距分布"
                        >
                          水平分布
                        </button>
                        <button
                          onClick={() => handleDistribute("y")}
                          className="px-2 py-1 bg-gray-50 text-gray-600 rounded-md text-xs border border-gray-200 hover:bg-gray-100 transition-colors"
                          title="垂直等间距分布"
                        >
                          垂直分布
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              ref={svgContainerRef}
              className="flex-1 relative bg-slate-50 overflow-hidden outline-none"
              onDoubleClick={handleFitToView}
              style={{
                backgroundImage:
                  "radial-gradient(#e5e7eb 1px, transparent 1px)",
                backgroundSize: `${20 * scale}px ${20 * scale}px`,
                backgroundPosition: `${pan.x}px ${pan.y}px`,
              }}
            >
              {isEditingTopology && (
                <div className="absolute top-[40px] right-4 z-30 group">
                  <button
                    onClick={handleAddNode}
                    className="w-10 h-10 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-black transition-all transform hover:scale-110"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                  <div className="absolute top-1/2 right-full mr-3 -translate-y-1/2 px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                    新增节点
                  </div>
                </div>
              )}
              {isCreated && isEditingTopology && (
                <>
                  {/* Guide creation areas */}
                  <div
                    className="absolute top-0 left-0 w-full h-5 bg-gray-100 border-b border-gray-300 cursor-row-resize z-10 hover:bg-gray-200 transition-colors flex items-center shadow-sm"
                    onMouseDown={(e) => {
                      const rect =
                        svgContainerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const mouseY = e.clientY - rect.top;
                      const svgY = (mouseY - pan.y) / scale;
                      const newId = Date.now().toString();
                      setHGuides((prev) => [...prev, { id: newId, val: svgY }]);
                      setDraggedGuide({ type: "h", id: newId });
                      setSelectedGuide(newId);
                    }}
                  >
                    <span className="text-[10px] text-gray-500 font-mono ml-8 select-none pointer-events-none">
                      从这里拖出水平参考线
                    </span>
                  </div>
                  <div
                    className="absolute top-0 left-0 h-full w-5 bg-gray-100 border-r border-gray-300 cursor-col-resize z-10 hover:bg-gray-200 transition-colors flex justify-center shadow-sm"
                    onMouseDown={(e) => {
                      const rect =
                        svgContainerRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const mouseX = e.clientX - rect.left;
                      const svgX = (mouseX - pan.x) / scale;
                      const newId = Date.now().toString();
                      setVGuides((prev) => [...prev, { id: newId, val: svgX }]);
                      setDraggedGuide({ type: "v", id: newId });
                      setSelectedGuide(newId);
                    }}
                  >
                    <span
                      className="text-[10px] text-gray-500 font-mono mt-20 select-none pointer-events-none"
                      style={{ writingMode: "vertical-lr" }}
                    >
                      从这里拖出垂直参考线
                    </span>
                  </div>
                </>
              )}
              {isCreated ? (
                <svg
                  className={`w-full h-full absolute inset-0 ${isDraggingCanvas ? "cursor-grabbing" : "cursor-crosshair"}`}
                  onWheel={handleWheel}
                  onMouseDown={handleMouseDownCanvas}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <g
                    transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}
                  >
                    {/* Snap Lines */}
                    {snapLines.map((sl, idx) => (
                      <line
                        key={`snap-${idx}`}
                        x1={sl.type === "v" ? sl.pos : -10000}
                        y1={sl.type === "h" ? sl.pos : -10000}
                        x2={sl.type === "v" ? sl.pos : 10000}
                        y2={sl.type === "h" ? sl.pos : 10000}
                        stroke="#f59e0b"
                        strokeWidth={1 / scale}
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Guides */}
                    {(isEditingTopology ? vGuides : []).map((g) => (
                      <g key={g.id}>
                        {/* Hit Area */}
                        <line
                          x1={g.val}
                          y1={-10000}
                          x2={g.val}
                          y2={10000}
                          stroke="transparent"
                          strokeWidth={12 / scale}
                          className="cursor-col-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (isEditingTopology) {
                              setDraggedGuide({ type: "v", id: g.id });
                              setSelectedGuide(g.id);
                            }
                          }}
                        />
                        {/* Visible Line */}
                        <line
                          x1={g.val}
                          y1={-10000}
                          x2={g.val}
                          y2={10000}
                          stroke={selectedGuide === g.id ? "#3b82f6" : "#94a3b8"}
                          strokeWidth={(selectedGuide === g.id ? 2.5 : 1) / scale}
                          strokeDasharray={selectedGuide === g.id ? "none" : "4 4"}
                          className="pointer-events-none transition-colors"
                        />
                      </g>
                    ))}
                    {(isEditingTopology ? hGuides : []).map((g) => (
                      <g key={g.id}>
                        {/* Hit Area */}
                        <line
                          x1={-10000}
                          y1={g.val}
                          x2={10000}
                          y2={g.val}
                          stroke="transparent"
                          strokeWidth={12 / scale}
                          className="cursor-row-resize pointer-events-auto"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            if (isEditingTopology) {
                              setDraggedGuide({ type: "h", id: g.id });
                              setSelectedGuide(g.id);
                            }
                          }}
                        />
                        {/* Visible Line */}
                        <line
                          x1={-10000}
                          y1={g.val}
                          x2={10000}
                          y2={g.val}
                          stroke={selectedGuide === g.id ? "#3b82f6" : "#94a3b8"}
                          strokeWidth={(selectedGuide === g.id ? 2.5 : 1) / scale}
                          strokeDasharray={selectedGuide === g.id ? "none" : "4 4"}
                          className="pointer-events-none transition-colors"
                        />
                      </g>
                    ))}

                    {isEditingTopology && (
                      <g className="text-[10px] text-gray-400 font-mono pointer-events-none select-none">
                        {/* X Axis */}
                        <line
                          x1={-10000}
                          y1={0}
                          x2={10000}
                          y2={0}
                          stroke="#cbd5e1"
                          strokeWidth={1 / scale}
                        />
                        {/* Y Axis */}
                        <line
                          x1={0}
                          y1={-10000}
                          x2={0}
                          y2={10000}
                          stroke="#cbd5e1"
                          strokeWidth={1 / scale}
                        />

                        {/* Origin */}
                        <circle cx={0} cy={0} r={4 / scale} fill="#94a3b8" />
                        <text x={8 / scale} y={-8 / scale} fill="#64748b">
                          (0,0)
                        </text>

                        {/* Grid Labels (approximate every 100 units) */}
                        {Array.from({ length: 41 }, (_, i) => i * 100 - 2000).map(
                          (val) => (
                            <React.Fragment key={`axis-${val}`}>
                              {val !== 0 && (
                                <>
                                  <line
                                    x1={val}
                                    y1={-4 / scale}
                                    x2={val}
                                    y2={4 / scale}
                                    stroke="#94a3b8"
                                    strokeWidth={1 / scale}
                                  />
                                  <text
                                    x={val}
                                    y={16 / scale}
                                    textAnchor="middle"
                                    fill="#94a3b8"
                                  >
                                    {val}
                                  </text>

                                  <line
                                    x1={-4 / scale}
                                    y1={val}
                                    x2={4 / scale}
                                    y2={val}
                                    stroke="#94a3b8"
                                    strokeWidth={1 / scale}
                                  />
                                  <text
                                    x={12 / scale}
                                    y={val + 4 / scale}
                                    fill="#94a3b8"
                                  >
                                    {-val}
                                  </text>
                                </>
                              )}
                            </React.Fragment>
                          ),
                        )}
                      </g>
                    )}

                    {/* Draw edges */}
                    {linkMatrix.map((row, i) =>
                      row.map((val, j) => {
                        if (val === 1 && i < j) {
                          const node1 = nodes.find((n) => n.id === i + 1);
                          const node2 = nodes.find((n) => n.id === j + 1);
                          if (node1 && node2) {
                            return (
                              <line
                                key={`edge-${i}-${j}`}
                                x1={node1.x}
                                y1={node1.y}
                                x2={node2.x}
                                y2={node2.y}
                                stroke="#0ea5e9" // sky-500
                                strokeWidth={1}
                              />
                            );
                          }
                        }
                        return null;
                      }),
                    )}

                    {/* Draw nodes */}
                    {[...nodes].reverse().map((node) => {
                      const isMeasurement = machineList.includes(node.id);
                      const isSelected = selectedNodes.includes(node.id);
                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className={
                            isConfiguringMeasurement || isEditingTopology
                              ? "cursor-pointer"
                              : "cursor-default"
                          }
                          onMouseDown={(e) => handleMouseDownNode(e, node.id)}
                        >
                          {isSelected && (
                            <circle
                              r={6.5}
                              fill="none"
                              stroke="#94a3b8"
                              strokeWidth={1}
                              strokeDasharray="3 3"
                            >
                              <animateTransform
                                attributeName="transform"
                                type="rotate"
                                from="0 0 0"
                                to="360 0 0"
                                dur="4s"
                                repeatCount="indefinite"
                              />
                            </circle>
                          )}
                          <circle
                            r={5}
                            fill={isMeasurement ? "#ef4444" : "#1e293b"}
                            className={`transition-colors hover:opacity-80`}
                            stroke={isMeasurement ? "#fca5a5" : "transparent"}
                            strokeWidth={isMeasurement ? 2 : 0}
                          />
                          <text
                            fill="#ffffff"
                            fontSize="4.5"
                            fontFamily="sans-serif"
                            fontWeight="bold"
                            textAnchor="middle"
                            dy=".3em"
                            className="pointer-events-none select-none"
                          >
                            {node.id}
                          </text>
                        </g>
                      );
                    })}

                    {/* Selection Box */}
                    {selectionBox && (
                      <rect
                        x={Math.min(selectionBox.startX, selectionBox.currentX)}
                        y={Math.min(selectionBox.startY, selectionBox.currentY)}
                        width={Math.abs(
                          selectionBox.currentX - selectionBox.startX,
                        )}
                        height={Math.abs(
                          selectionBox.currentY - selectionBox.startY,
                        )}
                        fill="rgba(59, 130, 246, 0.1)"
                        stroke="#3b82f6"
                        strokeWidth={1 / scale}
                        strokeDasharray={`${4 / scale} ${4 / scale}`}
                        pointerEvents="none"
                      />
                    )}
                  </g>
                </svg>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                  <Network className="w-12 h-12 mb-3 text-gray-300" />
                  <p>请先在左侧创建网络以开始拓扑构建</p>
                </div>
              )}
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
                {isConfiguringMeasurement ? (
                  <span className="text-blue-600 font-medium" style={{ fontStyle: 'normal', fontWeight: 'bold' }}>
                    请在右侧拓扑图中点击节点以添加或移除测量点。配置完成后点击完成配置。
                  </span>
                ) : (
                  guidanceMsg
                )}
              </span>
            </>
          );
        })()}
      </footer>

      {/* Add Node Modal */}
      {addNodeModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl w-80">
            <h3 className="text-sm font-semibold mb-3">新增节点</h3>
            <p className="text-xs text-gray-500 mb-4">
              请输入新节点的编号 (如果与现有编号重复，后续编号会自动+1)
            </p>
            <input
              type="number"
              value={newNodeIdInput}
              onChange={(e) => setNewNodeIdInput(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500 mb-5"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddNode();
                if (e.key === "Escape") setAddNodeModalOpen(false);
              }}
            />
            <div className="flex justify-end space-x-2">
              <button
                onClick={() => setAddNodeModalOpen(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmAddNode}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded transition-colors"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
