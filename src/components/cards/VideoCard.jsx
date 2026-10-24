import { useEffect, useRef } from 'react';
import { PhoneOff } from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';
import { useCardInteractions } from '../UseCardInteractions';
import { showToast } from '../../lib/Toast';

export default function VideoCard({ card, selected }) {
  const { selectCard, removeCard, stopVideoCall } = useCanvas();
  const { cardRef, handleRef } = useCardInteractions(card.id, false);
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = card.stream;
    el.muted = !card.remote; // apni awaaz local par mute
    if (card.remote) {
      el.play().catch((error) => {
        console.warn('Remote video autoplay was blocked:', error);
        showToast('Video is connected, but autoplay was blocked.', 'info');
      });
    }
  }, [card.stream, card.remote]);

  const endCall = () => {
    if (!card.remote) stopVideoCall();
    else removeCard(card.id);
  };

  return (
    <div
      ref={cardRef}
      data-id={card.id}
      data-stream-id={card.streamId}
      onClick={(e) => { e.stopPropagation(); selectCard(card.id); }}
      className={`video-card absolute bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-md p-3 shadow-sm border transition-shadow duration-200 ${selected ? 'selected border-pink-400 shadow-md' : 'border-transparent'}`}
      style={{ left: card.x, top: card.y, width: 280 }}
    >
      <div
        onMouseDown={(e) => e.preventDefault()}
        className={`format-bar ${selected ? '' : 'opacity-0 pointer-events-none'} transition-opacity absolute -top-11 left-0 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-700 dark:text-white p-1 rounded-md shadow-md border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-mono z-20`}
      >
        <button
          data-action="delete"
          className="px-2 py-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-all flex items-center gap-1"
          title="End Stream"
          onClick={endCall}
        >
          <PhoneOff className="w-3.5 h-3.5" /> End Call
        </button>
      </div>

      <div ref={handleRef} className="card-handle w-full h-4 mb-1 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="w-8 h-[3px] bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>

      <div className="relative w-full h-44 rounded-md overflow-hidden bg-slate-900 mb-2">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`w-full h-full object-cover pointer-events-none ${card.remote ? '' : 'transform -scale-x-100'}`}
        ></video>
      </div>
      <div className="video-label truncate font-medium text-xs text-slate-800 dark:text-slate-200">{card.name}</div>
    </div>
  );
}