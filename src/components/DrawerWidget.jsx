import { useEffect, useRef, useState } from 'react';
import { Hand, MousePointer, Type, X } from 'lucide-react';
import { useCanvas } from '../context/CanvasContext';

const TOOL_IDLE = 'w-8 h-8 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-all shrink-0';
const TOOL_ACTIVE = 'w-8 h-8 rounded-full flex items-center justify-center bg-pink-500 text-white shadow-md transition-all shrink-0';

export default function DrawerWidget({ open, setOpen }) {
  const { cursorMode, setCursorMode } = useCanvas();
  const widgetRef = useRef(null);
  const [contentVisible, setContentVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setContentVisible(false);
      return undefined;
    }
    const t = setTimeout(() => setContentVisible(true), 100);
    return () => clearTimeout(t);
  }, [open]);

  // bahar click par band
  useEffect(() => {
    const onClick = (e) => {
      if (open && widgetRef.current && !widgetRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [open, setOpen]);

  return (
    <div className="fixed top-6 left-6 z-40">
      <div
        id="drawerWidget"
        ref={widgetRef}
        className={`vertical-drawer w-12 ${open ? 'rounded-[26px]' : 'rounded-full'} bg-white/90 dark:bg-slate-800/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-700/60 shadow-md hover:shadow-sm text-slate-700 dark:text-white flex flex-col items-center`}
        style={{ height: open ? 235 : 48 }}
      >
        <button
          className="w-12 h-12 rounded-full hover:bg-slate-100/80 dark:hover:bg-slate-700/60 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group shrink-0"
          title="Tools Menu"
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        >
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-4 h-[2px] bg-slate-600 dark:bg-slate-300 group-hover:bg-pink-500 dark:group-hover:bg-white rounded-full transition-all"></span>
          ))}
        </button>

        <div className={`w-full flex flex-col items-center gap-2 pt-1 pb-2 transition-opacity duration-200 ${contentVisible ? '' : 'opacity-0 pointer-events-none'}`}>
          <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-700/60 shrink-0"></div>

          <button className={cursorMode === 'pan' ? TOOL_ACTIVE : TOOL_IDLE} title="Pan Canvas (H)" onClick={() => setCursorMode('pan')}>
            <Hand className="w-4 h-4" />
          </button>
          <button className={cursorMode === 'select' ? TOOL_ACTIVE : TOOL_IDLE} title="Select Tool (V)" onClick={() => setCursorMode('select')}>
            <MousePointer className="w-4 h-4" />
          </button>
          <button className={cursorMode === 'text' ? TOOL_ACTIVE : TOOL_IDLE} title="Text Tool (T)" onClick={() => setCursorMode('text')}>
            <Type className="w-4 h-4" />
          </button>

          <div className="w-6 h-[1px] bg-slate-200 dark:bg-slate-700/60 shrink-0"></div>

          <button
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition-all active:scale-90 shrink-0"
            title="Close Menu"
            onClick={(e) => { e.stopPropagation(); setOpen(false); }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}