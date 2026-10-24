import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useCanvas } from '../context/CanvasContext';

const BTN = 'w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-95';

export default function ZoomControls() {
  const { view, zoomIn, zoomOut, resetView } = useCanvas();
  return (
    <div className="fixed bottom-6 right-6 flex items-center gap-1.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md px-3 py-1.5 rounded-full text-slate-700 dark:text-white shadow-md border border-slate-200/80 dark:border-slate-700/50 z-40 font-mono text-xs transition-colors duration-300">
      <button className={BTN} title="Zoom Out (-)" onClick={zoomOut}><Minus className="w-3.5 h-3.5" /></button>
      <span className="min-w-[42px] text-center text-slate-600 dark:text-slate-300 font-medium select-none">{Math.round(view.scale * 100)}%</span>
      <button className={BTN} title="Zoom In (+)" onClick={zoomIn}><Plus className="w-3.5 h-3.5" /></button>
      <div className="h-3.5 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1"></div>
      <button className={BTN.replace('text-slate-600 dark:text-slate-300', 'text-slate-500 dark:text-slate-400')} title="Reset View (R)" onClick={resetView}>
        <RotateCcw className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}