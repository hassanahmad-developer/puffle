import { Laptop, File as FileIcon } from 'lucide-react';
import { useTransfers } from '../lib/xferStore';

export default function TransferLayer() {
  const items = useTransfers();
  return (
    <div id="xferLayer">
      {items.map((t) => (
        <div key={t.key} className={`xfer-card ${t.done ? 'done' : ''} ${t.leaving ? 'leaving' : ''}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="xfer-title text-xs font-bold text-slate-700 dark:text-slate-100 truncate">{t.title}</div>
            <div className="xfer-count text-[10px] font-mono text-slate-400">
              {t.total > 1 ? `file ${t.index + 1}/${t.total}` : ''}
            </div>
          </div>
          <div className="xfer-stage">
            <div className="xfer-dev from" title={t.dir === 'send' ? 'You' : t.peerName}><Laptop className="w-4 h-4" /></div>
            <div className="xfer-line"></div>
            <span className="xfer-fly" style={{ animationDelay: '0s' }}><FileIcon /></span>
            <span className="xfer-fly" style={{ animationDelay: '0.5s' }}><FileIcon /></span>
            <span className="xfer-fly" style={{ animationDelay: '1s' }}><FileIcon /></span>
            <div className="xfer-dev to" title={t.dir === 'send' ? t.peerName : 'You'}><Laptop className="w-4 h-4" /></div>
          </div>
          <div className="xfer-bar-wrap"><div className="xfer-bar" style={{ width: `${t.pct}%` }}></div></div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span className="xfer-file truncate max-w-[200px]">{t.fileName}</span>
            <span className="xfer-pct">{t.pct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}