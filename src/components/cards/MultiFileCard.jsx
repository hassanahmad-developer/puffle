import { useEffect, useState } from 'react';
import { Trash2, File as FileIcon, Download } from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';
import { useCardInteractions } from '../UseCardInteractions';
import { downloadFile, downloadAsZip } from '../../lib/dropUtils';
import { formatKB } from '../../lib/utils';

export default function MultiFileCard({ card, selected }) {
  const { selectCard, removeCard } = useCanvas();
  const { cardRef, handleRef } = useCardInteractions(card.id, false);
  const files = card.files;
  const [urls, setUrls] = useState([]);

  useEffect(() => {
    const created = files.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null));
    setUrls(created);
    return () => created.forEach((u) => u && URL.revokeObjectURL(u));
  }, [files]);

  return (
    <div
      ref={cardRef}
      data-id={card.id}
      onClick={(e) => { e.stopPropagation(); selectCard(card.id); }}
      className={`file-card absolute bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-md p-3 shadow-sm border transition-shadow duration-200 ${selected ? 'selected border-pink-400 shadow-md' : 'border-transparent'}`}
      style={{ left: card.x, top: card.y, width: 320 }}
    >
      <div
        onMouseDown={(e) => e.preventDefault()}
        className={`format-bar ${selected ? '' : 'opacity-0 pointer-events-none'} transition-opacity absolute -top-11 left-0 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-700 dark:text-white p-1.5 rounded-md shadow-md border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-mono z-20`}
      >
        <button
          data-action="delete"
          className="px-2 py-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-all flex items-center gap-1"
          title="Delete Section"
          onClick={() => removeCard(card.id)}
        >
          <Trash2 className="w-3.5 h-3.5" /> Delete Section
        </button>
      </div>

      <div ref={handleRef} className="card-handle w-full h-4 mb-1 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="w-8 h-[3px] bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>

      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Files ({files.length})</span>
        <button
          className="download-all-header-btn flex items-center gap-1 text-[11px] font-medium text-pink-500 hover:text-pink-600 dark:text-pink-400 dark:hover:text-pink-300 transition-colors"
          title="Download All as ZIP"
          onClick={(e) => { e.stopPropagation(); downloadAsZip(files, 'puffle-files-' + files.length + '.zip'); }}
        >
          <Download className="w-3 h-3" /> Download ZIP
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
        {files.map((file, index) => {
          const url = urls[index];
          return (
            <div key={index} className="flex flex-col bg-slate-50 dark:bg-slate-900/50 rounded-md p-2 border border-slate-200/60 dark:border-slate-700/50">
              {file.type.startsWith('image/') ? (
                <div className="relative w-full h-20 rounded-md overflow-hidden mb-1.5 bg-slate-200 dark:bg-slate-800 group/item">
                  {url && <img src={url} alt="" className="w-full h-full object-cover" />}
                  <button
                    className="grid-download-btn absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center text-white"
                    title="Download File"
                    onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative w-full h-20 rounded-md bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-1.5 text-slate-400 group/item">
                  <FileIcon className="w-6 h-6" />
                  <button
                    className="grid-download-btn absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center text-white rounded-md"
                    title="Download File"
                    onClick={(e) => { e.stopPropagation(); downloadFile(file); }}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
              <div className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200" title={file.name}>{file.name}</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">{formatKB(file.size)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}