import { Laptop, LoaderCircle, Unlink, Check, Link, LockKeyhole } from 'lucide-react';
import { useNetwork } from '../src/context/NetworkContext';

export default function PeersList({ onConnect }) {
  const { engine, myRole, peers, hostClients, connectedPeerIds, connectingPeerId, activeHostId } = useNetwork();
  const targetRole = myRole === 'host' ? 'client' : 'host';
  const visiblePeers = peers.filter((peer) => peer.role === targetRole);

  if (!visiblePeers.length && !(myRole === 'client' && hostClients.length)) {
    return (
      <div id="peersList" className="space-y-2 max-h-48 overflow-y-auto">
        <div className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
          {myRole === 'host' ? 'No clients found nearby' : 'No Puffle Hosts found nearby'}
        </div>
      </div>
    );
  }

  return (
    <div id="peersList" className="space-y-2 max-h-48 overflow-y-auto">
      {visiblePeers.map((peer) => {
        const isConnected = connectedPeerIds.includes(peer.id);
        const isConnecting = connectingPeerId === peer.id && !isConnected;
        const canConnect =
          myRole === 'client' && peer.role === 'host' && !isConnected && !isConnecting &&
          !connectingPeerId && (!activeHostId || activeHostId === peer.id);
        const via = (peer.transport === 'wan' ? 'WAN' : 'LAN') + (peer.role === 'host' ? ' · 🔒' : '');
        const status = isConnected ? 'Connected' : isConnecting ? 'Connecting...' : myRole === 'host' ? 'Waiting for connection' : 'Host available';

        return (
          <div
            key={peer.id}
            className={`peer-item flex items-center justify-between p-2.5 rounded-md border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 ${isConnected ? 'connected' : ''}`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-pink-500/15 flex items-center justify-center shrink-0">
                <Laptop className="w-4 h-4 text-pink-500" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{peer.name}</div>
                <div className="text-[10px] text-slate-400">{status} · {via}</div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isConnecting ? (
                <div className="w-7 h-7 rounded-full bg-pink-500/10 flex items-center justify-center" title="Connecting">
                  <LoaderCircle className="w-4 h-4 text-pink-500 animate-spin" />
                </div>
              ) : isConnected && myRole === 'client' ? (
                <button
                  className="disconnect-btn w-7 h-7 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all"
                  title="Disconnect from host"
                  onClick={(e) => { e.stopPropagation(); engine.disconnectFromHost(peer.id); }}
                >
                  <Unlink className="w-3.5 h-3.5" />
                </button>
              ) : isConnected || myRole === 'host' ? (
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center" title="Connected">
                  {isConnected ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Laptop className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
              ) : canConnect ? (
                <button
                  className="connect-btn w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center hover:bg-pink-500 hover:text-white transition-all"
                  title="Connect"
                  onClick={(e) => { e.stopPropagation(); onConnect(peer.id); }}
                >
                  <Link className="w-3.5 h-3.5" />
                </button>
              ) : (
                <div className="w-7 h-7 rounded-full bg-slate-200/60 dark:bg-slate-700/60 flex items-center justify-center" title="Connected to a different host">
                  <LockKeyhole className="w-3.5 h-3.5 text-slate-400" />
                </div>
              )}
            </div>
          </div>
        );
      })}

      {myRole === 'client' &&
        hostClients.map((client) => (
          <div key={client.id} className="peer-item flex items-center justify-between p-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Laptop className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{client.name}</div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400">Connected via host</div>
              </div>
            </div>
          </div>
        ))}
    </div>
  );
}