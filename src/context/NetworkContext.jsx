import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { PuffleNetwork } from '../lib/PuffleNetwork';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const engine = useMemo(() => new PuffleNetwork(), []);

  useEffect(() => {
    engine.start();
    return () => engine.destroy();
  }, [engine]);

  // engine.notify() par re-render
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const value = useMemo(() => ({ engine, ...snapshot }), [engine, snapshot]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

// const { engine, myRole, peers, onlineClients, ... } = useNetwork();
export function useNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error('useNetwork must be used inside <NetworkProvider>');
  return ctx;
}

// useNetworkEvent('message', (sourceId, msg) => { ... })
export function useNetworkEvent(event, handler) {
  const { engine } = useNetwork();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => engine.on(event, (...args) => handlerRef.current(...args)), [engine, event]);
}