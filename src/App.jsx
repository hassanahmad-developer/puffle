import { useEffect, useState } from 'react';
import { PanelRight } from 'lucide-react';
import { NetworkProvider, useNetworkEvent } from './context/NetworkContext';
import { CanvasProvider, useCanvas } from './context/CanvasContext';
import { showToast } from './lib/toast';
import Canvas from './components/Canvas';
import CursorLayer from './components/CursorLayer';
import TransferLayer from './components/TransferLayer';
import ToastLayer from './components/ToastLayer';
import DrawerWidget from './components/DrawerWidget';
import Sidebar from './components/Sidebar';
import VideoDock from './components/VideoDock';
import ZoomControls from './components/ZoomControls';
import PasswordModal from './components/PasswordModal';

function Shell() {
  const { deselectAll } = useCanvas();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Engine ke toasts
  useNetworkEvent('toast', (message, type, duration) => showToast(message, type, duration));

  // Escape: sidebar + drawer band, selection hatao
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      setSidebarOpen(false);
      setDrawerOpen(false);
      deselectAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deselectAll]);

  return (
    <>
      <Canvas />
      <CursorLayer />
      <TransferLayer />
      <ToastLayer />

      <DrawerWidget open={drawerOpen} setOpen={setDrawerOpen} />

      {/* Top-Right Sidebar Toggle */}
      <div className="fixed top-6 right-6 z-40">
        <button
          className="w-11 h-11 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full shadow-md border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-center text-slate-700 dark:text-white hover:scale-105 active:scale-95 transition-all"
          title="Shortcuts & Info"
          onClick={(e) => { e.stopPropagation(); setSidebarOpen((v) => !v); }}
        >
          <PanelRight className="w-5 h-5" />
        </button>
      </div>

      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <VideoDock />
      <ZoomControls />
      <PasswordModal />
    </>
  );
}

export default function App() {
  return (
    <NetworkProvider>
      <CanvasProvider>
        <Shell />
      </CanvasProvider>
    </NetworkProvider>
  );
}