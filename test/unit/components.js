const test = require('tap').test;
const Model = require('../../src/components/model');
const Extension = require('../../src/extensions/scratch3_components');
const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite');
const RenderWebGL = require('../fixtures/component-renderer');
const sb3 = require('../../src/serialization/sb3');

const setup = () => {
    const runtime = new Runtime();
    const renderer = new RenderWebGL();
    runtime.attachRenderer(renderer);
    const sprite = new Sprite(null, runtime);
    sprite.name = 'Slider';
    sprite.costumes = [0, 1, 2].map(skinId => ({name: String(skinId),
        skinId,
        assetId: String(skinId),
        dataFormat: 'svg',
        rotationCenterX: 0,
        rotationCenterY: 0}));
    const target = sprite.createClone();
    runtime.targets.push(target);
    target.setComponent(Model.create('slider'));
    return {runtime, renderer, target};
};

test('validation and stepped values', t => {
    const config = Model.create('slider');
    config.properties = {min: -1, max: 1, value: 0.36, step: 0.1, clickTrackToJump: true};
    t.equal(Model.normalize(config, 3).properties.value, 0.4);
    t.equal(config.properties.value, 0.36, 'validation does not mutate caller');
    config.properties.max = -1;
    t.throws(() => Model.normalize(config, 3));
    config.properties.max = 1;
    config.metadata.sliderTrack.end = [-84, 0];
    t.throws(() => Model.normalize(config, 3));
    t.throws(() => Model.normalize(Model.create('slider'), 2));
    t.end();
});

test('part transforms, effects, independent clones and disposal', t => {
    const {target, renderer, runtime} = setup();
    runtime.setRuntimeOptions({fencing: false});
    target.componentController.setProperties({value: 100});
    target.setXY(20, 30);
    target.setDirection(0);
    const thumb = renderer._allDrawables[target.getDrawableIDs()[2]];
    t.ok(Math.abs(thumb._position[0] - 20) < 0.001);
    t.ok(Math.abs(thumb._position[1] - 114) < 0.001);
    t.same(target.componentController.localPoint(20, 114).map(Math.round), [84, 0]);
    target.setRotationStyle('left-right');
    target.setDirection(-90);
    t.same(Array.from(thumb._position), [-64, 30]);
    target.setEffect('ghost', 50);
    for (const id of target.getDrawableIDs()) t.equal(renderer._allDrawables[id]._uniforms.ghost, 50);
    const clone = target.makeClone();
    runtime.targets.push(clone);
    clone.componentController.setProperties({value: 0});
    t.equal(target.component.properties.value, 100);
    t.notSame(clone.getDrawableIDs(), target.getDrawableIDs());
    t.equal(runtime.getTargetByDrawableId(clone.getDrawableIDs()[2]), clone);
    target.setVisible(false);
    for (const id of target.getDrawableIDs()) t.notOk(renderer._allDrawables[id]._visible);
    clone.dispose();
    t.equal(renderer._drawableGroups.size, 1);
    t.end();
});

test('sensing expands parts, excludes self, and costume references survive reorder', t => {
    const {target, renderer, runtime} = setup();
    const other = target.makeClone();
    runtime.targets.push(other);
    const seen = [];
    renderer.isTouchingDrawables = (id, candidates) => {
        seen.push(candidates);
        return id === target.getDrawableIDs()[2];
    };
    t.ok(target.isTouchingSprite('Slider'));
    t.same(seen[0], other.getDrawableIDs(true));
    t.notOk(seen[0].some(id => target.getDrawableIDs().includes(id)));
    renderer.isTouchingColor = (id, color, mask, excluded) => {
        t.same(excluded, target.getDrawableIDs());
        return true;
    };
    t.ok(target.isTouchingColor([255, 0, 0]));
    t.equal(target.deleteCostume(1), null);
    target.reorderCostume(0, 2);
    t.same(target.component.parts.map(p => p.costumeIndex), [2, 0, 1]);
    t.same(other.component.parts.map(p => p.costumeIndex), [2, 0, 1]);
    const saved = sb3.serialize(runtime);
    t.same(saved.targets[0].component, target.component);
    t.notOk(JSON.stringify(saved).includes('componentController'));
    t.end();
});

test('pointer capture, stepping, event ownership and cancellation', t => {
    const {runtime, target, renderer} = setup();
    const events = [];
    runtime.startHats = (opcode, fields, owner) => events.push([opcode, owner]);
    renderer.pick = () => target.getDrawableIDs()[2];
    renderer.drawableTouching = (id, x) => x >= 156 && x <= 324;
    const mouse = runtime.ioDevices.mouse;
    const post = data => mouse.postData(Object.assign({x: 240, y: 180, canvasWidth: 480, canvasHeight: 360}, data));
    post({isDown: true});
    post({x: 324});
    t.equal(target.component.properties.value, 100);
    t.equal(mouse.componentCapture, target.componentController);
    t.ok(events.some(([opcode, owner]) => opcode === 'components_whenValueChanged' && owner === target));
    const count = events.length;
    post({x: 324});
    t.equal(events.length, count, 'unchanged value does not retrigger hats');
    post({x: 600, isDown: false});
    t.equal(mouse.componentCapture, null, 'outside release clears capture');
    post({isDown: true});
    post({cancelled: true});
    t.notOk(mouse.getIsDown());
    t.notOk(target.componentController.pressed);
    post({isDown: true});
    target.setVisible(false);
    t.equal(mouse.componentCapture, null);
    t.end();
});

test('button, toggle, progress and block setters', t => {
    const {runtime, target, renderer} = setup();
    const extension = new Extension();
    const util = {target};
    const events = [];
    runtime.startHats = opcode => events.push(opcode);
    renderer.drawableTouching = () => true;
    target.setComponent(Model.create('button'));
    target.componentController.pointer({isDown: true, x: 240, y: 180}, 0, 0);
    t.notOk(events.includes('components_whenClicked'));
    target.componentController.pointer({isDown: false, x: 240, y: 180}, 0, 0);
    t.same(events, ['components_whenClicked']);
    target.setComponent(Model.create('toggle'));
    extension.setChecked({CHECKED: 'false'}, util);
    t.notOk(extension.isChecked({}, util));
    extension.setChecked({CHECKED: true}, util);
    t.ok(extension.isChecked({}, util));
    target.componentController.setProperties({disabled: true});
    target.componentController.pointer({isDown: true}, 0, 0);
    t.notOk(target.componentController.pressed);
    target.setComponent(Model.create('progress'));
    extension.setValue({VALUE: 200}, util);
    t.equal(extension.value({}, util), 100);
    target.componentController.pointer({isDown: true}, 0, 0);
    t.notOk(target.componentController.pressed);
    t.end();
});

test('draggable components keep click behavior and standard drag cancels only the active gesture', t => {
    const {runtime, target, renderer} = setup();
    renderer.pick = () => target.drawableID;
    renderer.drawableTouching = () => true;
    const events = [];
    runtime.startHats = opcode => events.push(opcode);
    const post = data => runtime.ioDevices.mouse.postData(Object.assign({x: 240,
        y: 180,
        canvasWidth: 480,
        canvasHeight: 360}, data));
    for (const draggable of [false, true]) {
        target.setComponent(Model.create('button'));
        target.setDraggable(draggable);
        events.length = 0;
        post({isDown: true});
        t.equal(events.includes('event_whenthisspriteclicked'), !draggable, 'normal Scratch click timing');
        post({isDown: false});
        t.ok(events.includes('event_whenthisspriteclicked'), 'Scratch click hat still fires');
        t.ok(events.includes('components_whenClicked'), 'component click fires for either draggable setting');
        events.length = 0;
        post({isDown: true});
        target.startDrag();
        t.equal(runtime.ioDevices.mouse.componentCapture, null, 'standard Target drag releases component capture');
        target.stopDrag();
        post({isDown: false, wasDragged: true});
        t.notOk(events.includes('components_whenClicked'), 'drag release is not a component click');
        t.equal(events.filter(opcode => opcode === 'event_whenthisspriteclicked').length, draggable ? 0 : 1,
            'drag does not add or suppress ordinary click hats');
    }
    target.setComponent(Model.create('slider'));
    target.setDraggable(true);
    post({isDown: true});
    post({x: 282});
    t.equal(target.component.properties.value, 75, 'draggable alone does not disable internal input');
    target.startDrag();
    target.stopDrag();
    post({x: 324, isDown: false, wasDragged: true});
    t.equal(target.component.properties.value, 75, 'no late slider update after ordinary dragging');
    t.end();
});
