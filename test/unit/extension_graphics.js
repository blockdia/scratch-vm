const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Renderer = require('../fixtures/component-renderer');
const Stretch = require('../../src/extensions/scratch3_stretch');
const Clipping = require('../../src/extensions/scratch3_clipping');
const Geometry = require('../../src/util/graphic-geometry');

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
    stretch.set({X: -200, Y: 50}, util);
    stretch.changeAxis({AXIS: 'x', VALUE: 50}, util);
    target.setSize(50);
    t.same(target._getRenderedDirectionAndScale().scale, [-75, 25]);
    stretch.setBorders({LEFT: 10, RIGHT: 10, TOP: 3, BOTTOM: 3, PART: '_backgrounds_'}, util);
    stretch.setSize({WIDTH: 240, HEIGHT: 20}, util);
    t.same(renderer._allDrawables[target.drawableID].nineSlice,
        {width: 240, height: 20, left: 10, right: 10, top: 3, bottom: 3});
    const clone = target.makeClone();
    stretch.setDimension({DIMENSION: 'width', VALUE: 300}, {target: clone});
    t.equal(target.nineSlice.width, 240);
    t.equal(clone.nineSlice.width, 300);
    t.same(clone.stretch, target.stretch);
    target.onStopAll();
    t.same(target.stretch, {x: -150, y: 50});
    t.equal(target.nineSlice.width, 240);
    stretch.set({X: Infinity, Y: 100}, util);
    t.equal(target.stretch.x, -150, 'reject non-finite input atomically');
    stretch.disable({}, util);
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
    stretch.setPerspectiveCorner({CORNER: 'tl', X: 20, Y: 0}, util);
    const before = JSON.stringify(target.perspective);
    stretch.setPerspectiveCorner({CORNER: 'tr', X: -200, Y: 0}, util);
    t.equal(JSON.stringify(target.perspective), before, 'crossed corners are rejected atomically');
    clipping.setMask({COSTUME: 'Mask', MODE: 'alpha'}, util);
    clipping.setMaskBounds({SPACE: 'stage', X: 10, Y: 20, WIDTH: 90, HEIGHT: 60}, util);
    const clone = target.makeClone();
    stretch.changePerspectiveCorner({CORNER: 'tl', X: 5, Y: 0}, {target: clone});
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
