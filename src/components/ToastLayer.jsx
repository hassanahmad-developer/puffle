import { useToasts } from '../lib/Toast';

export default function ToastLayer() {
  const toasts = useToasts();
  return (
    <div id="toastLayer" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`puffle-toast ${t.type} ${t.leaving ? 'leaving' : ''}`}>{t.message}</div>
      ))}
    </div>
  );
}