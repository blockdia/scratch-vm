const StageLayering = require('./stage-layering');
const uid = require('../util/uid');
const CloneOption = require('../util/container-clone-option');
const Transform = require('../util/container-transform');

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
        // Runtime-only container instances. Their IDs never enter project metadata.
        this.cloneDefinitions = new Map();
        this.depth = 0;
        this.syncing = false;
        this.active = false;
    }

    get (path) {
        const value = this.definitions.get(path) || this.cloneDefinitions.get(path);
        return value ? {path,
            visible: value.visible,
            ...(value.transform ? {transform: {...value.transform}} : {})} : null;
    }

    serialize () {
        const folders = new Set(this.runtime.targets.filter(target => target.isOriginal && !target.isStage)
            .reduce((paths, target) => paths.concat(ancestors(target.getName())), []));
        return Array.from(this.definitions.keys()).filter(path => folders.has(path))
            .map(path => this.get(path));
    }

    load (data) {
        this.definitions.clear();
        this.cloneDefinitions.clear();
        if (Array.isArray(data)) {
            for (const entry of data) {
                if (!entry || typeof entry.path !== 'string' || !entry.path ||
                    !ancestors(`${entry.path}//_`).includes(entry.path)) continue;
                this.definitions.set(entry.path, {visible: entry.visible !== false,
                    transform: Transform.normalize(entry.transform)});
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
        const container = this.definitions.get(path) || this.cloneDefinitions.get(path);
        if (!container) return false;
        container.visible = Boolean(visible);
        this.sync();
        return true;
    }

    setTransform (path, patch) {
        const container = this.definitions.get(path) || this.cloneDefinitions.get(path);
        if (!container || !patch || typeof patch !== 'object' ||
            Object.keys(patch).some(key => !Object.prototype.hasOwnProperty.call(Transform.defaults, key) ||
                !Transform.valid(key, patch[key]))) return false;
        const transform = Transform.normalize({...Transform.defaults, ...container.transform, ...patch});
        if (transform && this.runtime.renderer && !this.runtime.renderer.updateDrawableParentTransform) {
            throw new Error('Container transforms require a renderer with parent transform support');
        }
        container.transform = transform;
        this.sync();
        return true;
    }

    setOrder (path, order, relative = false) {
        if (!this.definitions.has(path) && !this.cloneDefinitions.has(path)) return false;
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
        if ((!this.definitions.size && !this.cloneDefinitions.size) || !renderer || !renderer.getDrawableOrder) return;
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

    getContainingContainer (target) {
        const containers = target ? this.getTargetContainers(target) : [];
        return containers.length ? containers[containers.length - 1] : null;
    }

    getCloneMenu (target) {
        const current = this.getContainingContainer(target);
        const named = this.serialize().filter(({path}) => !current || path !== current.path)
            .map(({path}) => [path, CloneOption.encode(path)]);
        // null is a localized relative selection, analogous to Scratch's "myself".
        return current ? [[null, CloneOption.SELF]].concat(named) : named;
    }

    // The same membership drives rendering, visibility and the editor's layer tree.
    getTargetContainers (target) {
        if (target.isStage) return [];
        return (target._containerClonePaths || ancestors(target.getName())).map(id => {
            const instance = this.cloneDefinitions.get(id);
            const definition = instance || this.definitions.get(id);
            return definition ? {id,
                path: instance ? instance.path : id,
                visible: definition.visible,
                ...(definition.transform ? {transform: {...definition.transform}} : {}),
                isClone: Boolean(instance)} : null;
        }).filter(Boolean);
    }

    /** Snapshot every live member of the selected container, including existing clones and nested instances. */
    createClone (path) {
        if (!this.definitions.has(path) && !this.cloneDefinitions.has(path)) return [];
        const runtime = this.runtime;
        const sources = runtime.targets.filter(target => !target.isStage &&
            this.getTargetContainers(target).some(container => container.id === path));
        if (!sources.length || !runtime.clonesAvailable(sources.length)) return [];
        const renderer = runtime.renderer;
        if (renderer) sources.sort((a, b) => a.getLayerOrder() - b.getLayerOrder());
        const instances = new Map();
        const clones = [];
        this.beginUpdate();
        try {
            for (const source of sources) {
                const membership = this.getTargetContainers(source);
                const root = membership.findIndex(container => container.id === path);
                const paths = membership.map((container, index) => {
                    if (index < root) return container.id;
                    if (!instances.has(container.id)) {
                        const id = `_container_clone_:${uid()}`;
                        instances.set(container.id, id);
                        this.cloneDefinitions.set(id, {path: container.path,
                            visible: container.visible,
                            transform: container.transform ? {...container.transform} : null});
                    }
                    return instances.get(container.id);
                });
                const clone = source.makeClone({containerPaths: paths, startHats: false});
                if (!clone) {
                    clones.forEach(target => runtime.disposeTarget(target));
                    return [];
                }
                clones.push(clone);
                runtime.addTarget(clone);
            }
        } catch (error) {
            clones.forEach(target => runtime.disposeTarget(target));
            throw error;
        } finally {
            this.endUpdate();
        }
        // New instances are siblings of the source container, immediately behind it.
        if (renderer) {
            const order = Math.min(...runtime.targets.filter(target =>
                this.getTargetContainers(target).some(container => container.id === path))
                .map(target => target.getLayerOrder()));
            this.setOrder(instances.get(path), order === 0 ? -Infinity : order);
        }
        // Hats must see every member, its copied state and its final membership.
        clones.forEach(target => runtime.startHats('control_start_as_clone', null, target));
        return clones;
    }

    // Rename/reparent an entire folder atomically with its sprite-name changes.
    // Dissolving drops that container but preserves nested container definitions.
    move (source, destination, dissolve = false) {
        const next = new Map();
        const renamedPaths = new Map();
        for (const [path, value] of this.definitions) {
            if (!within(path, source)) next.set(path, value);
        }
        for (const [path, value] of this.definitions) {
            if (!within(path, source) || (dissolve && path === source)) continue;
            const suffix = path.slice(source.length);
            const renamed = destination ? destination + suffix : suffix.slice(2);
            if (renamed) {
                if (!next.has(renamed)) next.set(renamed, value);
                renamedPaths.set(path, renamed);
            }
        }
        this.definitions = next;
        const blocks = new Set(this.runtime.targets.map(target => target.blocks));
        for (const blockContainer of blocks) {
            blockContainer.updateContainerReferences(renamedPaths);
        }
        for (const target of this.runtime.targets) {
            if (target._containerClonePaths) {
                target._containerClonePaths = target._containerClonePaths
                    .filter(path => !dissolve || path !== source)
                    .map(path => renamedPaths.get(path) || path);
            }
        }
        for (const value of this.cloneDefinitions.values()) {
            if (within(value.path, source) && !(dissolve && value.path === source)) {
                const suffix = value.path.slice(source.length);
                value.path = destination ? destination + suffix : suffix.slice(2);
            }
        }
    }

    sync (extraTarget) {
        if (this.depth || this.syncing ||
            (!this.definitions.size && !this.cloneDefinitions.size && !this.active)) return;
        this.active = this.definitions.size > 0 || this.cloneDefinitions.size > 0;
        this.syncing = true;
        try {
            const targets = this.runtime.targets.slice();
            if (extraTarget && !targets.includes(extraTarget)) targets.push(extraTarget);
            const memberships = [];
            const used = new Set();
            for (const target of targets) {
                if (target.isStage || !target.getDrawableIDs) continue;
                const definitions = this.getTargetContainers(target);
                const containers = definitions.map(container => container.id);
                containers.forEach(id => used.add(id));
                const visible = definitions.every(container => container.visible);
                if (target._containerVisible !== visible) {
                    target._containerVisible = visible;
                    target.updateContainerVisibility();
                }
                const drawables = target.getDrawableIDs();
                const matrix = definitions.reduce((parent, container) =>
                    Transform.multiply(parent, Transform.matrix(container.transform)), Transform.identity);
                const changed = !target._containerTransform || matrix.some((n, i) =>
                    n !== target._containerTransform[i]);
                target._containerTransform = matrix;
                const renderer = this.runtime.renderer;
                if (renderer && renderer.updateDrawableParentTransform) {
                    drawables.forEach(id => renderer.updateDrawableParentTransform(id, matrix));
                }
                // Bubbles use world bounds and stay upright at their normal size.
                if (changed) target.emitVisualChange();
                const bubble = target.getCustomState('Scratch.looks');
                if (bubble && bubble.drawableId !== null) drawables.push(bubble.drawableId);
                memberships.push({containers, drawables});
            }
            for (const id of this.cloneDefinitions.keys()) {
                if (!used.has(id)) this.cloneDefinitions.delete(id);
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
