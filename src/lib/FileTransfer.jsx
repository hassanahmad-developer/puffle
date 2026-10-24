import { FILE_CHUNK_SIZE, MAX_BUFFERED_AMOUNT } from '../config/constats';
import { uid } from './utils';
import { xferStart, xferProgress, xferFinish, xferRemove } from './XFerstore';

/**
 * Chunked file send/receive (original packet format same):
 *   [1 byte idLength][transferId bytes][chunk bytes]
 *
 * hooks = {
 *   getCardPosition(id) -> { x, y },
 *   hasCard(id) -> boolean,
 *   onLegacyFile(file, fileId),
 *   onSingle(x, y, file, cardId),
 *   onMulti(x, y, files, cardId),
 * }
 */
export class FileTransfer {
  constructor(engine, hooks) {
    this.engine = engine;
    this.hooks = hooks;
    this.incoming = {};
    this.groups = {};
    this.sendChain = Promise.resolve();
  }

  // ---------- sending ----------
  sendFile(peerId, file, extra = {}) {
    this.sendChain = this.sendChain
      .then(() => this.doSendFile(peerId, file, extra))
      .catch((e) => console.error('sendFile error', e));
    return this.sendChain;
  }

  async doSendFile(peerId, file, extraArg) {
    const channel = this.engine.getChannel(peerId);
    if (!channel || channel.readyState !== 'open') return;

    const extra = typeof extraArg === 'function' ? extraArg() : extraArg;
    const transferId = uid();

    channel.send(
      JSON.stringify({
        type: 'file-meta',
        transferId,
        fileId: transferId,
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        ...extra,
      })
    );

    xferStart('send', peerId, this.engine.peerNameOf(peerId), file.name, file.size, extra && extra.index, extra && extra.total);

    const transferBytes = new TextEncoder().encode(transferId);
    let offset = 0;

    while (offset < file.size) {
      if (channel.readyState !== 'open') {
        xferFinish('send', peerId, false);
        return;
      }
      // backpressure: buffer bhar jaye to intezar karo
      while (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        if (channel.readyState !== 'open') {
          xferFinish('send', peerId, false);
          return;
        }
        await new Promise((r) => setTimeout(r, 10));
      }
      const buffer = await file.slice(offset, offset + FILE_CHUNK_SIZE).arrayBuffer();
      const packet = new Uint8Array(1 + transferBytes.length + buffer.byteLength);
      packet[0] = transferBytes.length;
      packet.set(transferBytes, 1);
      packet.set(new Uint8Array(buffer), 1 + transferBytes.length);
      channel.send(packet.buffer);
      offset += buffer.byteLength;
      xferProgress('send', peerId, Math.min(offset, file.size));
    }

    channel.send(JSON.stringify({ type: 'file-end', transferId, name: file.name }));
    xferFinish('send', peerId, true);
  }

  sendCardFiles(id, files, targets) {
    if (!files || !files.length) return;
    const peerIds = targets || this.engine.openPeerIds();
    const total = files.length;
    peerIds.forEach((pid) => {
      files.forEach((f, i) => {
        this.sendFile(pid, f, () => {
          const pos = this.hooks.getCardPosition(id);
          return { cardId: id, x: pos.x, y: pos.y, index: i, total };
        });
      });
    });
  }

  // ---------- receiving ----------
  handleMeta(sourceId, msg, peerId) {
    this.incoming[msg.transferId] = { meta: msg, chunks: [], received: 0, peerId, ownerId: sourceId };
    xferStart('recv', sourceId, this.engine.peerNameOf(sourceId), msg.name, msg.size, msg.index, msg.total);
  }

  handleEnd(msg) {
    this.finishIncoming(msg.transferId);
  }

  handleBinary(peerId, data) {
    const bytes = new Uint8Array(data);
    const idLength = bytes[0];
    const transferId = new TextDecoder().decode(bytes.subarray(1, idLength + 1));
    const entry = this.incoming[transferId];
    if (!entry) return;
    const chunk = bytes.slice(idLength + 1);
    entry.chunks.push(chunk);
    entry.received += chunk.byteLength;
    xferProgress('recv', entry.ownerId, entry.received);
  }

  peerClosed(peerId) {
    Object.keys(this.incoming).forEach((transferId) => {
      if (this.incoming[transferId].peerId === peerId) {
        xferRemove('recv:' + this.incoming[transferId].ownerId);
        delete this.incoming[transferId];
      }
    });
    xferRemove('send:' + peerId);
    xferRemove('recv:' + peerId);
  }

  finishIncoming(transferId) {
    const entry = this.incoming[transferId];
    if (!entry) return;
    delete this.incoming[transferId];

    xferFinish('recv', entry.ownerId, true);

    const meta = entry.meta;
    const file = new File([new Blob(entry.chunks, { type: meta.mime })], meta.name, { type: meta.mime });
    const ownerId = meta.fromId || entry.peerId;

    // Purana tareeqa (koi cardId nahi): center mein card banao
    if (!meta.cardId) {
      this.hooks.onLegacyFile(file, meta.fileId);
      return;
    }
    if (this.hooks.hasCard(meta.cardId)) return; // pehle se hai

    if (meta.total > 1) {
      const key = ownerId + ':' + meta.cardId;
      const group = this.groups[key] || (this.groups[key] = { files: [], count: 0 });
      group.files[meta.index] = file;
      group.count++;
      if (group.count >= meta.total) {
        delete this.groups[key];
        this.hooks.onMulti(meta.x, meta.y, group.files, meta.cardId);
      }
    } else {
      this.hooks.onSingle(meta.x, meta.y, file, meta.cardId);
    }
  }
}