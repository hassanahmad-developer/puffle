import { useEffect, useRef } from 'react';
import { useCanvas } from '../context/CanvasContext';

/**
 * Drag (handle se) + optional width resize.
 * Drag ke dauran DOM transform use hota hai (smooth), mouse-up par state commit + broadcast.
 */
export function useCardInteractions(id, resizable = false) {
  const { viewRef, selectCard, commitMove, commitResize, broadcast } = useCanvas();
  const cardRef = useRef(null);
  const handleRef = useRef(null);
  const resizeRef = useRef(null);

  const api = useRef({});
  api.current = { selectCard, commitMove, commitResize, broadcast };

  useEffect(() => {
    const card = cardRef.current;
    const handle = handleRef.current;
    if (!card || !handle) return undefined;

    // ----- drag -----
    let dragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0, curLeft = 0, curTop = 0, lastSent = 0;

    const onMove = (e) => {
      if (!dragging) return;
      const s = viewRef.current.scale;
      const dx = (e.clientX - startX) / s;
      const dy = (e.clientY - startY) / s;
      curLeft = initialLeft + dx;
      curTop = initialTop + dy;
      card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      const now = performance.now();
      if (now - lastSent >= 30) {
        lastSent = now;
        api.current.broadcast({ type: 'card-move', id, x: curLeft, y: curTop });
      }
    };

    const onUp = () => {
      if (dragging) {
        card.style.left = `${curLeft}px`;
        card.style.top = `${curTop}px`;
        card.style.transform = '';
        card.style.willChange = '';
        api.current.commitMove(id, curLeft, curTop);
      }
      dragging = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    const onDown = (evt) => {
      evt.stopPropagation();
      dragging = true;
      card.style.willChange = 'transform';
      api.current.selectCard(id);
      startX = evt.clientX;
      startY = evt.clientY;
      initialLeft = parseFloat(card.style.left);
      initialTop = parseFloat(card.style.top);
      curLeft = initialLeft;
      curTop = initialTop;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    handle.addEventListener('mousedown', onDown);

    // ----- resize -----
    const rh = resizeRef.current;
    let resizing = false;
    let startRX = 0, initialWidth = 0, lastResizeSent = 0;
    const onResizeMove = (e) => {
      if (!resizing) return;
      const dw = (e.clientX - startRX) / viewRef.current.scale;
      card.style.width = `${Math.max(140, initialWidth + dw)}px`;
      const now = performance.now();
      if (now - lastResizeSent >= 30) {
        lastResizeSent = now;
        api.current.broadcast({ type: 'card-resize', id, w: parseFloat(card.style.width) });
      }
    };
    const onResizeUp = () => {
      if (resizing) api.current.commitResize(id, parseFloat(card.style.width));
      resizing = false;
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeUp);
    };
    const onResizeDown = (evt) => {
      evt.stopPropagation();
      resizing = true;
      startRX = evt.clientX;
      initialWidth = card.offsetWidth;
      window.addEventListener('mousemove', onResizeMove);
      window.addEventListener('mouseup', onResizeUp);
    };
    if (resizable && rh) rh.addEventListener('mousedown', onResizeDown);

    return () => {
      handle.removeEventListener('mousedown', onDown);
      if (rh) rh.removeEventListener('mousedown', onResizeDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeUp);
    };
  }, [id, resizable, viewRef]);

  return { cardRef, handleRef, resizeRef };
}