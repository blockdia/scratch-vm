const Cast = require('../util/cast');
const ContainerOption = require('../util/container-option');

const SPRITE_PREFIX = '@sprite:';
const CLONE_PREFIX = '@clone:';

/** Public references: originals follow their full names; automatic clone IDs last for one project session. */
class TargetReferences {
    constructor () {
        this.reset();
    }

    reset () {
        this.nextCloneId = 1;
        this.targets = new Map();
        this.active = new Set();
    }

    static isReference (value) {
        return typeof value === 'string' && (value.startsWith(SPRITE_PREFIX) || value.startsWith(CLONE_PREFIX) ||
            ContainerOption.isReference(value));
    }

    register (target, requestedId = '') {
        if (!target.isOriginal && this.targets.get(target.publicId) === target) return true;
        let reference;
        if (target.isStage) {
            reference = '_stage_';
        } else if (target.isOriginal) {
            reference = SPRITE_PREFIX + target.getName();
        } else {
            let id = Cast.toString(requestedId);
            // Invalid suffixes fall back to automatic IDs; occupied valid IDs still fail below.
            if (id.trim() !== id || /^\d+$/.test(id) || TargetReferences.isReference(id)) id = '';
            reference = CLONE_PREFIX + (id || this.nextCloneId++);
        }
        if (this.targets.has(reference) && this.targets.get(reference) !== target) return false;
        // Reindex renamed originals without retaining aliases or changing clone identities.
        if (this.targets.get(target.publicId) === target) this.targets.delete(target.publicId);
        target.publicId = reference;
        this.targets.set(reference, target);
        return true;
    }

    activate (target) {
        if (target.publicId && this.targets.get(target.publicId) === target) this.active.add(target);
    }

    get (reference) {
        const target = this.targets.get(reference);
        return this.active.has(target) ? target : null;
    }

    release (target) {
        if (this.targets.get(target.publicId) === target) this.targets.delete(target.publicId);
        this.active.delete(target);
    }
}

module.exports = TargetReferences;
