const StageLayering = require('./stage-layering');

const ancestors = name => {
    const parts = String(name).split('//');
    if (parts.length < 2 || parts.slice(0, -1).some(part => !part || part.endsWith('/'))) return [];
    return parts.slice(0, -1).map((part, index) => parts.slice(0, index + 1).join('//'));
};
const within = (path, parent) => path === parent || path.startsWith(`${parent}//`);

/** Project-owned container metadata. Folder membership continues to use sprite names. */
class SpriteContainers {
    constructor (runtime) {
        this.runtime = runtime;
        this.definitions = new Map();
        this.depth = 0;
        this.syncing = false;
        this.active = false;
    }

    get (path) {
        const value = this.definitions.get(path);
        return value ? {path, visible: value.visible} : null;
    }

    serialize () {
        const folders = new Set(this.runtime.targets.filter(target => target.isOriginal && !target.isStage)
            .reduce((paths, target) => paths.concat(ancestors(target.getName())), []));
        return Array.from(this.definitions.keys()).filter(path => folders.has(path))
            .map(path => this.get(path));
    }

    load (data) {
        this.definitions.clear();
        if (Array.isArray(data)) {
            for (const entry of data) {
                if (!entry || typeof entry.path !== 'string' || !entry.path ||
                    !ancestors(`${entry.path}//_`).includes(entry.path)) continue;
                this.definitions.set(entry.path, {visible: entry.visible !== false});
            }
        }
    }

    set (path, enabled) {
        if (!this.runtime.targets.some(target => target.isOriginal && !target.isStage &&
            ancestors(target.getName()).includes(path))) return false;
        if (enabled) {
            const renderer = this.runtime.renderer;
            if (renderer && !renderer.setDrawableContainerPaths) {
                throw new Error('Containers require a renderer with container ordering support');
            }
            if (!this.definitions.has(path)) this.definitions.set(path, {visible: true});
        } else this.definitions.delete(path);
        this.sync();
        return true;
    }

    setVisible (path, visible) {
        const container = this.definitions.get(path);
        if (!container) return false;
        container.visible = Boolean(visible);
        this.sync();
        return true;
    }

    setOrder (path, order, relative = false) {
        if (!this.definitions.has(path)) return false;
        const renderer = this.runtime.renderer;
        if (renderer && renderer.setDrawableContainerOrder) {
            renderer.setDrawableContainerOrder(path, order, StageLayering.SPRITE_LAYER, relative);
            this.refreshExecutableOrder();
            this.runtime.requestRedraw();
        }
        return true;
    }

    // Scratch uses layer order for execution order too. A constrained layer
    // request must not move a child past its container in the execution list.
    refreshExecutableOrder () {
        const renderer = this.runtime.renderer;
        if (!this.definitions.size || !renderer || !renderer.getDrawableOrder) return;
        this.runtime.executableTargets.sort((a, b) =>
            renderer.getDrawableOrder(a.drawableID) - renderer.getDrawableOrder(b.drawableID));
    }

    beginUpdate () {
        this.depth++;
    }

    endUpdate () {
        this.depth = Math.max(0, this.depth - 1);
        if (!this.depth) this.sync();
    }

    // Rename/reparent an entire folder atomically with its sprite-name changes.
    // Dissolving drops that container but preserves nested container definitions.
    move (source, destination, dissolve = false) {
        const next = new Map();
        for (const [path, value] of this.definitions) {
            if (!within(path, source)) next.set(path, value);
        }
        for (const [path, value] of this.definitions) {
            if (!within(path, source) || (dissolve && path === source)) continue;
            const suffix = path.slice(source.length);
            const renamed = destination ? destination + suffix : suffix.slice(2);
            if (renamed && !next.has(renamed)) next.set(renamed, value);
        }
        this.definitions = next;
    }

    sync (extraTarget) {
        if (this.depth || this.syncing || (!this.definitions.size && !this.active)) return;
        this.active = this.definitions.size > 0;
        this.syncing = true;
        try {
            const targets = this.runtime.targets.slice();
            if (extraTarget && !targets.includes(extraTarget)) targets.push(extraTarget);
            const memberships = [];
            for (const target of targets) {
                if (target.isStage || !target.getDrawableIDs) continue;
                const containers = ancestors(target.getName()).filter(path => this.definitions.has(path));
                const visible = containers.every(path => this.definitions.get(path).visible);
                if (target._containerVisible !== visible) {
                    target._containerVisible = visible;
                    target.updateContainerVisibility();
                }
                const drawables = target.getDrawableIDs();
                const bubble = target.getCustomState('Scratch.looks');
                if (bubble && bubble.drawableId !== null) drawables.push(bubble.drawableId);
                memberships.push({containers, drawables});
            }
            const renderer = this.runtime.renderer;
            if (renderer && renderer.setDrawableContainerPaths) {
                renderer.setDrawableContainerPaths(StageLayering.SPRITE_LAYER, memberships);
                this.refreshExecutableOrder();
            }
            this.runtime.requestRedraw();
        } finally {
            this.syncing = false;
        }
    }
}

module.exports = SpriteContainers;
