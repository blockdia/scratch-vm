const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const text = (id, fallback) => formatMessage({id: `stretch.${id}`, default: fallback});

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
            arguments: args,
            filter: [TargetType.SPRITE]});
        const reporter = (opcode, label, args = {}, boolean = false) => ({...command(opcode, label, args),
            blockType: boolean ? BlockType.BOOLEAN : BlockType.REPORTER,
            disableMonitor: true});
        const items = values => values.map(([value, label]) => ({value, text: text(value, label)}));
        return {
            id: 'stretch',
            name: text('name', 'Stretch'),
            color1: '#4287F5',
            blocks: [
                command('set', 'set stretch to x: [X] % y: [Y] %', {X: number(100), Y: number(100)}),
                command('change', 'change stretch by x: [X] y: [Y]', {X: number(10), Y: number(0)}),
                command('setAxis', 'set [AXIS] stretch to [VALUE] %', {AXIS: axis, VALUE: number(100)}),
                command('changeAxis', 'change [AXIS] stretch by [VALUE]', {AXIS: axis, VALUE: number(10)}),
                reporter('axis', '[AXIS] stretch', {AXIS: axis}),
                '---',
                command('setBorders',
                    'set nine-slice borders of [PART] left: [LEFT] right: [RIGHT] top: [TOP] bottom: [BOTTOM]',
                    {PART: menu('parts', '_backgrounds_'),
                        LEFT: number(12),
                        RIGHT: number(12),
                        TOP: number(12),
                        BOTTOM: number(12)}),
                command('setSize', 'set nine-slice size to width: [WIDTH] height: [HEIGHT]',
                    {WIDTH: number(200), HEIGHT: number(60)}),
                command('setDimension', 'set nine-slice [DIMENSION] to [VALUE]',
                    {DIMENSION: dimension, VALUE: number(200)}),
                reporter('dimension', 'nine-slice [DIMENSION]', {DIMENSION: dimension}),
                reporter('border', 'nine-slice [BORDER] border of [PART]',
                    {PART: menu('parts', '_backgrounds_'), BORDER: menu('borders', 'left')}),
                reporter('enabled', 'nine-slice enabled?', {}, true),
                command('disable', 'turn off nine-slice'),
                '---',
                command('setPerspectiveCorner', 'set perspective [CORNER] offset to x: [X] % y: [Y] %',
                    {CORNER: menu('corners', 'tl'), X: number(10), Y: number(0)}),
                command('changePerspectiveCorner', 'change perspective [CORNER] offset by x: [X] y: [Y]',
                    {CORNER: menu('corners', 'tl'), X: number(5), Y: number(0)}),
                command('setPerspective',
                    'set perspective offsets % top left: [TLX] [TLY] top right: [TRX] [TRY] ' +
                    'bottom right: [BRX] [BRY] bottom left: [BLX] [BLY]',
                    Object.fromEntries(['TLX', 'TLY', 'TRX', 'TRY', 'BRX', 'BRY', 'BLX', 'BLY']
                        .map(key => [key, number(0)]))),
                reporter('perspectiveCorner', 'perspective [CORNER] [AXIS] offset',
                    {CORNER: menu('corners', 'tl'), AXIS: axis}),
                reporter('perspectiveEnabled', 'perspective enabled?', {}, true),
                command('clearPerspective', 'clear perspective')
            ],
            menus: {
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
    parts () {
        const target = this.runtime.getEditingTarget();
        return [{value: '_backgrounds_', text: text('backgrounds', 'costume / component backgrounds')},
            ...(target && target.component ? target.component.parts.filter(p => p.name !== 'thumb')
                .map(p => ({value: p.name, text: text(`part_${p.name}`, p.name)})) : [])];
    }
    set (args, util) {
        util.target.setStretch({x: Cast.toNumber(args.X), y: Cast.toNumber(args.Y)});
    }
    change (args, util) {
        this.set({X: util.target.stretch.x + Cast.toNumber(args.X),
            Y: util.target.stretch.y + Cast.toNumber(args.Y)}, util);
    }
    setAxis (args, util) {
        if (!['x', 'y'].includes(args.AXIS)) return;
        util.target.setStretch({...util.target.stretch, [args.AXIS]: Cast.toNumber(args.VALUE)});
    }
    changeAxis (args, util) {
        this.setAxis({...args, VALUE: this.axis(args, util) + Cast.toNumber(args.VALUE)}, util);
    }
    axis (args, util) {
        return util.target.stretch[args.AXIS] || 0;
    }
    setBorders (args, util) {
        util.target.setNineSliceMargins({left: Cast.toNumber(args.LEFT),
            right: Cast.toNumber(args.RIGHT),
            top: Cast.toNumber(args.TOP),
            bottom: Cast.toNumber(args.BOTTOM)}, Cast.toString(args.PART));
    }
    setSize (args, util) {
        util.target.setNineSliceSize({width: Cast.toNumber(args.WIDTH), height: Cast.toNumber(args.HEIGHT)});
    }
    setDimension (args, util) {
        if (!['width', 'height'].includes(args.DIMENSION)) return;
        const size = util.target.nineSlice || {width: this.dimension({DIMENSION: 'width'}, util),
            height: this.dimension({DIMENSION: 'height'}, util)};
        util.target.setNineSliceSize({...size, [args.DIMENSION]: Cast.toNumber(args.VALUE)});
    }
    dimension (args, util) {
        if (!['width', 'height'].includes(args.DIMENSION) || util.target.isStage) return 0;
        const target = util.target;
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
        if (!['left', 'right', 'top', 'bottom'].includes(args.BORDER)) return 0;
        const target = util.target;
        const part = target.component && target.component.parts.find(p => (args.PART === '_backgrounds_' ?
            p.name !== 'thumb' : p.name === args.PART));
        const costume = target.getCostumes()[part ? target.getCostumeIndexByName(part.costume) : target.currentCostume];
        return costume && costume.nineSlice ? costume.nineSlice[args.BORDER] : 0;
    }
    enabled (args, util) {
        return !util.target.isStage && Boolean(util.target.nineSlice);
    }
    disable (args, util) {
        util.target.setNineSliceSize(null);
    }
    setPerspectiveCorner (args, util) {
        const index = ['tl', 'tr', 'br', 'bl'].indexOf(args.CORNER);
        if (index < 0) return;
        const corners = util.target.perspective ? util.target.perspective.map(p => p.slice()) :
            [[0, 0], [0, 0], [0, 0], [0, 0]];
        corners[index] = [Cast.toNumber(args.X), Cast.toNumber(args.Y)];
        util.target.setPerspective(corners);
    }
    changePerspectiveCorner (args, util) {
        this.setPerspectiveCorner({...args,
            X: this.perspectiveCorner({...args, AXIS: 'x'}, util) + Cast.toNumber(args.X),
            Y: this.perspectiveCorner({...args, AXIS: 'y'}, util) + Cast.toNumber(args.Y)}, util);
    }
    setPerspective (args, util) {
        util.target.setPerspective(['TL', 'TR', 'BR', 'BL'].map(key =>
            [Cast.toNumber(args[`${key}X`]), Cast.toNumber(args[`${key}Y`])]));
    }
    perspectiveCorner (args, util) {
        const point = util.target.perspective && util.target.perspective[['tl', 'tr', 'br', 'bl'].indexOf(args.CORNER)];
        return point ? point[args.AXIS === 'y' ? 1 : 0] : 0;
    }
    perspectiveEnabled (args, util) {
        return Boolean(util.target.perspective);
    }
    clearPerspective (args, util) {
        util.target.setPerspective(null);
    }
}
module.exports = Stretch;
