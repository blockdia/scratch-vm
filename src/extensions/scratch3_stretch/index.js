const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const ContainerOption = require('../../util/container-option');
const Warp = require('../../util/container-geometry');
const Geometry = require('../../util/graphic-geometry');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const text = (id, fallback) => formatMessage({id: `stretch.${id}`, default: fallback});
const perspectiveWarnings = {
    INVALID_PERSPECTIVE_OFFSETS: {
        id: 'stretch.invalidPerspectiveOffsets',
        default: 'Cannot set perspective: each offset must be a finite number between -1000% and 1000%. ' +
            'The previous perspective has been kept.'
    },
    INVALID_PERSPECTIVE_QUAD: {
        id: 'stretch.invalidPerspectiveQuad',
        default: 'Cannot set perspective: corners must form a convex quadrilateral without crossing, ' +
            'overlapping, or collapsing. The previous perspective has been kept. ' +
            'To change multiple corners, use the block that sets all four corners at once.'
    }
};

class Stretch {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo () {
        const number = defaultValue => ({type: ArgumentType.NUMBER, defaultValue});
        const menu = (name, defaultValue) => ({type: ArgumentType.STRING, menu: name, defaultValue});
        const axis = menu('axes', 'x');
        const dimension = menu('dimensions', 'width');
        const command = (opcode, label, args = {}) => ({opcode,
            blockType: BlockType.COMMAND,
            text: text(opcode, label),
            arguments: {TARGET: menu('objects', '_myself_'), ...args}});
        const reporter = (opcode, label, args = {}, boolean = false) => ({...command(opcode, label, args),
            blockType: boolean ? BlockType.BOOLEAN : BlockType.REPORTER,
            disableMonitor: true});
        const partBlock = block => ({...block,
            componentTypes: ['button', 'toggle', 'slider', 'progress'],
            arguments: Object.fromEntries(Object.entries(block.arguments).filter(([key]) => key !== 'TARGET'))});
        const containerBlock = block => ({...block,
            arguments: {CONTAINER: menu('containers', '_mycontainer_'),
                ...Object.fromEntries(Object.entries(block.arguments).filter(([key]) => key !== 'TARGET'))}});
        const items = values => values.map(([value, label]) => ({value, text: text(value, label)}));
        return {
            id: 'stretch',
            name: text('name', 'Stretch'),
            color1: '#4287F5',
            blocks: [
                command('set', 'set stretch of [TARGET] to x: [X] % y: [Y] %', {X: number(100), Y: number(100)}),
                command('change', 'change stretch of [TARGET] by x: [X] y: [Y]', {X: number(10), Y: number(0)}),
                command('setAxis', 'set [AXIS] stretch of [TARGET] to [VALUE] %', {AXIS: axis, VALUE: number(100)}),
                command('changeAxis', 'change [AXIS] stretch of [TARGET] by [VALUE]', {AXIS: axis, VALUE: number(10)}),
                reporter('axis', '[AXIS] stretch of [TARGET]', {AXIS: axis}),
                '---',
                command('setBorders',
                    'set nine-slice borders of [TARGET] to left: [LEFT] right: [RIGHT] top: [TOP] bottom: [BOTTOM]',
                    {LEFT: number(12), RIGHT: number(12), TOP: number(12), BOTTOM: number(12)}),
                partBlock(command('setPartBorders',
                    'set nine-slice borders of component part [PART] to ' +
                    'left: [LEFT] right: [RIGHT] top: [TOP] bottom: [BOTTOM]',
                    {PART: menu('parts'),
                        LEFT: number(12),
                        RIGHT: number(12),
                        TOP: number(12),
                        BOTTOM: number(12)})),
                command('setSize', 'set nine-slice size of [TARGET] to width: [WIDTH] height: [HEIGHT]',
                    {WIDTH: number(200), HEIGHT: number(60)}),
                command('setDimension', 'set nine-slice [DIMENSION] of [TARGET] to [VALUE]',
                    {DIMENSION: dimension, VALUE: number(200)}),
                reporter('dimension', 'nine-slice [DIMENSION] of [TARGET]', {DIMENSION: dimension}),
                reporter('border', 'nine-slice [BORDER] border of [TARGET]',
                    {BORDER: menu('borders', 'left')}),
                partBlock(reporter('partBorder', 'nine-slice [BORDER] border of component part [PART]',
                    {PART: menu('parts'), BORDER: menu('borders', 'left')})),
                reporter('enabled', 'nine-slice enabled for [TARGET]?', {}, true),
                command('disable', 'turn off nine-slice for [TARGET]'),
                '---',
                command('setPerspectiveCorner', 'set perspective [CORNER] offset of [TARGET] to x: [X] % y: [Y] %',
                    {CORNER: menu('corners', 'tl'), X: number(10), Y: number(0)}),
                command('changePerspectiveCorner', 'change perspective [CORNER] offset of [TARGET] by x: [X] y: [Y]',
                    {CORNER: menu('corners', 'tl'), X: number(5), Y: number(0)}),
                command('setPerspective',
                    'set perspective offsets of [TARGET] to top left x: [TLX] % y: [TLY] % ' +
                    'top right x: [TRX] % y: [TRY] % bottom left x: [BLX] % y: [BLY] % ' +
                    'bottom right x: [BRX] % y: [BRY] %',
                    Object.fromEntries(['TLX', 'TLY', 'TRX', 'TRY', 'BRX', 'BRY', 'BLX', 'BLY']
                        .map(key => [key, number(0)]))),
                reporter('perspectiveCorner', 'perspective [CORNER] [AXIS] offset of [TARGET]',
                    {CORNER: menu('corners', 'tl'), AXIS: axis}),
                reporter('perspectiveEnabled', 'perspective enabled for [TARGET]?', {}, true),
                command('clearPerspective', 'clear perspective of [TARGET]'),
                '---',
                containerBlock(command('setFrame',
                    'set reference frame of [CONTAINER] to center x: [X] y: [Y] width: [WIDTH] height: [HEIGHT]',
                    {X: number(0), Y: number(0), WIDTH: number(200), HEIGHT: number(100)})),
                containerBlock(command('fitFrame', 'set reference frame of [CONTAINER] to current content bounds')),
                containerBlock(reporter('frame', '[PROPERTY] of reference frame of [CONTAINER]',
                    {PROPERTY: menu('frameProperties', 'width')}))
            ],
            menus: {
                objects: {acceptReporters: true, items: 'objects'},
                containers: {acceptReporters: true, items: 'containers'},
                frameProperties: {acceptReporters: false,
                    items: items([['x', 'x'], ['y', 'y'], ['width', 'width'], ['height', 'height']])},
                axes: {acceptReporters: false, items: items([['x', 'x'], ['y', 'y']])},
                dimensions: {acceptReporters: false, items: items([['width', 'width'], ['height', 'height']])},
                borders: {acceptReporters: false,
                    items: items([['left', 'left'], ['right', 'right'], ['top', 'top'], ['bottom', 'bottom']])},
                parts: {acceptReporters: true, items: 'parts'},
                corners: {acceptReporters: false,
                    items: items([['tl', 'top left'], ['tr', 'top right'],
                        ['br', 'bottom right'], ['bl', 'bottom left']])}
            }
        };
    }
    objects () {
        return [{value: '_myself_', text: text('myself', 'myself')}, ...this.containers()];
    }
    containers () {
        return [{value: ContainerOption.SELF, text: text('myContainer', 'my container')},
            ...this.runtime.spriteContainers.serialize().map(c => ({value: ContainerOption.ORIGINAL_PREFIX + c.path,
                text: `${text('container', 'container')}: ${c.path}`}))];
    }
    object (reference, target) {
        if (reference === '_myself_') return target.isStage ? null : target;
        if (!reference) return null;
        const containers = this.runtime.spriteContainers;
        const id = containers.resolveReference(reference, target);
        const c = id && containers.get(id);
        if (!c) return null;
        return {containerId: id,
            stretch: c.stretch || {x: 100, y: 100},
            nineSlice: c.geometry && c.geometry.nineSlice,
            perspective: c.geometry && c.geometry.perspective,
            geometry: c.geometry,
            setStretch: value => containers.setStretch(id, value),
            setNineSliceSize: value => containers.setGeometry(id, {nineSlice: value}),
            setNineSliceMargins: value => containers.setGeometry(id, {borders: value}),
            setPerspective: value => containers.setGeometry(id, {perspective: value})};
    }
    setFrame (args, util) {
        const id = this.runtime.spriteContainers.resolveReference(args.CONTAINER, util.target);
        if (id) {
            this.runtime.spriteContainers.setGeometry(id,
                {frame: {x: Cast.toNumber(args.X),
                    y: Cast.toNumber(args.Y),
                    width: Cast.toNumber(args.WIDTH),
                    height: Cast.toNumber(args.HEIGHT)}});
        }
    }
    fitFrame (args, util) {
        const id = this.runtime.spriteContainers.resolveReference(args.CONTAINER, util.target);
        const renderer = this.runtime.renderer;
        if (id && renderer && renderer.getContainerGeometryFrame) {
            this.runtime.spriteContainers.setGeometry(id, {frame: renderer.getContainerGeometryFrame(id)});
        }
    }
    frame (args, util) {
        const id = this.runtime.spriteContainers.resolveReference(args.CONTAINER, util.target);
        if (!id || !['x', 'y', 'width', 'height'].includes(args.PROPERTY)) return 0;
        return this.runtime.spriteContainers.getGeometryFrame(id)[args.PROPERTY];
    }
    parts () {
        const target = this.runtime.getEditingTarget();
        const parts = target && target.component && target.component.parts.filter(p => p.name !== 'thumb');
        return parts && parts.length ? parts.map(p => ({value: p.name, text: text(`part_${p.name}`, p.name)})) :
            [{value: '', text: text('noParts', 'no component parts')}];
    }
    set (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        target.setStretch({x: Cast.toNumber(args.X), y: Cast.toNumber(args.Y)});
    }
    change (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        this.set({...args,
            X: target.stretch.x + Cast.toNumber(args.X),
            Y: target.stretch.y + Cast.toNumber(args.Y)}, util);
    }
    setAxis (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        if (!['x', 'y'].includes(args.AXIS)) return;
        target.setStretch({...target.stretch, [args.AXIS]: Cast.toNumber(args.VALUE)});
    }
    changeAxis (args, util) {
        this.setAxis({...args, VALUE: this.axis(args, util) + Cast.toNumber(args.VALUE)}, util);
    }
    axis (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return 0;
        return ['x', 'y'].includes(args.AXIS) ? target.stretch[args.AXIS] : 0;
    }
    setBorders (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        target.setNineSliceMargins({left: Cast.toNumber(args.LEFT),
            right: Cast.toNumber(args.RIGHT),
            top: Cast.toNumber(args.TOP),
            bottom: Cast.toNumber(args.BOTTOM)});
    }
    setPartBorders (args, util) {
        const target = util.target;
        if (!target.component || !target.component.parts.some(p => p.name !== 'thumb' && p.name === args.PART)) return;
        target.setNineSliceMargins({left: Cast.toNumber(args.LEFT),
            right: Cast.toNumber(args.RIGHT),
            top: Cast.toNumber(args.TOP),
            bottom: Cast.toNumber(args.BOTTOM)}, args.PART);
    }
    partBorder (args, util) {
        const target = util.target;
        if (!['left', 'right', 'top', 'bottom'].includes(args.BORDER)) return 0;
        const part = target.component && target.component.parts.find(p => p.name !== 'thumb' && p.name === args.PART);
        if (!part) return 0;
        const costume = target.getCostumes()[target.getCostumeIndexByName(part.costume)];
        return costume && costume.nineSlice ? costume.nineSlice[args.BORDER] : 0;
    }
    setSize (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        target.setNineSliceSize({width: Cast.toNumber(args.WIDTH), height: Cast.toNumber(args.HEIGHT)});
    }
    setDimension (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        if (!['width', 'height'].includes(args.DIMENSION)) return;
        const size = target.nineSlice || {width: this.dimension({...args, DIMENSION: 'width'}, util),
            height: this.dimension({...args, DIMENSION: 'height'}, util)};
        target.setNineSliceSize({...size, [args.DIMENSION]: Cast.toNumber(args.VALUE)});
    }
    dimension (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return 0;
        if (!['width', 'height'].includes(args.DIMENSION) || target.isStage) return 0;
        if (target.containerId) {
            const g = Warp.prepare(target.geometry || {frame: this.runtime.spriteContainers.getGeometryFrame(
                target.containerId)});
            const axis = args.DIMENSION === 'width' ? g.x : g.y;
            return axis.output[3] - axis.output[0];
        }
        const part = target.component && target.component.parts.find(p => p.name !== 'thumb');
        const costume = target.getCostumes()[part ? target.getCostumeIndexByName(part.costume) : target.currentCostume];
        if (!costume || !target.renderer) return 0;
        const size = target.renderer.getSkinSize(costume.skinId);
        const horizontal = args.DIMENSION === 'width';
        const n = target.nineSlice && (costume.nineSlice || {left: 0, right: 0, top: 0, bottom: 0});
        return n ? Math.max(target.nineSlice[args.DIMENSION],
            Math.min(size[horizontal ? 0 : 1], horizontal ? n.left + n.right : n.top + n.bottom)) :
            size[horizontal ? 0 : 1];
    }
    border (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return 0;
        if (!['left', 'right', 'top', 'bottom'].includes(args.BORDER)) return 0;
        if (target.containerId) {
            return target.geometry && target.geometry.borders ?
                target.geometry.borders[args.BORDER] : 0;
        }
        const part = target.component && target.component.parts.find(p => p.name !== 'thumb');
        const costume = target.getCostumes()[part ? target.getCostumeIndexByName(part.costume) : target.currentCostume];
        return costume && costume.nineSlice ? costume.nineSlice[args.BORDER] : 0;
    }
    enabled (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return false;
        return !target.isStage && Boolean(target.nineSlice);
    }
    disable (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        target.setNineSliceSize(null);
    }
    _setPerspective (target, corners, util) {
        const code = Geometry.perspectiveError(corners);
        if (code) {
            this.runtime.logger.warn(formatMessage(perspectiveWarnings[code]), {
                ...this.runtime.logger.captureContext(util.thread),
                targetId: util.target.id,
                source: 'stretch',
                code,
                subjectName: target.containerId || target.getName()
            });
            return;
        }
        target.setPerspective(corners);
    }
    setPerspectiveCorner (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        const index = ['tl', 'tr', 'br', 'bl'].indexOf(args.CORNER);
        if (index < 0) return;
        const corners = target.perspective ? target.perspective.map(p => p.slice()) :
            [[0, 0], [0, 0], [0, 0], [0, 0]];
        corners[index] = [Cast.toNumber(args.X), Cast.toNumber(args.Y)];
        this._setPerspective(target, corners, util);
    }
    changePerspectiveCorner (args, util) {
        this.setPerspectiveCorner({...args,
            X: this.perspectiveCorner({...args, AXIS: 'x'}, util) + Cast.toNumber(args.X),
            Y: this.perspectiveCorner({...args, AXIS: 'y'}, util) + Cast.toNumber(args.Y)}, util);
    }
    setPerspective (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        this._setPerspective(target, ['TL', 'TR', 'BR', 'BL'].map(key =>
            [Cast.toNumber(args[`${key}X`]), Cast.toNumber(args[`${key}Y`])]), util);
    }
    perspectiveCorner (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return 0;
        if (!['x', 'y'].includes(args.AXIS)) return 0;
        const point = target.perspective && target.perspective[['tl', 'tr', 'br', 'bl'].indexOf(args.CORNER)];
        return point ? point[args.AXIS === 'y' ? 1 : 0] : 0;
    }
    perspectiveEnabled (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return false;
        return Boolean(target.perspective);
    }
    clearPerspective (args, util) {
        const target = this.object(args.TARGET, util.target);
        if (!target) return;
        target.setPerspective(null);
    }
}
module.exports = Stretch;
