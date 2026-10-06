const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const TargetType = require('../../extension-support/target-type');
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
        const maskCommand = (opcode, label, args = {}) => ({...command(opcode, label, args),
            filter: [TargetType.SPRITE]});
        const items = values => values.map(([value, label, id = value]) => ({value, text: text(id, label)}));
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
                disableMonitor: true},
                '---',
                maskCommand('setMask', 'set mask to costume [COSTUME] using [MODE]',
                    {COSTUME: menu('costumes', '_current_'),
                        MODE: menu('maskModes', 'alpha')}),
                maskCommand('setMaskBounds',
                    'set mask position and size in [SPACE] center x: [X] y: [Y] width: [WIDTH] height: [HEIGHT]',
                    {SPACE: box.SPACE, X: number(0), Y: number(0), WIDTH: number(100), HEIGHT: number(100)}),
                maskCommand('setMaskRegion', 'set mask display to [REGION]', {REGION: menu('maskRegions', 'normal')}),
                maskCommand('clearMask', 'clear mask'),
                {...maskCommand('maskEnabled', 'mask enabled?'), blockType: BlockType.BOOLEAN, disableMonitor: true},
                {...maskCommand('maskProperty', 'mask [PROPERTY]', {PROPERTY: menu('maskProperties', 'costume')}),
                    blockType: BlockType.REPORTER,
                    disableMonitor: true}
            ],
            menus: {
                objects: {acceptReporters: true, items: 'objects'},
                costumes: {acceptReporters: true, items: 'costumes'},
                maskModes: {acceptReporters: false, items: items([['alpha', 'alpha'], ['luminance', 'luminance']])},
                maskRegions: {acceptReporters: false, items: items([['normal', 'normal'], ['inverse', 'inverted']])},
                maskProperties: {acceptReporters: false,
                    items: items([['costume', 'costume'], ['mode', 'sampling mode'], ['space', 'coordinate space'],
                        ['region', 'display', 'maskRegion'], ['x', 'center x'], ['y', 'center y'],
                        ['width', 'width'], ['height', 'height']])},
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
    costumes () {
        const target = this.runtime.getEditingTarget();
        return [{value: '_current_', text: text('currentCostume', 'current costume')},
            ...(target ? target.getCostumes().map(c => ({value: c.name, text: c.name})) : [])];
    }
    setMask (args, util) {
        const target = util.target;
        if (target.isStage || !['alpha', 'luminance'].includes(args.MODE)) return;
        const name = Cast.toString(args.COSTUME);
        const costume = name === '_current_' ? target.getCostumes()[target.currentCostume] :
            target.getCostumes().find(c => c.name === name);
        if (!costume) return;
        const [left, right, bottom, top] = target.getGraphicFrame();
        target.setCostumeMask({...target.costumeMask || {
            space: 'local',
            x: (left + right) / 2,
            y: (bottom + top) / 2,
            width: Math.max(right - left, 0.01),
            height: Math.max(top - bottom, 0.01),
            inverted: false},
        costume: costume.name,
        mode: args.MODE});
    }
    setMaskBounds (args, util) {
        if (!util.target.costumeMask) return;
        util.target.setCostumeMask({...util.target.costumeMask,
            space: args.SPACE,
            x: Cast.toNumber(args.X),
            y: Cast.toNumber(args.Y),
            width: Cast.toNumber(args.WIDTH),
            height: Cast.toNumber(args.HEIGHT)});
    }
    setMaskRegion (args, util) {
        if (!util.target.costumeMask || !['normal', 'inverse'].includes(args.REGION)) return;
        util.target.setCostumeMask({...util.target.costumeMask, inverted: args.REGION === 'inverse'});
    }
    clearMask (args, util) {
        util.target.setCostumeMask(null);
    }
    maskEnabled (args, util) {
        return Boolean(util.target.costumeMask);
    }
    maskProperty (args, util) {
        const m = util.target.costumeMask;
        const numeric = ['x', 'y', 'width', 'height'].includes(args.PROPERTY);
        if (!m) return numeric ? 0 : '';
        if (args.PROPERTY === 'region') return m.inverted ? 'inverse' : 'normal';
        return numeric || ['costume', 'mode', 'space'].includes(args.PROPERTY) ? m[args.PROPERTY] : '';
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
