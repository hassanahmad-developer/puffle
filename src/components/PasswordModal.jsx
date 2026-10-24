import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { usePasswordPrompt, closePasswordPrompt } from '../lib/passwordPrompt';
import { AUTH_MIN_LENGTH } from '../config/constats';

const INPUT_CLASS = 'w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-pink-400 transition-colors';

function PromptBody({ opts }) {
  const { title, message, confirm = false, submitLabel = 'Continue' } = opts;
  const [value, setValue] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    if (value.length < AUTH_MIN_LENGTH) {
      setError(`Password must be at least ${AUTH_MIN_LENGTH} characters.`);
      return;
    }
    if (confirm && confirmValue !== value) {
      setError('Passwords do not match.');
      return;
    }
    closePasswordPrompt(value);
  };

  const onKeyDown = (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); submit(); }
    else if (event.key === 'Escape') { event.preventDefault(); closePasswordPrompt(null); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" onKeyDown={onKeyDown}>
      <div className="w-[360px] max-w-[calc(100vw-32px)] rounded-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/70 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-9 h-9 rounded-md bg-gradient-to-br from-pink-500 to-violet-500 text-white flex items-center justify-center shadow-md shadow-pink-500/20">
            <Lock className="w-4 h-4" />
          </span>
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-white">{title}</h3>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400 mb-4">{message}</p>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="password"
            className={`pw-input ${INPUT_CLASS}`}
            style={{ userSelect: 'text' }}
            placeholder="Password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {confirm && (
            <input
              type="password"
              className={`pw-confirm ${INPUT_CLASS}`}
              style={{ userSelect: 'text' }}
              placeholder="Confirm password"
              autoComplete="off"
              spellCheck={false}
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
            />
          )}
        </div>
        <div className="pw-error min-h-[16px] mt-2 text-[11px] font-semibold text-red-500">{error}</div>
        <div className="flex justify-end gap-2 mt-3">
          <button
            className="pw-cancel px-4 py-2 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
            onClick={() => closePasswordPrompt(null)}
          >
            Cancel
          </button>
          <button
            className="pw-submit px-4 py-2 rounded-md bg-pink-500 hover:bg-pink-600 text-white text-xs font-bold shadow-md transition-colors"
            onClick={submit}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PasswordModal() {
  const prompt = usePasswordPrompt();
  // key = har naye prompt par fresh state
  return prompt ? <PromptBody key={prompt.opts.title + prompt.opts.submitLabel} opts={prompt.opts} /> : null;
}