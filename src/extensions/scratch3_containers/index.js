const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const ContainerOption = require('../../util/container-option');
const Transform = require('../../util/container-transform');
const Effects = require('../../util/container-effects');
const formatMessage = require('format-message');

const text = (id, defaultMessage) => formatMessage({id: `containers.${id}`, default: defaultMessage});
const numericProperties = ['x', 'y', 'size', 'direction'];

class Containers {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        const container = {type: ArgumentType.STRING, menu: 'containers'};
        const property = {type: ArgumentType.STRING, menu: 'properties', defaultValue: 'x'};
        const number = defaultValue => ({type: ArgumentType.NUMBER, defaultValue});
        const item = (value, label) => ({text: text(value, label), value});
        return {
            id: 'containers',
            name: text('name', 'Containers'),
            color1: '#A9744F',
            blocks: [
                {opcode: 'property',
                    blockType: BlockType.REPORTER,
                    text: text('property', '[PROPERTY] of container [CONTAINER]'),
                    disableMonitor: true,
                    arguments: {CONTAINER: container, PROPERTY: property}},
                {opcode: 'setProperty',
                    blockType: BlockType.COMMAND,
                    text: text('setProperty', 'set [PROPERTY] of container [CONTAINER] to [VALUE]'),
                    arguments: {CONTAINER: container, PROPERTY: property, VALUE: number(0)}},
                {opcode: 'changeProperty',
                    blockType: BlockType.COMMAND,
                    text: text('changeProperty', 'change [PROPERTY] of container [CONTAINER] by [VALUE]'),
                    arguments: {CONTAINER: container, PROPERTY: property, VALUE: number(10)}},
                {opcode: 'goToXY',
                    blockType: BlockType.COMMAND,
                    text: text('goToXY', 'go container [CONTAINER] to x: [X] y: [Y]'),
                    arguments: {CONTAINER: container, X: number(0), Y: number(0)}},
                {opcode: 'setRotationStyle',
                    blockType: BlockType.COMMAND,
                    text: text('setRotationStyle', 'set rotation style of container [CONTAINER] to [STYLE]'),
                    arguments: {CONTAINER: container, STYLE: {type: ArgumentType.STRING, menu: 'rotationStyles'}}},
                {opcode: 'worldProperty',
                    blockType: BlockType.REPORTER,
                    text: text('worldProperty', '[PROPERTY] of [TARGET] on stage'),
                    disableMonitor: true,
                    arguments: {PROPERTY: property, TARGET: {type: ArgumentType.STRING, menu: 'sprites'}}},
                '---',
                {opcode: 'effect',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('effect', '[EFFECT] effect of container [CONTAINER]'),
                    arguments: {CONTAINER: container, EFFECT: {type: ArgumentType.STRING, menu: 'effects'}}},
                {opcode: 'setEffect',
                    blockType: BlockType.COMMAND,
                    text: text('setEffect', 'set [EFFECT] effect of container [CONTAINER] to [VALUE]'),
                    arguments: {CONTAINER: container,
                        EFFECT: {type: ArgumentType.STRING, menu: 'effects'},
                        VALUE: number(0)}},
                {opcode: 'changeEffect',
                    blockType: BlockType.COMMAND,
                    text: text('changeEffect', 'change [EFFECT] effect of container [CONTAINER] by [VALUE]'),
                    arguments: {CONTAINER: container,
                        EFFECT: {type: ArgumentType.STRING, menu: 'effects'},
                        VALUE: number(25)}},
                {opcode: 'clearEffects',
                    blockType: BlockType.COMMAND,
                    text: text('clearEffects', 'clear graphic effects of container [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                '---',
                {opcode: 'show',
                    blockType: BlockType.COMMAND,
                    text: text('show', 'show container [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'hide',
                    blockType: BlockType.COMMAND,
                    text: text('hide', 'hide container [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'isVisible',
                    blockType: BlockType.BOOLEAN,
                    text: text('isVisible', 'container [CONTAINER] shown?'),
                    disableMonitor: true,
                    arguments: {CONTAINER: container}},
                '---',
                {opcode: 'goToLayer',
                    blockType: BlockType.COMMAND,
                    text: text('goToLayer', 'go container [CONTAINER] to [LAYER] layer'),
                    arguments: {CONTAINER: container, LAYER: {type: ArgumentType.STRING, menu: 'layers'}}},
                {opcode: 'moveLayers',
                    blockType: BlockType.COMMAND,
                    text: text('moveLayers', 'go container [CONTAINER] [DIRECTION] [LAYERS] layers'),
                    arguments: {CONTAINER: container,
                        LAYERS: number(1),
                        DIRECTION: {type: ArgumentType.STRING, menu: 'layerDirections'}}},
                '---',
                {opcode: 'createClone',
                    blockType: BlockType.COMMAND,
                    text: text('createClone', 'create clone of container [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'deleteClone',
                    blockType: BlockType.COMMAND,
                    isTerminal: true,
                    text: text('deleteClone', 'delete this container clone')}
            ],
            menus: {
                effects: {acceptReporters: false, items: Effects.names.map(name => item(name, name))},
                containers: {acceptReporters: true, items: 'getContainers'},
                sprites: {acceptReporters: true, items: 'getSprites'},
                properties: {acceptReporters: false,
                    items: [item('x', 'x position'), item('y', 'y position'),
                        item('size', 'size'), item('direction', 'direction')]},
                rotationStyles: {acceptReporters: false,
                    items: [item('all around', 'all around'), item('left-right', 'left-right'),
                        item("don't rotate", "don't rotate")]},
                layers: {acceptReporters: false, items: [item('front', 'front'), item('back', 'back')]},
                layerDirections: {acceptReporters: false,
                    items: [item('forward', 'forward'), item('backward', 'backward')]}
            }
        };
    }

    getContainers () {
        const containers = this.runtime.spriteContainers;
        const items = [];
        const current = containers.getContainingContainer(this.runtime.getEditingTarget());
        if (current) {
            items.push({text: text('containingContainer', 'containing container'), value: ContainerOption.SELF});
        }
        // Like Scratch's sprite menu, the relative choice replaces the current named entry.
        for (const {path} of containers.serialize()) {
            if (!current || path !== current.path) items.push({text: path, value: path});
        }
        return items.length ? items : [{text: text('noContainers', 'no containers'), value: ''}];
    }

    getSprites () {
        const editing = this.runtime.getEditingTarget();
        const items = [];
        if (editing && !editing.isStage) items.push({text: text('myself', 'myself'), value: '_myself_'});
        for (const target of this.runtime.targets) {
            if (target.isOriginal && !target.isStage && (!editing || target.sprite !== editing.sprite)) {
                items.push({text: target.getName(), value: target.getName()});
            }
        }
        return items.length ? items : [{text: text('noSprites', 'no sprites'), value: ''}];
    }

    _container (value, util) {
        value = Cast.toString(value);
        const containers = this.runtime.spriteContainers;
        if (value === ContainerOption.SELF) {
            const current = containers.getContainingContainer(util.target);
            return current ? containers.get(current.id) : null;
        }
        // Reporters may supply a plain folder path, just like sprite-name inputs.
        return containers.get(value);
    }

    _setTransform (container, patch) {
        if (container) this.runtime.spriteContainers.setTransform(container.path, patch);
    }

    effect (args, util) {
        const container = this._container(args.CONTAINER, util);
        return container && Effects.names.includes(args.EFFECT) ? (container.effects || {})[args.EFFECT] || 0 : 0;
    }

    setEffect (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (container && Effects.names.includes(args.EFFECT)) {
            // Clamp bounded effects before the container API rejects non-finite values.
            const value = this.runtime.ext_scratch3_looks.clampEffect(args.EFFECT, Cast.toNumber(args.VALUE));
            this.runtime.spriteContainers.setEffects(container.path, {[args.EFFECT]: value});
        }
    }

    changeEffect (args, util) {
        this.setEffect({...args, VALUE: this.effect(args, util) + Cast.toNumber(args.VALUE)}, util);
    }

    clearEffects (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (container) this.runtime.spriteContainers.setEffects(container.path, null);
    }

    property (args, util) {
        const container = this._container(args.CONTAINER, util);
        return container && numericProperties.includes(args.PROPERTY) ?
            (container.transform || Transform.defaults)[args.PROPERTY] : 0;
    }

    worldProperty (args, util) {
        const name = Cast.toString(args.TARGET);
        const target = name === '_myself_' ? util.target : this.runtime.getSpriteTargetByName(name);
        if (!target || target.isStage) return 0;
        switch (args.PROPERTY) {
        case 'x': return target.getWorldPosition()[0];
        case 'y': return target.getWorldPosition()[1];
        case 'direction': return target.getWorldDirection();
        case 'size': return target.getWorldSize();
        default: return 0;
        }
    }

    _setProperty (args, util, change) {
        const container = this._container(args.CONTAINER, util);
        if (!container || !numericProperties.includes(args.PROPERTY)) return;
        const value = Cast.toNumber(args.VALUE) + (change ?
            (container.transform || Transform.defaults)[args.PROPERTY] : 0);
        this._setTransform(container, {[args.PROPERTY]: value});
    }

    setProperty (args, util) {
        this._setProperty(args, util, false);
    }

    changeProperty (args, util) {
        this._setProperty(args, util, true);
    }

    goToXY (args, util) {
        this._setTransform(this._container(args.CONTAINER, util), {x: Cast.toNumber(args.X), y: Cast.toNumber(args.Y)});
    }

    setRotationStyle (args, util) {
        this._setTransform(this._container(args.CONTAINER, util), {rotationStyle: Cast.toString(args.STYLE)});
    }

    _setVisible (args, util, visible) {
        const container = this._container(args.CONTAINER, util);
        if (container) this.runtime.spriteContainers.setVisible(container.path, visible);
    }

    show (args, util) {
        this._setVisible(args, util, true);
    }

    hide (args, util) {
        this._setVisible(args, util, false);
    }

    isVisible (args, util) {
        const container = this._container(args.CONTAINER, util);
        return Boolean(container && container.visible);
    }

    goToLayer (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (!container || !['front', 'back'].includes(args.LAYER)) return;
        this.runtime.spriteContainers.setOrder(container.path, args.LAYER === 'front' ? Infinity : -Infinity);
    }

    moveLayers (args, util) {
        const container = this._container(args.CONTAINER, util);
        const layers = Cast.toNumber(args.LAYERS);
        if (!container || !Number.isFinite(layers) || !['forward', 'backward'].includes(args.DIRECTION)) return;
        this.runtime.spriteContainers.setOrder(container.path,
            Math.round(layers) * (args.DIRECTION === 'forward' ? 1 : -1), true);
    }

    createClone (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (container) this.runtime.spriteContainers.createClone(container.path);
    }

    deleteClone (args, util) {
        const container = this.runtime.spriteContainers.getContainingContainer(util.target);
        if (container) this.runtime.spriteContainers.deleteClone(container.id);
    }
}

module.exports = Containers;
