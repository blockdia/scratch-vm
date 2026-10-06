const MAX_ENTRIES = 1000;
const MAX_TEXT_LENGTH = 4096;
const NOTIFY_INTERVAL = 50;

// Keep records serializable and bounded, without retaining arbitrary caller objects.
const text = value => (value === null || typeof value === 'undefined' ? '' : String(value))
    .slice(0, MAX_TEXT_LENGTH);
const contextFields = ['source', 'code', 'targetId', 'blockId', 'originalTargetId', 'targetName', 'publicId',
    'subjectName', 'limit'];

/** Project diagnostics, independent of the editor and developer-console logging. */
class RuntimeLogger {
    constructor (runtime) {
        this.runtime = runtime;
        this.enabled = true;
        this._entries = [];
        this._listeners = new Set();
        this._timer = null;
        this._nextId = 1;
    }

    /** Capture now: a thread's stack and target may change before an asynchronous operation finishes. */
    captureContext (thread) {
        return this._targetContext(thread && thread.target, thread && thread.peekStack());
    }

    _targetContext (target, blockId) {
        if (!target) return {blockId: text(blockId)};
        const original = target.isOriginal ? target : target.sprite.clones.find(member => member.isOriginal);
        return {
            targetId: text(target.id),
            blockId: text(blockId),
            originalTargetId: text(original && original.id),
            targetName: text(target.getName()),
            publicId: text(target.publicId),
            isClone: !target.isOriginal && !target.isStage
        };
    }

    log (message, context) {
        this._write('log', message, context);
    }

    info (message, context) {
        this._write('info', message, context);
    }

    warn (message, context) {
        this._write('warn', message, context);
    }

    error (message, context) {
        this._write('error', message, context);
    }

    _write (level, message, context = {}) {
        if (!this.enabled) return;
        // Diagnostics (including a caller's string conversion) must never interrupt project execution.
        try {
            const snapshot = {...this._targetContext(this.runtime.getTargetById(context.targetId)), ...context};
            const entry = {level, message: text(message), isClone: snapshot.isClone === true};
            for (const field of contextFields) entry[field] = text(snapshot[field]);
            const previous = this._entries[this._entries.length - 1];
            const now = Date.now();
            if (previous && Object.keys(entry).every(key => entry[key] === previous[key])) {
                this._entries[this._entries.length - 1] = Object.freeze({
                    ...previous, count: previous.count + 1, lastTimestamp: now
                });
            } else {
                this._entries.push(Object.freeze({
                    ...entry, id: this._nextId++, count: 1, timestamp: now, lastTimestamp: now
                }));
                if (this._entries.length > MAX_ENTRIES) this._entries.shift();
            }
            this._scheduleNotify();
        } catch (e) {
            // Do not let a diagnostic become a second project error.
        }
    }

    /** Immutable entries in a new array; subscribers cannot mutate the stored history. */
    getEntries () {
        return this._entries.slice();
    }

    /** Changes are coalesced to at most 20 notifications/second. Read getEntries() for initial history. */
    subscribe (listener) {
        this._listeners.add(listener);
        return () => {
            this._listeners.delete(listener);
            if (!this._listeners.size) this._cancelNotify();
        };
    }

    _scheduleNotify () {
        if (this._timer !== null || !this._listeners.size) return;
        this._timer = setTimeout(() => {
            this._timer = null;
            this._notify();
        }, NOTIFY_INTERVAL);
        if (this._timer.unref) this._timer.unref();
    }

    _cancelNotify () {
        clearTimeout(this._timer);
        this._timer = null;
    }

    _notify () {
        const entries = Object.freeze(this.getEntries());
        for (const listener of this._listeners) {
            try {
                listener(entries);
            } catch (e) {
                // A broken consumer must not affect the VM or other consumers.
            }
        }
    }

    clear () {
        this._cancelNotify();
        this._entries = [];
        this._notify();
    }

    flush () {
        this._cancelNotify();
        this._notify();
    }

    setEnabled (enabled) {
        this.enabled = Boolean(enabled);
    }

    dispose () {
        this.enabled = false;
        this._cancelNotify();
        this._entries = [];
        this._listeners.clear();
    }
}

module.exports = RuntimeLogger;
