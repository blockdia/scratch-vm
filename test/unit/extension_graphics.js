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
