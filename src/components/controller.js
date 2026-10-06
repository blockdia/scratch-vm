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

    ids (activeOnly = false) {
        return this.target.component.parts.filter(part => !activeOnly || this.isPartShown(part))
            .map(part => this.parts.get(part.name))
            .filter(id => typeof id === 'number');
    }

    isPartShown (part) {
        const p = this.target.component.properties;
        return (part.name !== 'off' || !p.checked) && (part.name !== 'on' || p.checked) &&
            (part.name !== 'fill' || p.value > p.min);
    }

    getStampDrawableIDs () {
        return this.ids(true);
    }

    partGeometry (part) {
        const target = this.target;
        const costume = target.getCostumes()[target.getCostumeIndexByName(part.costume)];
        const source = target.renderer.getSkinSize(costume.skinId);
        const origin = target.renderer.getSkinRotationCenter(costume.skinId);
        const n = part.name !== 'thumb' && target.nineSlice &&
            (costume.nineSlice || {left: 0, right: 0, top: 0, bottom: 0});
        const size = n ? [Math.max(target.nineSlice.width, Math.min(source[0], n.left + n.right)),
            Math.max(target.nineSlice.height, Math.min(source[1], n.top + n.bottom))] : source;
        const center = [origin[0] * size[0] / Math.max(source[0], 0.01),
            origin[1] * size[1] / Math.max(source[1], 0.01)];
        return {source, origin, size, center, margins: n};
    }

    getTrack () {
        const track = this.target.component.metadata.sliderTrack;
        if (!track) return null;
        const part = this.target.component.parts.find(p => p.name === 'track');
        const {source, origin, size, center, margins} = this.partGeometry(part);
        if (!margins) return track;
        const axis = (p, length, output, start, end) => {
            const factor = Math.min(1, length / Math.max(start + end, 1));
            start *= factor;
            end *= factor;
            if (p <= start) return p;
            if (p >= length - end) return output - length + p;
            return start + ((p - start) * (output - start - end) / Math.max(0.01, length - start - end));
        };
        const map = p => [axis(p[0] + origin[0], source[0], size[0], margins.left, margins.right) - center[0],
            center[1] - axis(origin[1] - p[1], source[1], size[1], margins.top, margins.bottom)];
        return {start: map(track.start), end: map(track.end)};
    }

    // Measure in unrotated costume coordinates, including the full thumb travel.
    // Size limits must not change with direction, effects, or the current value.
    getFrame () {
        const target = this.target;
        const bounds = {left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity};
        for (const part of target.component.parts) {
            const {size: [width, height], center: [cx, cy]} = this.partGeometry(part);
            const track = this.getTrack();
            const positions = part.name === 'thumb' ? [track.start, track.end] : [[0, 0]];
            for (const [x, y] of positions) {
                bounds.left = Math.min(bounds.left, x - cx);
                bounds.right = Math.max(bounds.right, x - cx + width);
                bounds.bottom = Math.min(bounds.bottom, y + cy - height);
                bounds.top = Math.max(bounds.top, y + cy);
            }
        }
        return [bounds.left, bounds.right, bounds.bottom, bounds.top];
    }

    getSize () {
        const [left, right, bottom, top] = this.getFrame();
        return [right - left, top - bottom];
    }

    localPoint (x, y) {
        const target = this.target;
        if (target.perspective && target.renderer.getDrawableLocalPosition) {
            return target.renderer.getDrawableLocalPosition(target.drawableID, x, y);
        }
        [x, y] = target.worldToLocal(x, y);
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
        const track = this.getTrack();
        const ratio = track ? (p.value - p.min) / (p.max - p.min) : 0;
        for (const part of config.parts) {
            let x = 0;
            let y = 0;
            let clip = null;
            const shown = this.isPartShown(part);
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
            }
            const id = this.parts.get(part.name);
            const px = x * scale[0] / 100;
            const py = y * scale[1] / 100;
            const costume = target.getCostumes()[target.getCostumeIndexByName(part.costume)];
            target.renderer.updateDrawableSkinId(id, costume.skinId);
            target.renderer.updateDrawablePosition(id, [target.x + (px * Math.cos(angle)) - (py * Math.sin(angle)),
                target.y + (px * Math.sin(angle)) + (py * Math.cos(angle))]);
            target.renderer.updateDrawableDirectionScale(id, direction, scale);
            target.syncDrawableGeometry(id, costume, [x, y], part.name !== 'thumb');
            target.renderer.updateDrawableClipPlane(id, clip);
            target.renderer.updateDrawableVisible(id, target.isEffectivelyVisible() && shown);
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
        const normalized = Model.normalize(next, target.getCostumes());
        if (Object.keys(previous).every(key => previous[key] === normalized.properties[key])) return;
        target.component = normalized;
        if (normalized.properties.disabled) this.cancel();
        this.sync();
        target.emitVisualChange();
        target.runtime.requestRedraw();
        target.runtime.requestTargetsUpdate(target);
        if (emit && previous.checked !== target.component.properties.checked) {
            target.runtime.startHats('components_whenStateChanged', null, target);
        }
    }

    hitPart (name, x, y) {
        const id = this.parts.get(name);
        return typeof id === 'number' && this.target.renderer.drawableTouching(id, x, y);
    }

    pointer (data, x, y) {
        const target = this.target;
        const config = target.component;
        if (!target.isEffectivelyVisible() || target.dragging || config.properties.disabled ||
            data.cancelled || data.wasDragged) {
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
                const {start, end} = this.getTrack();
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
