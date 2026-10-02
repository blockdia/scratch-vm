const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const ContainerOption = require('../../util/container-option');
const Transform = require('../../util/container-transform');
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
            color1: '#537FBA',
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
                containers: {acceptReporters: true, items: 'getContainers'},
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

    _changed (container, changed) {
        if (changed && !this.runtime.spriteContainers.cloneDefinitions.has(container.path)) {
            const original = this.runtime.targets.find(target => target.isOriginal);
            if (original) this.runtime.requestTargetsUpdate(original);
        }
    }

    _setTransform (container, patch) {
        if (container) this._changed(container, this.runtime.spriteContainers.setTransform(container.path, patch));
    }

    property (args, util) {
        const container = this._container(args.CONTAINER, util);
        return container && numericProperties.includes(args.PROPERTY) ?
            (container.transform || Transform.defaults)[args.PROPERTY] : 0;
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
        if (container) this._changed(container, this.runtime.spriteContainers.setVisible(container.path, visible));
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
        this._changed(container, this.runtime.spriteContainers.setOrder(container.path,
            args.LAYER === 'front' ? Infinity : -Infinity));
    }

    moveLayers (args, util) {
        const container = this._container(args.CONTAINER, util);
        const layers = Cast.toNumber(args.LAYERS);
        if (!container || !Number.isFinite(layers) || !['forward', 'backward'].includes(args.DIRECTION)) return;
        this._changed(container, this.runtime.spriteContainers.setOrder(container.path,
            Math.round(layers) * (args.DIRECTION === 'forward' ? 1 : -1), true));
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
