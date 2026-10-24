import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNetwork, useNetworkEvent } from './NetworkContext';
import { FileTransfer } from '../lib/fileTransfer';
import { uid } from '../lib/utils';
import { showToast } from '../lib/Toast';
import { updateRemoteCursor, hideRemoteCursor, removeRemoteCursor } from '../lib/CursorStore';
import { collectDroppedFiles, createFolderArchive } from '../lib/DropUtils';
import { MIN_SCALE, MAX_SCALE, ZOOM_STEP_BUTTON } from '../config/constats';

const CanvasContext = createContext(null);

export function useCanvas() {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used inside <CanvasProvider>');
  return ctx;
}

/*
 * card shapes:
 *  text : { id, kind:'text',  x, y, w, text, fmt, autoFocus }
 *  file : { id, kind:'file',  x, y, w:240, files:[File] }
 *  multi: { id, kind:'multi', x, y, w:320, files:[File,...] }
 *  video: { id, kind:'video', x, y, w:280, stream, streamId, remote, ownerId, name, streamKey }
 */
export function CanvasProvider({ children }) {
  const { engine } = useNetwork();

  // ---------- view (pan / zoom) ----------
  const [view, setViewState] = useState({ scale: 1, panX: 0, panY: 0 });
  const viewRef = useRef(view);
  const setView = useCallback((next) => {
    const v = typeof next === 'function' ? next(viewRef.current) : next;
    viewRef.current = v;
    setViewState(v);
  }, []);

  const [cursorMode, setCursorMode] = useState('pan');

  // ---------- cards ----------
  const [cards, setCardsState] = useState([]);
  const cardsRef = useRef([]);
  const updateCards = useCallback((fn) => {
    cardsRef.current = fn(cardsRef.current);
    setCardsState(cardsRef.current);
  }, []);

  const [selectedId, setSelectedIdState] = useState(null);
  const selectedRef = useRef(null);
  const setSelected = (id) => {
    selectedRef.current = id;
    setSelectedIdState(id);
  };

  // ---------- video call ----------
  const [callActive, setCallActive] = useState(false);
  const [isCamEnabled, setIsCamEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const localStreamRef = useRef(null);

  // Event listeners / effects hamesha latest functions yahan se lete hain
  const L = useRef({});

  // ---------- file transfer ----------
  const ftRef = useRef(null);
  if (!ftRef.current) {
    ftRef.current = new FileTransfer(engine, {
      getCardPosition: (id) => {
        const c = cardsRef.current.find((x) => x.id === id);
        return c ? { x: c.x, y: c.y } : { x: 0, y: 0 };
      },
      hasCard: (id) => cardsRef.current.some((c) => c.id === id),
      onLegacyFile: (file, id) => {
        const v = viewRef.current;
        const cx = (-v.panX + window.innerWidth / 2 - 120) / v.scale;
        const cy = (-v.panY + window.innerHeight / 2 - 80) / v.scale;
        L.current.addFileCard(cx, cy, file, { remote: true, id });
      },
      onSingle: (x, y, file, id) => L.current.addFileCard(x, y, file, { id, remote: true }),
      onMulti: (x, y, files, id) => L.current.addMultiFileCard(x, y, files, { id, remote: true }),
    });
  }
  const ft = ftRef.current;

  // ==================== card helpers ====================
  const findCard = (id) => cardsRef.current.find((c) => c.id === id);
  const patchCard = (id, patch) =>
    updateCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const broadcast = (msg) => engine.broadcast(msg);

  const selectCard = (id) => setSelected(id);
  const deselectAll = () => setSelected(null);

  function addTextCard(x, y, width = 240, opts = {}) {
    const id = opts.id || uid();
    updateCards((cs) => [
      ...cs,
      { id, kind: 'text', x, y, w: width, text: opts.text || '', fmt: opts.fmt || 'p', autoFocus: !!opts.autoFocus },
    ]);
    if (!opts.remote) engine.broadcast({ type: 'card-add', id, x, y, w: width, text: '', fmt: 'p' });
    return id;
  }

  function addFileCard(x, y, file, opts = {}) {
    const id = opts.id || uid();
    updateCards((cs) => [...cs, { id, kind: 'file', x, y, w: 240, files: [file] }]);
    if (!opts.remote) ft.sendCardFiles(id, [file]);
    return id;
  }

  function addMultiFileCard(x, y, files, opts = {}) {
    const id = opts.id || uid();
    updateCards((cs) => [...cs, { id, kind: 'multi', x, y, w: 320, files: files.slice() }]);
    if (!opts.remote) ft.sendCardFiles(id, files);
    return id;
  }

  function addVideoCard(x, y, stream, opts = {}) {
    const id = opts.id || stream.id;
    updateCards((cs) => [
      ...cs,
      {
        id,
        kind: 'video',
        x,
        y,
        w: 280,
        stream,
        streamId: stream.id,
        remote: !!opts.remote,
        ownerId: opts.ownerId,
        name: opts.name || 'Your Video Stream',
        streamKey: opts.streamKey,
      },
    ]);
    return id;
  }

  function removeCard(id, fromRemote = false) {
    const card = findCard(id);
    if (!card) return;
    updateCards((cs) => cs.filter((c) => c.id !== id));
    if (selectedRef.current === id) setSelected(null);
    // video cards sirf local hatate hain
    if (!fromRemote && card.kind !== 'video') engine.broadcast({ type: 'card-del', id });
  }

  function commitMove(id, x, y) {
    patchCard(id, { x, y });
    engine.broadcast({ type: 'card-move', id, x, y });
  }

  function commitResize(id, w) {
    patchCard(id, { w });
    engine.broadcast({ type: 'card-resize', id, w });
  }

  function setFormat(id, fmt) {
    patchCard(id, { fmt });
    engine.broadcast({ type: 'card-fmt', id, fmt });
  }

  function clearAll() {
    if (!window.confirm('Are you sure you want to clear all canvas items?')) return;
    updateCards(() => []);
    setSelected(null);
    if (localStreamRef.current) stopVideoCall();
    engine.broadcast({ type: 'clear' });
  }

  // ==================== sync (naya device judne par) ====================
  function sendSync(peerId) {
    const textCards = cardsRef.current
      .filter((c) => c.kind === 'text')
      .map((c) => ({ id: c.id, x: c.x, y: c.y, w: c.w, text: c.text, fmt: c.fmt }));
    const fileIds = cardsRef.current.filter((c) => c.kind === 'file' || c.kind === 'multi').map((c) => c.id);
    engine.sendTo(peerId, { type: 'sync', cards: textCards, fileIds });
  }

  function handleSync(peerId, msg) {
    (msg.cards || []).forEach((c) => {
      if (!findCard(c.id)) addTextCard(c.x, c.y, c.w, { id: c.id, remote: true, text: c.text, fmt: c.fmt });
    });
    const theyHave = new Set(msg.fileIds || []);
    cardsRef.current.forEach((c) => {
      if ((c.kind === 'file' || c.kind === 'multi') && !theyHave.has(c.id)) {
        ft.sendCardFiles(c.id, c.files, [peerId]);
      }
    });
  }

  // ==================== incoming app messages ====================
  function handleMessage(sourceId, msg, peerId) {
    switch (msg.type) {
      case 'file-meta':
        ft.handleMeta(sourceId, msg, peerId);
        break;
      case 'file-end':
        ft.handleEnd(msg);
        break;
      case 'cursor':
        updateRemoteCursor(sourceId, msg.x, msg.y, msg.name || engine.peerNameOf(sourceId));
        break;
      case 'cursor-leave':
        hideRemoteCursor(sourceId);
        break;
      case 'sync':
        handleSync(sourceId, msg);
        break;
      case 'card-add':
        if (!findCard(msg.id)) {
          addTextCard(msg.x, msg.y, msg.w, { id: msg.id, remote: true, text: msg.text, fmt: msg.fmt });
        }
        break;
      case 'card-move':
        if (findCard(msg.id)) patchCard(msg.id, { x: msg.x, y: msg.y });
        break;
      case 'card-resize':
        if (findCard(msg.id)) patchCard(msg.id, { w: msg.w });
        break;
      case 'card-text': {
        const input = document.querySelector(`[data-id="${CSS.escape(String(msg.id))}"] .text-input-area`);
        // jis card mein main type kar raha hoon use overwrite nahi karna
        if (findCard(msg.id) && document.activeElement !== input) patchCard(msg.id, { text: msg.text || '' });
        break;
      }
      case 'card-fmt':
        if (findCard(msg.id)) patchCard(msg.id, { fmt: msg.fmt });
        break;
      case 'card-del':
        removeCard(msg.id, true);
        break;
      case 'clear':
        updateCards((cs) => cs.filter((c) => c.kind === 'video'));
        setSelected(null);
        break;
      default:
        break;
    }
  }

  // ==================== video call ====================
  async function startVideoCall() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setIsCamEnabled(true);
      setIsMicEnabled(true);
      setCallActive(true);

      const v = viewRef.current;
      const cx = (-v.panX + window.innerWidth / 2 - 140) / v.scale;
      const cy = (-v.panY + window.innerHeight / 2 - 100) / v.scale;
      addVideoCard(cx, cy, stream, { id: stream.id });
      await engine.startCall(stream, cx, cy);
    } catch (err) {
      console.error('Could not start video call:', err);
      showToast('Camera and microphone access is required: ' + err.message, 'error', 7000);
      if (localStreamRef.current) stopVideoCall();
    }
  }

  function stopVideoCall() {
    // engine.localStream set na hua ho (error) to tracks yahan band karo
    if (localStreamRef.current && !engine.localStream) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    engine.stopCall(); // 'local-call-ended' emit karta hai -> UI reset neeche
  }

  function resetCallUI() {
    localStreamRef.current = null;
    setCallActive(false);
    setIsCamEnabled(true);
    setIsMicEnabled(true);
    updateCards((cs) => cs.filter((c) => !(c.kind === 'video' && !c.remote)));
    setSelected(null);
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !isCamEnabled;
    track.enabled = next;
    setIsCamEnabled(next);
  }

  function toggleMicrophone() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    const next = !isMicEnabled;
    track.enabled = next;
    setIsMicEnabled(next);
  }

  // ==================== zoom / view ====================
  const zoomIn = () => setView((v) => (v.scale < MAX_SCALE ? { ...v, scale: Math.min(MAX_SCALE, v.scale + ZOOM_STEP_BUTTON) } : v));
  const zoomOut = () => setView((v) => (v.scale > MIN_SCALE ? { ...v, scale: Math.max(MIN_SCALE, v.scale - ZOOM_STEP_BUTTON) } : v));
  const resetView = () => setView({ scale: 1, panX: 0, panY: 0 });
  const toggleDark = () => document.documentElement.classList.toggle('dark');

  // ==================== drop (files / folders) ====================
  async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = document.getElementById('canvas').getBoundingClientRect();
    const v = viewRef.current;
    const dropX = (e.clientX - rect.left - v.panX) / v.scale;
    const dropY = (e.clientY - rect.top - v.panY) / v.scale;

    if (!e.dataTransfer) return;
    let progressToast;
    try {
      const { files, folderPaths } = await collectDroppedFiles(e.dataTransfer);
      if (folderPaths.length) {
        progressToast = showToast('Creating a ZIP archive from the dropped folder...', 'info', 0);
        const archive = await createFolderArchive(files, folderPaths, (percent) => {
          progressToast.update(`Creating folder ZIP: ${percent}%`);
        });
        progressToast.remove();
        const hasConnection = engine.openPeerIds().length > 0;
        addFileCard(dropX, dropY, archive);
        showToast(
          hasConnection
            ? `${archive.name} is ready and sharing through the Puffle network.`
            : `${archive.name} is on your canvas. Connect to a Puffle Host to share it.`,
          hasConnection ? 'success' : 'info'
        );
        return;
      }
      if (!files.length) return;
      if (files.length === 1) addFileCard(dropX, dropY, files[0]);
      else addMultiFileCard(dropX, dropY, files);
    } catch (error) {
      if (progressToast) progressToast.remove();
      console.error('Dropped item processing failed:', error);
      showToast(`Could not process the dropped item: ${error.message}`, 'error');
    }
  }

  // ==================== keyboard ====================
  function handleKeyDown(e) {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable;
    if (isTyping) return;

    const key = e.key.toLowerCase();
    if (key === 'h') setCursorMode('pan');
    else if (key === 'v') setCursorMode('select');
    else if (key === 't') setCursorMode('text');
    else if (key === 'd') toggleDark();
    else if (key === 'r') resetView();
    else if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-' || e.key === '_') zoomOut();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const selected = findCard(selectedRef.current);
      if (!selected) return;
      if (selected.kind === 'video' && !selected.remote) stopVideoCall();
      else removeCard(selected.id);
    }
  }

  // Har render par latest functions
  L.current = {
    addFileCard,
    addMultiFileCard,
    sendSync,
    handleMessage,
    handleDrop,
    handleKeyDown,
    resetCallUI,
    deselectAll,
  };

  // ==================== engine events ====================
  useNetworkEvent('authorized', (peerId) => L.current.sendSync(peerId));
  useNetworkEvent('message', (sourceId, msg, peerId) => L.current.handleMessage(sourceId, msg, peerId));
  useNetworkEvent('binary', (peerId, data) => ft.handleBinary(peerId, data));
  useNetworkEvent('peer-closed', (peerId) => {
    removeRemoteCursor(peerId);
    ft.peerClosed(peerId);
  });
  useNetworkEvent('local-call-ended', () => L.current.resetCallUI());

  useNetworkEvent('remote-stream', ({ key, ownerId, ownerName, stream, x, y }) => {
    if (cardsRef.current.some((c) => c.kind === 'video' && c.streamKey === key)) return;
    const v = viewRef.current;
    const offset = cardsRef.current.filter((c) => c.kind === 'video' && c.remote).length * 24;
    const px = Number.isFinite(x) ? x : (-v.panX + window.innerWidth / 2 - 140 + offset) / v.scale;
    const py = Number.isFinite(y) ? y : (-v.panY + window.innerHeight / 2 - 100 + offset) / v.scale;
    addVideoCard(px, py, stream, { remote: true, ownerId, name: ownerName, streamKey: key });
    showToast(`Incoming video call from ${ownerName}.`, 'success');
  });

  useNetworkEvent('remote-stream-ended', ({ key }) => {
    updateCards((cs) => cs.filter((c) => !(c.kind === 'video' && c.streamKey === key)));
  });

  useNetworkEvent('call-owner', ({ streamId, owner }) => {
    updateCards((cs) =>
      cs.map((c) =>
        c.kind === 'video' && c.remote && c.streamId === streamId
          ? {
              ...c,
              ownerId: owner.id || c.ownerId,
              name: owner.name || c.name,
              x: Number.isFinite(owner.x) ? owner.x : c.x,
              y: Number.isFinite(owner.y) ? owner.y : c.y,
            }
          : c
      )
    );
  });

  useNetworkEvent('call-end', ({ sourceId, ownerId, streamId }) => {
    updateCards((cs) =>
      cs.filter((c) => {
        if (c.kind !== 'video' || !c.remote) return true;
        const ownerMatches = c.ownerId === sourceId || c.ownerId === ownerId;
        return !(ownerMatches && (!streamId || c.streamId === streamId));
      })
    );
  });

  // ==================== window level effects ====================
  useEffect(() => {
    // host naye client ko video card ki position batata hai
    engine.getStreamPosition = (streamId) => {
      const c = cardsRef.current.find((x) => x.kind === 'video' && x.streamId === streamId);
      return c ? { x: c.x, y: c.y } : null;
    };
  }, [engine]);

  useEffect(() => {
    // remote cursor broadcast
    let last = 0;
    const onMove = (e) => {
      const now = performance.now();
      if (now - last < 30) return;
      last = now;
      if (!engine.openPeerIds().length) return;
      const v = viewRef.current;
      engine.broadcast({
        type: 'cursor',
        x: (e.clientX - v.panX) / v.scale,
        y: (e.clientY - v.panY) / v.scale,
        name: engine.myName,
      });
    };
    const onLeave = () => engine.broadcast({ type: 'cursor-leave' });
    window.addEventListener('mousemove', onMove);
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, [engine]);

  useEffect(() => {
    const onOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDrop = (e) => L.current.handleDrop(e);
    const onKey = (e) => L.current.handleKeyDown(e);
    const onClick = (e) => {
      if (!e.target.closest('.text-card') && !e.target.closest('.file-card') && !e.target.closest('.video-card')) {
        L.current.deselectAll();
      }
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('click', onClick);
    };
  }, []);

  const value = {
    // view
    view,
    viewRef,
    setView,
    zoomIn,
    zoomOut,
    resetView,
    toggleDark,
    cursorMode,
    setCursorMode,
    // cards
    cards,
    selectedId,
    selectCard,
    deselectAll,
    addTextCard,
    patchCard,
    removeCard,
    commitMove,
    commitResize,
    setFormat,
    clearAll,
    broadcast,
    // call
    callActive,
    isCamEnabled,
    isMicEnabled,
    startVideoCall,
    stopVideoCall,
    toggleCamera,
    toggleMicrophone,
  };

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}