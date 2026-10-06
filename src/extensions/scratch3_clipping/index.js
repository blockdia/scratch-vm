const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const ContainerOption = require('../../util/container-option');
const formatMessage = require('format-message');
const text = (id, fallback) => formatMessage({id: `clipping.${id}`, default: fallback});

class Clipping {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo () {
        const number = defaultValue => ({type: ArgumentType.NUMBER, defaultValue});
        const menu = (name, defaultValue) => ({type: ArgumentType.STRING, menu: name, defaultValue});
        const target = menu('objects', '_myself_');
        const box = {TARGET: target,
            SPACE: menu('spaces', 'local'),
            X: number(0),
            Y: number(0),
            WIDTH: number(100),
            HEIGHT: number(100)};
        const command = (opcode, label, args = {TARGET: target}) => ({opcode,
            blockType: BlockType.COMMAND,
            text: text(opcode, label),
            arguments: args});
        const items = values => values.map(([value, label]) => ({value, text: text(value, label)}));
        return {id: 'clipping',
            name: text('name', 'Clipping'),
            color1: '#9966FF',
            blocks: [
                command('rectangle',
                    'clip [TARGET] to rectangle in [SPACE] x: [X] y: [Y] width: [WIDTH] height: [HEIGHT]', box),
                command('roundedRectangle',
                    'clip [TARGET] to rounded rectangle in [SPACE] x: [X] y: [Y] width: [WIDTH] height: [HEIGHT] ' +
                    'radius: [RADIUS]',
                    {...box, RADIUS: number(16)}),
                command('circle', 'clip [TARGET] to circle in [SPACE] x: [X] y: [Y] radius: [RADIUS]',
                    {TARGET: target,
                        SPACE: box.SPACE,
                        X: number(0),
                        Y: number(0),
                        RADIUS: number(50)}),
                command('ellipse',
                    'clip [TARGET] to ellipse in [SPACE] x: [X] y: [Y] width: [WIDTH] height: [HEIGHT]', box),
                command('setRegion', 'keep [REGION] of clipping on [TARGET]',
                    {TARGET: target, REGION: menu('regions', 'inside')}),
                command('clear', 'clear clipping of [TARGET]'),
                '---',
                {...command('enabled', '[TARGET] clipping enabled?'),
                    blockType: BlockType.BOOLEAN,
                    disableMonitor: true},
                {...command('property', '[PROPERTY] of clipping on [TARGET]',
                    {TARGET: target, PROPERTY: menu('properties', 'width')}),
                blockType: BlockType.REPORTER,
                disableMonitor: true}
            ],
            menus: {
                objects: {acceptReporters: true, items: 'objects'},
                spaces: {acceptReporters: false,
                    items: items([['local', 'object coordinates'], ['stage', 'stage coordinates']])},
                regions: {acceptReporters: false, items: items([['inside', 'inside'], ['outside', 'outside']])},
                properties: {acceptReporters: false,
                    items: items([['type', 'shape'], ['space', 'coordinate space'],
                        ['region', 'kept region'], ['x', 'center x'], ['y', 'center y'],
                        ['width', 'width'], ['height', 'height'],
                        ['radius', 'radius'], ['left', 'left'], ['right', 'right'],
                        ['top', 'top'], ['bottom', 'bottom']])}
            }};
    }
    objects () {
        return [{value: '_myself_', text: text('myself', 'myself')},
            {value: ContainerOption.SELF, text: text('myContainer', 'my container')},
            ...this.runtime.spriteContainers.serialize().map(c => ({value: ContainerOption.ORIGINAL_PREFIX + c.path,
                text: `${text('container', 'container')}: ${c.path}`}))];
    }
    _object (args, util) {
        if (args.TARGET === '_myself_') return util.target.isStage ? null : util.target;
        const containers = this.runtime.spriteContainers;
        const id = containers.resolveReference(args.TARGET, util.target);
        return id ? {containerId: id, clipShape: containers.get(id).clip} : null;
    }
    _set (args, util, shape) {
        const object = this._object(args, util);
        if (!object) return;
        if (object.containerId) this.runtime.spriteContainers.setClip(object.containerId, shape);
        else object.setClipShape(shape);
    }
    _shape (args, util, type) {
        if (!['local', 'stage'].includes(args.SPACE)) return;
        const x = Cast.toNumber(args.X);
        const y = Cast.toNumber(args.Y);
        const width = Math.max(0, Cast.toNumber(type === 'circle' ? args.RADIUS : args.WIDTH)) *
            (type === 'circle' ? 2 : 1);
        const height = type === 'circle' ? width : Math.max(0, Cast.toNumber(args.HEIGHT));
        const radius = Math.max(0, Cast.toNumber(args.RADIUS));
        if (![x, y, width, height, radius].every(Number.isFinite)) return;
        const current = this._object(args, util);
        this._set(args, util, {type,
            space: args.SPACE,
            left: x - (width / 2),
            right: x + (width / 2),
            bottom: y - (height / 2),
            top: y + (height / 2),
            radius,
            inverted: Boolean(current && current.clipShape && current.clipShape.inverted)});
    }
    rectangle (args, util) {
        this._shape(args, util, 'rect');
    }
    roundedRectangle (args, util) {
        this._shape(args, util, 'roundedRect');
    }
    circle (args, util) {
        this._shape(args, util, 'circle');
    }
    ellipse (args, util) {
        this._shape(args, util, 'ellipse');
    }
    setRegion (args, util) {
        const object = this._object(args, util);
        if (object && object.clipShape && ['inside', 'outside'].includes(args.REGION)) {
            this._set(args, util, {...object.clipShape, inverted: args.REGION === 'outside'});
        }
    }
    clear (args, util) {
        this._set(args, util, null);
    }
    enabled (args, util) {
        const object = this._object(args, util);
        return Boolean(object && object.clipShape);
    }
    property (args, util) {
        const object = this._object(args, util);
        const c = object && object.clipShape;
        if (!c) return ['type', 'space', 'region'].includes(args.PROPERTY) ? '' : 0;
        switch (args.PROPERTY) {
        case 'type': return c.type || 'rect';
        case 'space': return c.space || 'local';
        case 'region': return c.inverted ? 'outside' : 'inside';
        case 'x': return (c.left + c.right) / 2;
        case 'y': return (c.bottom + c.top) / 2;
        case 'width': return c.right - c.left;
        case 'height': return c.top - c.bottom;
        case 'radius': return c.type === 'circle' ? (c.right - c.left) / 2 : c.radius || 0;
        default: return ['left', 'right', 'top', 'bottom'].includes(args.PROPERTY) ? c[args.PROPERTY] : 0;
        }
    }
}
module.exports = Clipping;
