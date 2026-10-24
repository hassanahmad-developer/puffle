import { useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';
import { useCardInteractions } from '../UseCardInteractions';

const BTN = 'px-2 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:text-slate-900 dark:hover:text-white transition-all';
const BTN_ACTIVE = 'px-2 py-0.5 rounded bg-pink-500 text-white font-bold transition-all';
const FMT_CLASS = { h1: 'text-2xl font-extrabold', h2: 'text-lg font-bold', p: 'text-base font-normal' };

export default function TextCard({ card, selected }) {
  const { selectCard, patchCard, removeCard, setFormat, broadcast } = useCanvas();
  const { cardRef, handleRef, resizeRef } = useCardInteractions(card.id, true);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Remote text aaye (aur main type nahi kar raha) to DOM update
  useEffect(() => {
    const el = inputRef.current;
    if (!el || document.activeElement === el) return;
    const next = card.text || '';
    if (el.innerText !== next) el.textContent = next;
  }, [card.text]);

  useEffect(() => {
    if (card.autoFocus && inputRef.current) inputRef.current.focus();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendText = () => broadcast({ type: 'card-text', id: card.id, text: inputRef.current ? inputRef.current.innerText : '' });

  const onInput = () => {
    patchCard(card.id, { text: inputRef.current.innerText });
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(sendText, 40);
  };

  const onBlur = () => {
    clearTimeout(timerRef.current);
    sendText();
  };

  const applyFmt = (fmt) => {
    setFormat(card.id, fmt);
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div
      ref={cardRef}
      data-id={card.id}
      data-fmt={card.fmt}
      onClick={(e) => { e.stopPropagation(); selectCard(card.id); }}
      className={`text-card absolute bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-md p-3 pb-6 shadow-sm border transition-shadow duration-200 ${selected ? 'selected border-pink-400 shadow-md' : 'border-transparent'}`}
      style={{ left: card.x, top: card.y, width: card.w }}
    >
      <div
        onMouseDown={(e) => e.preventDefault()}
        className={`format-bar ${selected ? '' : 'opacity-0 pointer-events-none'} transition-opacity absolute -top-11 left-0 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md text-slate-700 dark:text-white p-1 rounded-md shadow-md border border-slate-200/80 dark:border-slate-700/60 text-[11px] font-mono z-20`}
      >
        <button data-type="h1" className={card.fmt === 'h1' ? BTN_ACTIVE : BTN} onClick={() => applyFmt('h1')}>H1</button>
        <button data-type="h2" className={card.fmt === 'h2' ? BTN_ACTIVE : BTN} onClick={() => applyFmt('h2')}>H2</button>
        <button data-type="p" className={card.fmt === 'p' || !card.fmt ? BTN_ACTIVE : BTN} onClick={() => applyFmt('p')}>P</button>
        <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700 mx-0.5"></div>
        <button
          data-action="delete"
          className="px-1.5 py-0.5 rounded hover:bg-red-500/10 text-red-500 hover:text-red-600 transition-all"
          title="Delete Card"
          onClick={() => removeCard(card.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div ref={handleRef} className="card-handle w-full h-4 mb-1 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity">
        <div className="w-8 h-[3px] bg-slate-400 dark:bg-slate-500 rounded-full"></div>
      </div>

      <div
        ref={inputRef}
        className={`text-input-area w-full text-slate-800 dark:text-slate-100 font-sans leading-relaxed ${FMT_CLASS[card.fmt] || FMT_CLASS.p}`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Start typing..."
        onInput={onInput}
        onBlur={onBlur}
      ></div>
      <div ref={resizeRef} className="resize-handle" title="Resize Width"></div>
    </div>
  );
}