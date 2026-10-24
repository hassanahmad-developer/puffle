import { useEffect, useState } from 'react';
import { Trash2, File as FileIcon, Download } from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';
import { useCardInteractions } from '../UseCardInteractions';
import { downloadFile } from '../../lib/dropUtils';
import { formatKB } from '../../lib/utils';

export default function FileCard({ card, selected }) {
  const { selectCard, removeCard } = useCanvas();
  const { cardRef, handleRef } = useCardInteractions(card.id, false);
  const file = card.files[0];
  const isImage = file.type.startsWith('image/');
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!isImage) return undefined;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file, isImage]);

  return (
    <div
      ref={cardRef}
      data-id={card.id}
      onClick={(e) => { e.stopPropagation(); selectCard(card.id); }}
      className={`file-card absolute bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-md p-3 shadow-sm border transition-shadow duration-200 ${selected ? 'selected border-pink-400 shadow-md' : 'border-transparent'}`}
      style={{ left: card.x, top: card.y, width: 240 }}
    >
      <div
        onMouseDown={(e) => e.preventDefault()}
        className={`format-bar ${selected ? '' : 'opacity-0 pointer-events-none'} transition-opacity absolute -top-11 left-0 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-700 dark:text-white p-1 rounded-md shadow-md border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-mono z-20`}
      >
        <button
          data-action="delete"
          className="px-2 py-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-all flex items-center gap-1"
          title="Delete File"
          onClick={() => removeCard(card.id)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      <div ref={handleRef} className="card-handle w-full h-4 mb-1 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="w-8 h-[3px] bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>

      {isImage ? (
        <div className="relative w-full h-32 rounded-md overflow-hidden mb-2 bg-slate-100 dark:bg-slate-900 group/preview">
          {url && <img src={url} alt="" className="w-full h-full object-cover" />}
          <button
            className="single-download-btn absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center text-white"
            title="Download File"
            onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
          >
            <Download className="w-6 h-6" />
          </button>
        </div>
      ) : (
        <div className="relative w-full h-20 rounded-md bg-slate-100 dark:bg-slate-900/60 flex items-center justify-center mb-2 text-slate-400 dark:text-slate-500 group/preview">
          <FileIcon className="w-8 h-8" />
          <button
            className="single-download-btn absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] opacity-0 group-hover/preview:opacity-100 transition-opacity flex items-center justify-center text-white rounded-md"
            title="Download File"
            onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
          >
            <Download className="w-6 h-6" />
          </button>
        </div>
      )}

      <div className="truncate font-medium text-xs text-slate-800 dark:text-slate-200" title={file.name}>{file.name}</div>
      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">{formatKB(file.size)}</div>
    </div>
  );
}