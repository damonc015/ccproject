import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';

// Stand-in for HocuspocusProvider. The editor binds to a real Y.Doc + Awareness,
// and a second in-memory Y.Doc plays the part of a remote collaborator, so the
// CRDT merge, remote cursor and reconnect-resync paths are the real Yjs ones.

export type ConnStatus = 'connecting' | 'connected' | 'disconnected';
export type SaveStatus = 'saved' | 'saving' | 'failed' | 'pending';

export interface PresenceUser {
  name: string;
  color: string;
  colorLight: string;
}

interface Options {
  user: PresenceUser;
  initialContent: string;
  readOnly: boolean;
  persist: (content: string) => Promise<void>;
}

const PEER: PresenceUser = { name: 'Grace', color: '#e8590c', colorLight: '#e8590c33' };
const SAVE_DEBOUNCE_MS = 800;

export class MockCollabProvider {
  readonly doc = new Y.Doc();
  readonly ytext = this.doc.getText('code');
  readonly awareness = new Awareness(this.doc);

  status: ConnStatus = 'disconnected';
  saveStatus: SaveStatus = 'saved';
  failNextSave = false;

  private peerDoc = new Y.Doc();
  private peerText = this.peerDoc.getText('code');
  private peerAwareness = new Awareness(this.peerDoc);
  private listeners = new Set<() => void>();
  private connectTimer?: ReturnType<typeof setTimeout>;
  private saveTimer?: ReturnType<typeof setTimeout>;
  private dirty = false;
  private editSeq = 0;
  private destroyed = false;

  constructor(private opts: Options) {
    this.ytext.insert(0, opts.initialContent);
    this.awareness.setLocalStateField('user', opts.user);
    this.peerAwareness.setLocalStateField('user', PEER);

    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'peer' && this.status === 'connected') Y.applyUpdate(this.peerDoc, update, 'local');
      this.dirty = true;
      this.editSeq++;
      this.scheduleSave();
    });
    this.peerDoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'local' && this.status === 'connected') Y.applyUpdate(this.doc, update, 'peer');
    });
    this.peerAwareness.on('update', () => this.pushPeerAwareness());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  connect() {
    if (this.destroyed || this.status !== 'disconnected') return;
    this.status = 'connecting';
    this.emit();
    this.connectTimer = setTimeout(() => {
      this.status = 'connected';
      // Resync both ways, exactly what a Yjs provider does after a reconnect.
      Y.applyUpdate(this.peerDoc, Y.encodeStateAsUpdate(this.doc), 'local');
      Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(this.peerDoc), 'peer');
      if (!this.peerAwareness.getLocalState()?.cursor) {
        const firstBreak = this.peerText.toString().indexOf('\n');
        this.setPeerCursor(firstBreak < 0 ? this.peerText.length : firstBreak);
      }
      this.pushPeerAwareness();
      this.emit();
      if (this.dirty) this.scheduleSave(0);
    }, 900);
  }

  disconnect() {
    if (this.status === 'disconnected') return;
    clearTimeout(this.connectTimer);
    clearTimeout(this.saveTimer);
    this.status = 'disconnected';
    removeAwarenessStates(this.awareness, [this.peerDoc.clientID], 'peer');
    if (this.dirty) this.saveStatus = 'pending';
    this.emit();
  }

  getText() {
    return this.ytext.toString();
  }

  /** Restore a version: applied as an ordinary edit so every client converges on it. */
  replaceContent(content: string) {
    this.doc.transact(() => {
      this.ytext.delete(0, this.ytext.length);
      this.ytext.insert(0, content);
    });
  }

  /** Demo only: the fake collaborator appends a comment line. */
  simulatePeerEdit() {
    const text = this.peerText.toString();
    const line = `${text.endsWith('\n') || text === '' ? '' : '\n'}# ${PEER.name}: edited at ${new Date().toLocaleTimeString()}\n`;
    this.peerText.insert(this.peerText.length, line);
    this.setPeerCursor(this.peerText.length - 1);
  }

  retrySave() {
    if (this.dirty) this.scheduleSave(0);
  }

  private setPeerCursor(index: number) {
    const pos = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(this.peerText, index));
    this.peerAwareness.setLocalStateField('cursor', { anchor: pos, head: pos });
  }

  private pushPeerAwareness() {
    if (this.destroyed || this.status !== 'connected') return;
    applyAwarenessUpdate(this.awareness, encodeAwarenessUpdate(this.peerAwareness, [this.peerDoc.clientID]), 'peer');
  }

  private scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    if (this.opts.readOnly || this.destroyed) return;
    clearTimeout(this.saveTimer);
    if (this.status !== 'connected') {
      this.saveStatus = 'pending';
      this.emit();
      return;
    }
    this.saveStatus = 'saving';
    this.emit();
    this.saveTimer = setTimeout(() => void this.save(), delay);
  }

  private async save() {
    const seq = this.editSeq;
    try {
      if (this.failNextSave) {
        this.failNextSave = false;
        await new Promise((r) => setTimeout(r, 400));
        throw new Error('simulated save failure');
      }
      await this.opts.persist(this.getText());
      if (this.destroyed || seq !== this.editSeq) return; // newer edits already queued another save
      this.dirty = false;
      this.saveStatus = 'saved';
    } catch {
      if (this.destroyed) return;
      this.saveStatus = 'failed';
    }
    this.emit();
  }

  destroy() {
    this.destroyed = true;
    clearTimeout(this.connectTimer);
    clearTimeout(this.saveTimer);
    this.listeners.clear();
    this.awareness.destroy();
    this.peerAwareness.destroy();
    this.doc.destroy();
    this.peerDoc.destroy();
  }
}
