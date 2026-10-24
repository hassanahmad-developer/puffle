import { X, Laptop, Trash2 } from 'lucide-react';
import { useNetwork } from '../context/NetworkContext';
import { useCanvas } from '../context/CanvasContext';
import { askPassword } from '../lib/passwordPrompt';
import { showToast } from '../lib/Toast';
import PeersList from '../PeersList';
import NetworkMap from './NetworkMap';

const SHORTCUTS = [
  ['Pan Tool', 'H'],
  ['Select Tool', 'V'],
  ['Text Tool', 'T'],
  ['Dark Mode', 'D'],
  ['Reset View', 'R'],
  ['Delete Selection', 'Del'],
];

const MODE_BTN = 'mt-3 w-full py-2 px-3 rounded-md bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 hover:border-pink-300 dark:hover:border-pink-500/50 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors';

export default function Sidebar({ open, onClose }) {
  const { engine, myName, myRole, peers, lanAvailable } = useNetwork();
  const { view, cards, clearAll } = useCanvas();

  const toggleMode = async () => {
    if (Object.keys(engine.peerConnections).length) {
      showToast('Disconnect from the current host/clients before changing network mode.', 'error');
      return;
    }
    const nextRole = myRole === 'host' ? 'client' : 'host';
    let password = null;
    // Host banne se pehle password set karna zaroori hai
    if (nextRole === 'host') {
      password = await askPassword({
        title: 'Set host password',
        message: 'Clients must enter this password to connect, on both LAN and WAN. It is kept only in memory and is never uploaded.',
        confirm: true,
        submitLabel: 'Start Host',
      });
      if (!password) return;
    }
    await engine.setRole(nextRole, password);
  };

  const changePassword = async () => {
    if (myRole !== 'host') return;
    const password = await askPassword({
      title: 'Change host password',
      message: 'New devices will need the new password. Devices that are already connected stay connected.',
      confirm: true,
      submitLabel: 'Update password',
    });
    if (password) engine.changePassword(password);
  };

  const connect = async (peerId) => {
    const error = engine.validateConnect(peerId);
    if (error) {
      if (error !== 'busy') showToast(error, 'error');
      return;
    }
    const peer = peers.find((p) => p.id === peerId);
    const password = await askPassword({
      title: `Connect to ${peer.name}`,
      message: 'Enter the host password to join this workspace.',
      submitLabel: 'Connect',
    });
    if (password) engine.connectToPeer(peerId, password);
  };

  return (
    <div
      id="sidebarDrawer"
      className={`sidebar-drawer ${open ? '' : 'closed'} fixed top-0 right-0 h-full w-80 bg-white/95 dark:bg-slate-950/95 backdrop-blur-2xl border-l border-slate-200/80 dark:border-slate-800 shadow-md z-50 flex flex-col justify-between p-5 overflow-y-auto`}
    >
      <div>
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span>
              <span className="block text-sm font-extrabold tracking-wide text-slate-800 dark:text-white">Puffle</span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-500">Shared workspace</span>
            </span>
          </div>
          <button
            className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-all"
            title="Close sidebar"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nearby Devices */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="sidebar-section-title">Nearby devices</h4>
            <span className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              {lanAvailable ? 'LAN + WAN' : 'WAN'}
            </span>
          </div>

          <div className="mb-3 rounded-md border border-slate-200/70 dark:border-slate-700/70 bg-slate-50/80 dark:bg-slate-900/65 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div id="myDeviceName" className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{myName}</div>
                <div id="networkModeText" className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {myRole === 'host'
                    ? 'Host mode: password protected, clients connect through this device'
                    : 'Client mode: connect to one Puffle Host'}
                </div>
              </div>
              <span className="w-8 h-8 rounded-md bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center text-pink-500 shrink-0">
                <Laptop className="w-4 h-4" />
              </span>
            </div>
            <button className={MODE_BTN} onClick={toggleMode}>
              {myRole === 'host' ? 'Switch to Client' : 'Switch to Host'}
            </button>
            {myRole === 'host' && (
              <button className={MODE_BTN.replace('mt-3', 'mt-2')} onClick={changePassword}>Change password</button>
            )}
          </div>

          <PeersList onConnect={connect} />
        </div>

        {/* Shortcuts */}
        <div className="mb-5">
          <h4 className="sidebar-section-title mb-2.5">Keyboard shortcuts</h4>
          <div id="sidebarShortcuts" className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            {SHORTCUTS.map(([label, key]) => (
              <div key={key} className="flex items-center justify-between p-2 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                <span className="text-slate-600 dark:text-slate-300 font-sans">{label}</span>
                <kbd className="px-2 py-0.5 bg-white dark:bg-slate-900 rounded font-bold text-pink-500 border border-slate-200 dark:border-slate-700">{key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6">
          <h4 className="sidebar-section-title mb-2.5">Canvas overview</h4>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-slate-50 dark:bg-slate-900/65 border border-slate-200/60 dark:border-slate-800 rounded-md flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Items</span>
              <span className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mt-1">{cards.length}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900/65 border border-slate-200/60 dark:border-slate-800 rounded-md flex flex-col">
              <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">Zoom</span>
              <span className="text-lg font-extrabold text-pink-500 mt-1">{Math.round(view.scale * 100)}%</span>
            </div>
          </div>
        </div>

        <NetworkMap />
      </div>

      <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800">
        <button
          className="w-full py-2.5 px-4 border border-red-500/15 bg-red-500/5 hover:bg-red-500/10 text-red-500 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-2"
          onClick={clearAll}
        >
          <Trash2 className="w-4 h-4" /> Clear All Canvas
        </button>
      </div>
    </div>
  );
}