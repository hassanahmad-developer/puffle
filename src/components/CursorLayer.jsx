import { useRemoteCursors } from '../lib/cursorStore';
import { useCanvas } from '../context/CanvasContext';
import { colorFor } from '../lib/utils';

export default function CursorLayer() {
  const cursors = useRemoteCursors();
  const { view } = useCanvas();

  return (
    <div id="cursorLayer">
      {Object.entries(cursors).map(([peerId, c]) => {
        const color = colorFor(peerId);
        return (
          <div
            key={peerId}
            className="remote-cursor"
            style={{
              display: c.visible ? 'block' : 'none',
              transform: `translate(${c.x * view.scale + view.panX}px, ${c.y * view.scale + view.panY}px)`,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round">
              <path d="M4 3l16 7-7 2-2 7z" />
            </svg>
            <div className="cursor-label" style={{ background: color }}>{c.name}</div>
          </div>
        );
      })}
    </div>
  );
}