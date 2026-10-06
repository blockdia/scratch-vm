const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Renderer = require('../fixtures/component-renderer');
const Stretch = require('../../src/extensions/scratch3_stretch');
const Clipping = require('../../src/extensions/scratch3_clipping');
const Geometry = require('../../src/util/graphic-geometry');
const Model = require('../../src/components/model');

const setup = () => {
    const vm = new VM();
    const renderer = new Renderer();
    renderer.setDrawableContainerPaths = () => {};
    renderer.setDrawableContainerOrder = () => {};
    renderer.getCurrentSkinSize = () => [168, 12];
    renderer.getContainerGeometryFrame = () => ({x: 0, y: 0, width: 100, height: 60});
    vm.attachRenderer(renderer);
    const add = name => {
        const sprite = new Sprite(null, vm.runtime);
        sprite.name = name;
        sprite.costumes = [{name: 'costume', skinId: 0, dataFormat: 'svg', assetId: 'fixture'}];
        const target = sprite.createClone();
        vm.runtime.addTarget(target);
        return target;
    };
    add('Stage').isStage = true;
    const target = add('A//one');
    return {vm, renderer, target, util: {target}, stretch: new Stretch(vm.runtime), clipping: new Clipping(vm.runtime)};
};

test('stretch and nine-slice survive stop, inherit into clones, and keep instance dimensions independent', t => {
    const {vm, target, util, stretch, renderer} = setup();
    stretch.set({TARGET: '_myself_', X: -200, Y: 50}, util);
    stretch.changeAxis({TARGET: '_myself_', AXIS: 'x', VALUE: 50}, util);
    target.setSize(50);
    t.same(target._getRenderedDirectionAndScale().scale, [-75, 25]);
    stretch.setBorders({TARGET: '_myself_', LEFT: 10, RIGHT: 10, TOP: 3, BOTTOM: 3}, util);
    stretch.setSize({TARGET: '_myself_', WIDTH: 240, HEIGHT: 20}, util);
    t.same(renderer._allDrawables[target.drawableID].nineSlice,
        {width: 240, height: 20, left: 10, right: 10, top: 3, bottom: 3});
    const clone = target.makeClone();
    stretch.setDimension({TARGET: '_myself_', DIMENSION: 'width', VALUE: 300}, {target: clone});
    t.equal(target.nineSlice.width, 240);
    t.equal(clone.nineSlice.width, 300);
    t.same(clone.stretch, target.stretch);
    target.onStopAll();
    t.same(target.stretch, {x: -150, y: 50});
    t.equal(target.nineSlice.width, 240);
    stretch.set({TARGET: '_myself_', X: Infinity, Y: 100}, util);
    t.equal(target.stretch.x, -150, 'reject non-finite input atomically');
    stretch.disable({TARGET: '_myself_'}, util);
    t.notOk(renderer._allDrawables[target.drawableID].nineSlice);
    t.ok(target.getCostumes()[0].nineSlice, 'disabling preserves costume borders');
    vm.quit();
    t.end();
});

test('shape blocks address self and public container IDs, including independent runtime containers', t => {
    const {vm, target, util, clipping} = setup();
    vm.setSpriteFolderContainer('A', true);
    const args = {TARGET: '_myself_', SPACE: 'local', X: 5, Y: 10, WIDTH: 100, HEIGHT: 80, RADIUS: 90};
    clipping.roundedRectangle(args, util);
    t.equal(target.clipShape.radius, 40, 'corner radius clamped');
    clipping.setRegion({...args, REGION: 'outside'}, util);
    t.equal(target.clipShape.inverted, true);
    clipping.ellipse(args, util);
    t.equal(target.clipShape.inverted, true, 'changing shape retains region');
    t.equal(clipping.property({...args, PROPERTY: 'type'}, util), 'ellipse');
    const containerArgs = {...args, TARGET: '@container:A', SPACE: 'stage', RADIUS: 20};
    clipping.circle(containerArgs, util);
    const clone = vm.runtime.spriteContainers.createClone('A')[0];
    t.equal(clipping.property({...args, TARGET: '_mycontainer_', PROPERTY: 'radius'}, {target: clone}), 20);
    clipping.clear({TARGET: '_mycontainer_'}, {target: clone});
    t.notOk(clipping.enabled({TARGET: '_mycontainer_'}, {target: clone}));
    t.ok(clipping.enabled(containerArgs, util), 'original container remains clipped');
    target.onStopAll();
    t.equal(target.clipShape.type, 'ellipse');
    clipping.rectangle({...args, WIDTH: 0}, util);
    t.ok(clipping.enabled(args, util), 'empty clip is distinct from disabled');
    clipping.clear(args, util);
    t.equal(clipping.property({...args, PROPERTY: 'width'}, util), 0);
    t.equal(clipping.property({...args, PROPERTY: 'type'}, util), '');
    t.notOk(Geometry.copyClip({...target.clipShape, type: 'unknown'}));
    const stage = vm.runtime.getTargetForStage();
    clipping.circle(args, {target: stage});
    t.notOk(stage.clipShape, 'self on stage is a no-op');
    vm.quit();
    t.end();
});

for (const reference of ['_myself_', '@container:A']) {
    test(`perspective failures preserve state and report actionable warnings for ${reference}`, t => {
        const {vm, target, util, stretch} = setup();
        vm.setSpriteFolderContainer('A', true);
        const logger = vm.runtime.logger;
        const args = {TARGET: reference, CORNER: 'tl', X: 100, Y: 0};
        util.thread = {target, peekStack: () => 'perspective-block'};
        for (let i = 0; i < 3; i++) stretch.setPerspectiveCorner(args, util);
        t.notOk(stretch.perspectiveEnabled(args, util), 'rejected first update does not enable perspective');
        t.equal(stretch.perspectiveCorner({...args, AXIS: 'x'}, util), 0);
        t.equal(logger.getEntries().length, 1);
        t.match(logger.getEntries()[0], {level: 'warn',
            source: 'stretch',
            code: 'INVALID_PERSPECTIVE_QUAD',
            count: 3,
            targetId: target.id,
            originalTargetId: target.id,
            blockId: 'perspective-block',
            subjectName: reference === '_myself_' ? 'A//one' : 'A'});
        t.match(logger.getEntries()[0].message, /all four corners at once/);
        stretch.setPerspectiveCorner({...args, X: 30}, util);
        const previous = stretch.object(reference, target).perspective;
        stretch.changePerspectiveCorner({...args, CORNER: 'tr', X: -80}, util);
        t.same(stretch.object(reference, target).perspective, previous, 'crossing preserves every corner');
        t.ok(stretch.perspectiveEnabled(args, util), 'rejected update preserves enabled state');
        logger.clear();
        for (const x of [1001, -1001, Infinity, -Infinity]) {
            stretch.setPerspectiveCorner({...args, X: x}, util);
            t.same(stretch.object(reference, target).perspective, previous);
        }
        t.match(logger.getEntries()[0], {code: 'INVALID_PERSPECTIVE_OFFSETS', count: 4});
        const allCorners = {TARGET: reference,
            TLX: 150,
            TLY: 0,
            TRX: 150,
            TRY: 0,
            BLX: 150,
            BLY: 0,
            BRX: 150,
            BRY: 0};
        stretch.setPerspective({...allCorners, TLX: 250}, util);
        t.same(stretch.object(reference, target).perspective, previous, 'invalid bulk update is atomic');
        t.equal(logger.getEntries().pop().code, 'INVALID_PERSPECTIVE_QUAD');
        logger.clear();
        for (const x of [150, 1000, -1000]) {
            stretch.setPerspective({...allCorners, TLX: x, TRX: x, BLX: x, BRX: x}, util);
            t.same(stretch.object(reference, target).perspective, [[x, 0], [x, 0], [x, 0], [x, 0]],
                'valid bulk update accepts translation beyond a single-corner boundary');
        }
        stretch.clearPerspective(args, util);
        t.notOk(stretch.perspectiveEnabled(args, util));
        t.equal(stretch.perspectiveCorner({...args, AXIS: 'x'}, util), 0);
        t.same(logger.getEntries(), [], 'successful updates, clear and reporters remain quiet');
        vm.quit();
        t.end();
    });
}

for (const enabled of [false, true]) {
    test(`perspective warnings identify all three commands and continue execution with compiler=${enabled}`, t => {
        const {vm, target, util, stretch} = setup();
        const previousDocument = global.document;
        global.document = {hidden: true};
        t.teardown(() => {
            if (typeof previousDocument === 'undefined') delete global.document;
            else global.document = previousDocument;
        });
        vm.extensionManager.loadExtensionIdSync('stretch');
        vm.setCompilerOptions({enabled});
        vm.setSpriteFolderContainer('A', true);
        for (const reference of ['_myself_', '@container:A']) {
            for (const opcode of ['setPerspectiveCorner', 'changePerspectiveCorner', 'setPerspective']) {
                stretch.clearPerspective({TARGET: reference}, util);
                vm.runtime.logger.clear();
                target.blocks.deleteAllBlocks();
                const args = opcode === 'setPerspective' ?
                    {TLX: 100, TLY: 0, TRX: 0, TRY: 0, BLX: 0, BLY: 0, BRX: 0, BRY: 0} :
                    {X: 100, Y: 0};
                args.TARGET = reference;
                target.blocks.createBlock({id: 'invalid-perspective',
                    opcode: `stretch_${opcode}`,
                    inputs: Object.fromEntries(Object.keys(args).map(name => [name, {name, block: name}])),
                    fields: opcode === 'setPerspective' ? {} : {CORNER: {name: 'CORNER', value: 'tl'}},
                    topLevel: true,
                    shadow: false,
                    parent: null,
                    next: 'after-warning'});
                for (const [name, value] of Object.entries(args)) {
                    target.blocks.createBlock({id: name,
                        opcode: 'text',
                        inputs: {},
                        fields: {TEXT: {name: 'TEXT', value}},
                        topLevel: false,
                        shadow: true,
                        parent: 'invalid-perspective',
                        next: null});
                }
                target.blocks.createBlock({id: 'after-warning',
                    opcode: 'looks_show',
                    inputs: {},
                    fields: {},
                    topLevel: false,
                    shadow: false,
                    parent: 'invalid-perspective',
                    next: null});
                target.setVisible(false);
                const thread = vm.runtime._pushThread('invalid-perspective', target, {stackClick: true});
                for (let i = 0; i < 5; i++) vm.runtime._step();
                t.equal(Boolean(thread.isCompiled), enabled);
                t.ok(target.visible, 'execution continues after the warning');
                t.notOk(stretch.perspectiveEnabled({TARGET: reference}, util));
                t.equal(vm.runtime.logger.getEntries().length, 1);
                t.match(vm.runtime.logger.getEntries()[0], {code: 'INVALID_PERSPECTIVE_QUAD',
                    targetId: target.id,
                    blockId: 'invalid-perspective',
                    subjectName: reference === '_myself_' ? 'A//one' : 'A'});
            }
        }
        vm.quit();
        t.end();
    });
}

test('perspective and masks clone independently, reject invalid quads and track costume lifecycle', t => {
    const {vm, target, util, stretch, clipping, renderer} = setup();
    renderer.getSkinRotationCenter = () => [84, 6];
    target.sprite.costumes.push({name: 'Mask', skinId: 1, dataFormat: 'svg', assetId: 'fixture-mask'});
    stretch.setPerspectiveCorner({TARGET: '_myself_', CORNER: 'tl', X: 20, Y: 0}, util);
    const before = JSON.stringify(target.perspective);
    stretch.setPerspectiveCorner({TARGET: '_myself_', CORNER: 'tr', X: -200, Y: 0}, util);
    t.equal(JSON.stringify(target.perspective), before, 'crossed corners are rejected atomically');
    clipping.setMask({COSTUME: 'Mask', MODE: 'alpha'}, util);
    clipping.setMaskBounds({SPACE: 'stage', X: 10, Y: 20, WIDTH: 90, HEIGHT: 60}, util);
    const clone = target.makeClone();
    stretch.changePerspectiveCorner({TARGET: '_myself_', CORNER: 'tl', X: 5, Y: 0}, {target: clone});
    clipping.setMaskRegion({REGION: 'inverse'}, {target: clone});
    t.equal(target.perspective[0][0], 20);
    t.equal(clone.perspective[0][0], 25);
    t.equal(target.costumeMask.inverted, false);
    target.blocks.createBlock({id: 'mask-menu',
        opcode: 'clipping_menu_costumes',
        fields: {costumes: {name: 'costumes', value: 'Mask'}},
        inputs: {},
        topLevel: true,
        shadow: true,
        parent: null,
        next: null});
    target.renameCostume(1, 'Renamed mask');
    t.equal(target.costumeMask.costume, 'Renamed mask');
    t.equal(clone.costumeMask.costume, 'Renamed mask');
    t.equal(target.blocks.getBlock('mask-menu').fields.costumes.value, 'Renamed mask');
    target.onStopAll();
    t.ok(target.costumeMask && target.perspective, 'stop preserves both states');
    const saved = JSON.parse(vm.toJSON());
    const sprite = saved.targets.find(s => s.name === target.getName());
    t.same(sprite.perspective, target.perspective);
    t.same(sprite.costumeMask, target.costumeMask);
    t.ok(saved.extensions.includes('stretch') && saved.extensions.includes('clipping'));
    target.deleteCostume(1);
    t.notOk(target.costumeMask);
    t.notOk(clone.costumeMask);
    t.notOk(renderer._allDrawables[clone.drawableID].costumeMask, 'deleted source leaves no stale renderer mask');
    vm.quit();
    t.end();
});

test('containers stretch independently of size and preserve nonlinear geometry through clones and SB3', t => {
    const {vm, target, util, stretch, renderer} = setup();
    renderer.getContainerGeometryFrame = () => ({x: 0, y: 0, width: 100, height: 60});
    vm.setSpriteFolderContainer('A', true);
    target.setXY(20, 5);
    target.setSize(80);
    vm.setSpriteContainerTransform('A', {size: 150});
    stretch.set({TARGET: '_mycontainer_', X: 200, Y: 50}, util);
    t.same(target.getWorldPosition(), [60, 3.75], 'member positions use axis stretch');
    t.equal(target.size, 80, 'local size is unchanged');
    t.equal(target.getWorldSize(), 120, 'world size only includes nominal size, not stretch or area');
    target.setWorldSize(90);
    t.equal(target.size, 60, 'setting world size preserves stretch');
    t.same(vm.runtime.spriteContainers.get('A').stretch, {x: 200, y: 50});
    stretch.setBorders({TARGET: '@container:A', LEFT: 10, RIGHT: 10, TOP: 10, BOTTOM: 10}, util);
    stretch.setSize({TARGET: '@container:A', WIDTH: 200, HEIGHT: 100}, util);
    stretch.setPerspective({TARGET: '@container:A',
        TLX: 20,
        TLY: 0,
        TRX: -20,
        TRY: 0,
        BRX: 0,
        BRY: 0,
        BLX: 0,
        BLY: 0}, util);
    const p = target.getWorldPosition();
    const local = target.worldToLocal(...p);
    t.ok(Math.abs(local[0] - target.x) < 1e-6 && Math.abs(local[1] - target.y) < 1e-6,
        'nine-slice and perspective share the inverse coordinate chain');
    t.equal(target.getWorldSize(), 90, 'perspective and nine-slice never redefine size');
    const clone = vm.runtime.spriteContainers.createClone('A')[0];
    stretch.setSize({TARGET: '_mycontainer_', WIDTH: 300, HEIGHT: 100}, {target: clone});
    t.equal(stretch.dimension({TARGET: '@container:A', DIMENSION: 'width'}, util), 200);
    t.equal(stretch.dimension({TARGET: '_mycontainer_', DIMENSION: 'width'}, {target: clone}), 300);
    const saved = JSON.parse(vm.toJSON());
    t.equal(saved.spriteContainers[0].geometry.nineSlice.width, 200);
    t.ok(saved.extensions.includes('stretch'));
    const before = JSON.stringify(saved.spriteContainers[0].geometry);
    t.notOk(vm.setSpriteContainerGeometry('A', {frame: {x: 0, y: 0, width: 0, height: 10}}));
    t.notOk(vm.setSpriteContainerGeometry('A', {perspective: false}), 'invalid values do not clear geometry');
    t.equal(JSON.stringify(vm.runtime.spriteContainers.get('A').geometry), before);
    stretch.set({TARGET: '_mycontainer_', X: 0, Y: 100}, util);
    t.equal(vm.runtime.spriteContainers.convertPoint('//', '_mycontainer_', 0, 0, target), null,
        'collapsed axes have no inverse');
    target.setXY(30, 8);
    target.setWorldPosition(100, 100);
    t.same([target.x, target.y], [30, 8], 'local movement survives collapse; world setter is a no-op');
    stretch.set({TARGET: '_mycontainer_', X: -100, Y: 100}, util);
    t.ok(target.worldToLocal(...target.getWorldPosition()).every(Number.isFinite), 'mirror restores interaction');
    vm.quit();
    t.end();
});

test('stretch requires explicit targets and reference frames only address containers', t => {
    const {vm, target, util, stretch, renderer} = setup();
    renderer.getContainerGeometryFrame = () => ({x: 5, y: 10, width: 100, height: 60});
    vm.setSpriteFolderContainer('A', true);
    stretch.set({X: 200, Y: 50}, util);
    stretch.setSize({WIDTH: 300, HEIGHT: 100}, util);
    stretch.setPerspectiveCorner({CORNER: 'tl', X: 10, Y: 0}, util);
    t.same(target.stretch, {x: 100, y: 100}, 'missing target does not implicitly modify self');
    t.notOk(target.nineSlice);
    t.notOk(target.perspective);
    t.equal(stretch.axis({AXIS: 'x'}, util), 0);
    t.equal(stretch.enabled({}, util), false);
    stretch.change({TARGET: '@container:A', X: 20, Y: -10}, util);
    stretch.changeAxis({TARGET: '@container:A', AXIS: 'x', VALUE: 30}, util);
    t.same(vm.runtime.spriteContainers.get('A').stretch, {x: 150, y: 90});
    t.same(target.stretch, {x: 100, y: 100}, 'compound commands keep the selected container target');
    const frame = {x: 0, y: 0, width: 120, height: 80};
    stretch.setFrame({CONTAINER: '@container:A', X: 0, Y: 0, WIDTH: 120, HEIGHT: 80}, util);
    t.same(vm.runtime.spriteContainers.get('A').geometry.frame, frame);
    stretch.setFrame({TARGET: '@container:A', X: 0, Y: 0, WIDTH: 30, HEIGHT: 40}, util);
    stretch.setFrame({CONTAINER: '_myself_', X: 0, Y: 0, WIDTH: 30, HEIGHT: 40}, util);
    t.same(vm.runtime.spriteContainers.get('A').geometry.frame, frame, 'old target slot is not a frame alias');
    stretch.setDimension({TARGET: '@container:A', DIMENSION: 'width', VALUE: 200}, util);
    t.equal(stretch.dimension({TARGET: '@container:A', DIMENSION: 'height'}, util), 80);
    stretch.changePerspectiveCorner({TARGET: '@container:A', CORNER: 'tl', X: 10, Y: 5}, util);
    t.equal(stretch.perspectiveCorner({TARGET: '@container:A', CORNER: 'tl', AXIS: 'y'}, util), 5);
    const clone = vm.runtime.spriteContainers.createClone('A')[0];
    stretch.fitFrame({CONTAINER: '_mycontainer_'}, {target: clone});
    t.equal(stretch.frame({CONTAINER: '_mycontainer_', PROPERTY: 'width'}, {target: clone}), 100);
    t.equal(stretch.frame({CONTAINER: '@container:A', PROPERTY: 'width'}, util), 120);
    t.notOk(stretch.containers().some(item => item.value === '_myself_'));
    vm.quit();
    t.end();
});

test('clearing inactive container effects does not capture geometry, including runtime clones', t => {
    const {vm, target, util, stretch, renderer} = setup();
    vm.setSpriteFolderContainer('A', true);
    const clone = vm.runtime.spriteContainers.createClone('A')[0];
    let captures = 0;
    let width = 100;
    renderer.getContainerGeometryFrame = () => {
        captures++;
        return {x: 5, y: 10, width, height: 60};
    };
    const containers = vm.runtime.spriteContainers;
    for (const owner of [target, clone]) {
        const ownerUtil = {target: owner};
        const id = containers.resolveReference('_mycontainer_', owner);
        stretch.disable({TARGET: '_mycontainer_'}, ownerUtil);
        stretch.clearPerspective({TARGET: '_mycontainer_'}, ownerUtil);
        t.notOk(containers.get(id).geometry, 'resetting absent effects leaves no stored frame');
    }
    t.equal(captures, 0, 'reset commands never measure content');
    width = 250;
    stretch.setSize({TARGET: '@container:A', WIDTH: 300, HEIGHT: 100}, util);
    t.equal(containers.get('A').geometry.frame.width, 250, 'first enabled effect uses current content');
    t.notOk(containers.setGeometry('A', {frame: null}), 'an explicitly invalid frame is still rejected');
    width = 400;
    stretch.disable({TARGET: '@container:A'}, util);
    stretch.clearPerspective({TARGET: '@container:A'}, util);
    t.equal(containers.get('A').geometry.frame.width, 250, 'clearing existing geometry preserves its frame');
    stretch.fitFrame({CONTAINER: '@container:A'}, util);
    t.equal(containers.get('A').geometry.frame.width, 400, 'explicit reset captures current content');
    stretch.setBorders({TARGET: '_mycontainer_', LEFT: 5, RIGHT: 5, TOP: 5, BOTTOM: 5}, {target: clone});
    const cloneId = containers.resolveReference('_mycontainer_', clone);
    t.equal(containers.get(cloneId).geometry.frame.width, 400, 'setting borders intentionally captures a frame');
    width = 500;
    stretch.setSize({TARGET: '_mycontainer_', WIDTH: 600, HEIGHT: 100}, {target: clone});
    t.equal(containers.get(cloneId).geometry.frame.width, 400, 'later size changes keep the border reference');
    t.same(vm.runtime.logger.getEntries(), []);
    vm.quit();
    t.end();
});

test('mask warnings preserve state, identify the caller and stay quiet for successful operations', t => {
    const {vm, target, util, clipping, renderer} = setup();
    renderer.getSkinRotationCenter = () => [84, 6];
    util.thread = {target, peekStack: () => 'mask-command'};
    const bounds = {SPACE: 'local', X: 0, Y: 0, WIDTH: 100, HEIGHT: 60};
    const logger = vm.runtime.logger;
    for (let i = 0; i < 3; i++) clipping.setMaskBounds(bounds, util);
    t.notOk(target.costumeMask);
    t.match(logger.getEntries()[0], {code: 'MASK_NOT_SET',
        source: 'clipping',
        level: 'warn',
        count: 3,
        targetId: target.id,
        blockId: 'mask-command',
        subjectName: target.getName()});
    clipping.setMaskRegion({REGION: 'inverse'}, util);
    t.equal(logger.getEntries()[0].count, 4);
    logger.clear();
    clipping.setMask({COSTUME: '_current_', MODE: 'alpha'}, util);
    clipping.setMaskBounds(bounds, util);
    clipping.setMaskRegion({REGION: 'inverse'}, util);
    const before = {...target.costumeMask};
    t.same(logger.getEntries(), [], 'valid configuration is quiet');
    clipping.setMask({COSTUME: 'missing', MODE: 'alpha'}, util);
    t.equal(logger.getEntries()[0].code, 'MASK_COSTUME_NOT_FOUND');
    for (const patch of [{WIDTH: 0}, {HEIGHT: -1}, {X: Infinity}, {WIDTH: Infinity}]) {
        clipping.setMaskBounds({...bounds, ...patch}, util);
        t.same(target.costumeMask, before, 'invalid bounds preserve the entire mask');
    }
    t.match(logger.getEntries()[1], {code: 'INVALID_MASK_BOUNDS', count: 4});
    target.sprite.costumes.push({name: 'other', skinId: 1});
    target.setCostume(1);
    t.same(target.costumeMask, before, 'costume switches keep the source and bounds');
    clipping.setMask({COSTUME: '_current_', MODE: 'alpha'}, util);
    t.same(target.costumeMask, {...before, costume: 'other'}, 'selecting a new source retains the bounds');
    logger.clear();
    clipping.clearMask({}, util);
    clipping.clearMask({}, util);
    t.equal(clipping.maskEnabled({}, util), false);
    t.equal(clipping.maskProperty({PROPERTY: 'width'}, util), 0);
    t.same(logger.getEntries(), [], 'clearing and reporting are quiet');
    vm.quit();
    t.end();
});

for (const enabled of [false, true]) {
    test(`clipping prerequisites warn at the executing block and continue with compiler=${enabled}`, t => {
        const {vm, target} = setup();
        const previousDocument = global.document;
        global.document = {hidden: true};
        t.teardown(() => {
            if (typeof previousDocument === 'undefined') delete global.document;
            else global.document = previousDocument;
        });
        vm.extensionManager.loadExtensionIdSync('clipping');
        vm.setCompilerOptions({enabled});
        vm.setSpriteFolderContainer('A', true);
        for (const [opcode, args, fields, code, subjectName] of [
            ['setMaskBounds', {X: 0, Y: 0, WIDTH: 100, HEIGHT: 60}, {SPACE: 'local'}, 'MASK_NOT_SET', target.getName()],
            ['setMaskRegion', {}, {REGION: 'inverse'}, 'MASK_NOT_SET', target.getName()],
            ['setRegion', {TARGET: '_myself_'}, {REGION: 'outside'}, 'CLIP_NOT_SET', target.getName()],
            ['setRegion', {TARGET: '@container:A'}, {REGION: 'outside'}, 'CLIP_NOT_SET', 'A']
        ]) {
            vm.runtime.logger.clear();
            target.blocks.deleteAllBlocks();
            target.blocks.createBlock({id: 'clipping-warning',
                opcode: `clipping_${opcode}`,
                inputs: Object.fromEntries(Object.keys(args).map(name => [name, {name, block: name}])),
                fields: Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, {name, value}])),
                topLevel: true,
                shadow: false,
                parent: null,
                next: 'after-warning'});
            for (const [name, value] of Object.entries(args)) {
                target.blocks.createBlock({id: name,
                    opcode: 'text',
                    inputs: {},
                    fields: {TEXT: {name: 'TEXT', value}},
                    topLevel: false,
                    shadow: true,
                    parent: 'clipping-warning',
                    next: null});
            }
            target.blocks.createBlock({id: 'after-warning',
                opcode: 'looks_show',
                inputs: {},
                fields: {},
                topLevel: false,
                shadow: false,
                parent: 'clipping-warning',
                next: null});
            target.setVisible(false);
            const thread = vm.runtime._pushThread('clipping-warning', target, {stackClick: true});
            for (let i = 0; i < 5; i++) vm.runtime._step();
            t.equal(Boolean(thread.isCompiled), enabled);
            t.ok(target.visible, 'the next command still executes');
            t.notOk(target.costumeMask);
            t.notOk(target.clipShape);
            t.equal(vm.runtime.logger.getEntries().length, 1);
            t.match(vm.runtime.logger.getEntries()[0], {code,
                subjectName,
                blockId: 'clipping-warning',
                targetId: target.id,
                source: 'clipping'});
        }
        vm.quit();
        t.end();
    });
}

test('component borders have explicit part blocks and never fall back to another costume', async t => {
    const {vm, target, util, stretch} = setup();
    await vm.extensionManager.loadExtensionURL('stretch');
    const palette = () => vm.runtime.getBlocksXML(target).find(category => category.id === 'stretch').xml;
    t.notMatch(palette(), 'stretch_setPartBorders', 'ordinary sprites do not expose component-only blocks');
    t.notMatch(palette(), 'stretch_partBorder');
    target.sprite.costumes = ['track', 'fill', 'thumb'].map((name, skinId) => ({name, skinId}));
    target.setComponent(Model.create('slider'));
    vm.runtime.setEditingTarget(target);
    t.match(palette(), 'stretch_setPartBorders');
    t.match(palette(), 'stretch_partBorder');
    t.same(stretch.parts().map(item => item.value), ['track', 'fill']);
    const borders = {LEFT: 8, RIGHT: 9, TOP: 3, BOTTOM: 4};
    stretch.setBorders({TARGET: '_myself_', ...borders}, util);
    t.same(target.getCostumes().map(costume => costume.nineSlice && costume.nineSlice.left), [8, 8, undefined]);
    stretch.setPartBorders({PART: 'fill', ...borders, LEFT: 12}, util);
    t.equal(stretch.partBorder({PART: 'track', BORDER: 'left'}, util), 8);
    t.equal(stretch.partBorder({PART: 'fill', BORDER: 'left'}, util), 12);
    for (const PART of ['_backgrounds_', 'body', 'thumb', '']) {
        stretch.setPartBorders({PART, ...borders, LEFT: 20}, util);
        t.equal(stretch.partBorder({PART, BORDER: 'left'}, util), 0, 'invalid part has no fallback');
    }
    t.same(target.getCostumes().map(costume => costume.nineSlice && costume.nineSlice.left), [8, 12, undefined]);
    vm.quit();
});
