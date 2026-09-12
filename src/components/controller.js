const Model = require('./model');
const StageLayering = require('../engine/stage-layering');

class ComponentController {
    constructor (target) {
        this.target = target;
        this.group = null;
        this.parts = new Map();
        this.pressed = false;
        this.hovered = false;
    }

    init () {
        const renderer = this.target.renderer;
        if (!renderer || this.group !== null) return;
        if (!renderer.createDrawableGroup) throw new Error('Components require a renderer with drawable group support');
        this.group = renderer.createDrawableGroup(StageLayering.SPRITE_LAYER, this.target.component.parts.length);
        const ids = renderer.getDrawableGroupMembers(this.group);
        this.target.component.parts.forEach((part, index) => this.parts.set(part.name, ids[index]));
        this.target.drawableID = ids[0];
    }

    ids (collisionOnly = false) {
        return this.target.component.parts.filter(part => !collisionOnly || (part.collision &&
            (part.name !== 'mark' || this.target.component.properties.checked) &&
            (part.name !== 'fill' || this.target.component.properties.value > this.target.component.properties.min)))
            .map(part => this.parts.get(part.name))
            .filter(id => typeof id === 'number');
    }

    localPoint (x, y) {
        const target = this.target;
        const {direction, scale} = target._getRenderedDirectionAndScale();
        const angle = (90 - direction) * Math.PI / 180;
        const dx = x - target.x;
        const dy = y - target.y;
        if (!scale[0] || !scale[1]) return null;
        return [((dx * Math.cos(angle)) + (dy * Math.sin(angle))) * 100 / scale[0],
            ((-dx * Math.sin(angle)) + (dy * Math.cos(angle))) * 100 / scale[1]];
    }

    sync () {
        const target = this.target;
        if (!target.renderer) return;
        this.init();
        const {direction, scale} = target._getRenderedDirectionAndScale();
        const angle = (90 - direction) * Math.PI / 180;
        const config = target.component;
        const p = config.properties;
        const track = config.metadata.sliderTrack;
        const ratio = track ? (p.value - p.min) / (p.max - p.min) : 0;
        for (const part of config.parts) {
            let x = 0;
            let y = 0;
            let clip = null;
            let shown = true;
            if (part.name === 'thumb') {
                x = track.start[0] + ((track.end[0] - track.start[0]) * ratio);
                y = track.start[1] + ((track.end[1] - track.start[1]) * ratio);
            } else if (part.name === 'fill') {
                if (ratio < 1) {
                    const dx = track.end[0] - track.start[0];
                    const dy = track.end[1] - track.start[1];
                    const length = Math.hypot(dx, dy);
                    const nx = dx / length;
                    const ny = dy / length;
                    clip = [nx, ny, (nx * track.start[0]) + (ny * track.start[1]) + (length * ratio)];
                }
                shown = ratio > 0;
            } else if (part.name === 'mark') {
                shown = p.checked;
            }
            const id = this.parts.get(part.name);
            const px = x * scale[0] / 100;
            const py = y * scale[1] / 100;
            target.renderer.updateDrawableSkinId(id, target.getCostumes()[part.costumeIndex].skinId);
            target.renderer.updateDrawablePosition(id, [target.x + (px * Math.cos(angle)) - (py * Math.sin(angle)),
                target.y + (px * Math.sin(angle)) + (py * Math.cos(angle))]);
            target.renderer.updateDrawableDirectionScale(id, direction, scale);
            target.renderer.updateDrawableClipPlane(id, clip);
            target.renderer.updateDrawableVisible(id, target.visible && shown);
            for (const effect of Object.keys(target.effects)) {
                target.renderer.updateDrawableEffect(id, effect, target.effects[effect]);
            }
        }
    }

    setProperties (patch, emit = true) {
        const target = this.target;
        const previous = target.component.properties;
        const next = Model.copy(target.component);
        Object.assign(next.properties, patch);
        const normalized = Model.normalize(next, target.getCostumes().length);
        if (Object.keys(previous).every(key => previous[key] === normalized.properties[key])) return;
        target.component = normalized;
        if (normalized.properties.disabled) this.cancel();
        this.sync();
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
        if (emit) {
            for (const [key, opcode] of [['value', 'components_whenValueChanged'],
                ['checked', 'components_whenStateChanged']]) {
                if (previous[key] !== target.component.properties[key]) target.runtime.startHats(opcode, null, target);
            }
        }
    }

    hitPart (name, x, y) {
        const id = this.parts.get(name);
        return typeof id === 'number' && this.target.renderer.drawableTouching(id, x, y);
    }

    pointer (data, x, y) {
        const target = this.target;
        const config = target.component;
        if (!target.visible || target.dragging || config.properties.disabled || data.cancelled || data.wasDragged) {
            this.cancel();
            return;
        }
        if (data.isDown === true) {
            if (config.type === 'progress') return;
            this.pressed = true;
            if (config.type === 'slider' && !config.properties.clickTrackToJump &&
                !this.hitPart('thumb', data.x, data.y)) this.pressed = false;
        }
        if (!this.pressed) return;
        if (config.type === 'slider') {
            const point = this.localPoint(x, y);
            if (point) {
                const {start, end} = config.metadata.sliderTrack;
                const dx = end[0] - start[0];
                const dy = end[1] - start[1];
                const ratio = Math.max(0, Math.min(1,
                    (((point[0] - start[0]) * dx) + ((point[1] - start[1]) * dy)) / ((dx * dx) + (dy * dy))));
                const p = config.properties;
                this.setProperties({value: p.min + ((p.max - p.min) * ratio)});
            }
        }
        if (data.isDown === false) {
            const inside = target.isTouchingPoint(data.x, data.y);
            this.cancel();
            if (inside && !data.wasDragged) {
                if (config.type === 'button') target.runtime.startHats('components_whenClicked', null, target);
                if (config.type === 'toggle') this.setProperties({checked: !config.properties.checked});
            }
        }
    }

    cancel () {
        this.pressed = false;
        const mouse = this.target.runtime.ioDevices.mouse;
        if (mouse && mouse.componentCapture === this) mouse.componentCapture = null;
        if (mouse && mouse.componentHover === this) mouse.componentHover = null;
        this.hovered = false;
    }

    dispose () {
        this.cancel();
        if (this.group !== null) this.target.renderer.destroyDrawableGroup(this.group);
        this.group = null;
        this.parts.clear();
    }
}

module.exports = ComponentController;
