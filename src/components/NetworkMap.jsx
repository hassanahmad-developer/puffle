import { useLayoutEffect, useRef, useState } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';
import { useNetwork } from '../context/NetworkContext';

export default function NetworkMap() {
  const { myRole, myName, peers, activeHostId, isHostConnected, onlineClients } = useNetwork();
  const boxRef = useRef(null);
  const [width, setWidth] = useState(268);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const update = () => setWidth(el.clientWidth || 268);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const connectedClients = onlineClients;
  const hostPeer = peers.find((peer) => peer.id === activeHostId);
  const hostName = myRole === 'host' ? myName : hostPeer ? hostPeer.name : 'Puffle Host';
  const onlineCount = connectedClients.length + (isHostConnected ? 1 : 0);

  const height = connectedClients.length ? Math.max(150, connectedClients.length * 48 + 60) : 108;
  const root = hierarchy({
    name: hostName,
    role: myRole === 'host' ? 'PUFFLE HOST' : 'HOST',
    children: connectedClients.map((client) => ({ name: client.name, role: 'CLIENT' })),
  });
  const layout = tree().size([height - 48, width - 120])(root);
  const nodes = layout.descendants();
  const hostPoint = { x: 34, y: connectedClients.length ? height / 2 : 30 };
  const clientPoints = nodes
    .filter((node) => node.depth > 0)
    .map((node) => ({ node, x: width - 126, y: node.x + 24 }));
  const trunkX = 82;

  return (
    <section className="mt-6 pt-5 border-t border-slate-200/70 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h4 className="sidebar-section-title">Network map</h4>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">Connected through your host</p>
        </div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          {onlineCount} online
        </span>
      </div>

      <div ref={boxRef} id="networkTree" className="network-tree" aria-live="polite">
        <svg height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Host and connected clients">
          {clientPoints.length > 0 && (
            <>
              <path
                className="network-tree-link"
                d={`M${hostPoint.x + 10},${hostPoint.y} H${trunkX} M${trunkX},${clientPoints[0].y} V${clientPoints[clientPoints.length - 1].y}`}
              />
              {clientPoints.map(({ y }, i) => (
                <path key={i} className="network-tree-link" d={`M${trunkX},${y} H${width - 136}`} />
              ))}
            </>
          )}

          {nodes.map((node, i) => {
            const isHost = node.depth === 0;
            const point = isHost ? hostPoint : clientPoints.find((c) => c.node === node);
            const label = String(node.data.name || 'Puffle device');
            const shortLabel = label.length > 15 ? `${label.slice(0, 13)}…` : label;
            const fill = isHost ? (isHostConnected ? '#ec4899' : '#94a3b8') : '#10b981';
            return (
              <g key={i} transform={`translate(${point.x},${point.y})`}>
                <title>{label}</title>
                <circle r={isHost ? 12 : 9} fill={fill} fillOpacity={isHost ? 0.14 : 0.12} />
                <circle r={isHost ? 7 : 5} fill={fill} />
                <circle cx={isHost ? 5 : 4} cy={isHost ? -5 : -4} r="2" fill={isHost ? '#f9a8d4' : '#6ee7b7'} />
                <text className="network-tree-node-label" textAnchor="start" x="15" y="-2">{shortLabel}</text>
                <text className="network-tree-node-role" textAnchor="start" x="15" y="12">{node.data.role}</text>
              </g>
            );
          })}

          {!connectedClients.length && (
            <text className="network-tree-node-role" textAnchor="middle" x={width / 2} y="82">
              {isHostConnected ? 'WAITING FOR CLIENTS' : 'CONNECT TO A HOST TO START'}
            </text>
          )}
        </svg>
      </div>
    </section>
  );
}