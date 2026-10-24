import { useEffect, useRef, useState } from 'react';
import { useCanvas } from '../context/CanvasContext';
import { clamp } from '../lib/utils';
import { MIN_SCALE, MAX_SCALE, ZOOM_STEP_WHEEL } from '../config/constats';
import TextCard from './cards/TextCard';
import FileCard from './cards/FileCard';
import MultiFileCard from './cards/MultiFileCard';
import VideoCard from './cards/VideoCard';

const MODE_CLASS = { pan: 'pan-mode', select: 'select-mode', text: 'text-mode' };

export default function Canvas() {
  const { view, viewRef, setView, cursorMode, setCursorMode, cards, selectedId, addTextCard, selectCard } = useCanvas();
  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const panning = useRef(null);
  const [grabbing, setGrabbing] = useState(false);

  // ---- wheel zoom (cards / drawer / sidebar par nahi) ----
  useEffect(() => {
    const onWheel = (e) => {
      if (
        e.target.closest('.text-card') || e.target.closest('.file-card') || e.target.closest('.video-card') ||
        e.target.closest('#drawerWidget') || e.target.closest('#sidebarDrawer')
      ) return;
      e.preventDefault();
      const v = viewRef.current;
      const next = clamp(e.deltaY < 0 ? v.scale + ZOOM_STEP_WHEEL : v.scale - ZOOM_STEP_WHEEL, MIN_SCALE, MAX_SCALE);
      setView({
        scale: next,
        panX: e.clientX - (e.clientX - v.panX) * (next / v.scale),
        panY: e.clientY - (e.clientY - v.panY) * (next / v.scale),
      });
    };
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [viewRef, setView]);

  // ---- pan (window level move/up) ----
  useEffect(() => {
    const onMove = (e) => {
      if (!panning.current) return;
      setView((v) => ({ ...v, panX: e.clientX - panning.current.startX, panY: e.clientY - panning.current.startY }));
    };
    const onUp = () => {
      panning.current = null;
      setGrabbing(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setView]);

  const onMouseDown = (e) => {
    const onBackground = e.target === canvasRef.current || e.target === viewportRef.current;

    if (cursorMode === 'text') {
      if (onBackground) {
        const rect = canvasRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - view.panX) / view.scale;
        const y = (e.clientY - rect.top - view.panY) / view.scale;
        const id = addTextCard(x, y, 240, { autoFocus: true });
        selectCard(id);
        setCursorMode('pan');
      }
      return;
    }

    if (cursorMode === 'pan' && onBackground && (e.button === 0 || e.button === 1)) {
      panning.current = { startX: e.clientX - view.panX, startY: e.clientY - view.panY };
      setGrabbing(true);
    }
  };

  return (
    <div
      id="canvas"
      ref={canvasRef}
      onMouseDown={onMouseDown}
      className={`canvas-container ${MODE_CLASS[cursorMode]} ${grabbing ? 'grabbing' : ''}`}
      style={{
        backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`,
        backgroundPosition: `${view.panX}px ${view.panY}px`,
      }}
    >
      <div
        id="viewport"
        ref={viewportRef}
        style={{ transform: `translate3d(${view.panX}px, ${view.panY}px, 0) scale(${view.scale})` }}
      >
        {cards.map((card) => {
          const selected = card.id === selectedId;
          if (card.kind === 'text') return <TextCard key={card.id} card={card} selected={selected} />;
          if (card.kind === 'file') return <FileCard key={card.id} card={card} selected={selected} />;
          if (card.kind === 'multi') return <MultiFileCard key={card.id} card={card} selected={selected} />;
          return <VideoCard key={card.id} card={card} selected={selected} />;
        })}
      </div>

      <div
        id="emptyState"
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-opacity duration-300 select-none"
        style={{ opacity: cards.length === 0 ? 1 : 0 }}
      >
        <h2 className="text-3xl font-extrabold tracking-widest text-slate-300 dark:text-slate-700/80 uppercase">
          Canvas is Empty
        </h2>
        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mt-2 tracking-wide">
          Drag files / folders or start a Video Call
        </p>
      </div>
    </div>
  );
}