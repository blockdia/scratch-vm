const test = require('tap').test;
const Model = require('../../src/components/model');
const Extension = require('../../src/extensions/scratch3_components');
const Runtime = require('../../src/engine/runtime');
const Sprite = require('../../src/sprites/sprite');
const RenderWebGL = require('../fixtures/component-renderer');
const sb3 = require('../../src/serialization/sb3');
const Pen = require('../../src/extensions/scratch3_pen');

const setup = () => {
    const runtime = new Runtime();
    const renderer = new RenderWebGL();
    runtime.attachRenderer(renderer);
    const sprite = new Sprite(null, runtime);
    sprite.name = 'Slider';
    sprite.costumes = [0, 1, 2, 3, 4].map(skinId => ({name: ['track', 'fill', 'thumb', 'body', 'mark'][skinId],
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
    t.equal(Model.normalize(config, ['track', 'fill', 'thumb'].map(name => ({name}))).properties.value, 0.4);
    t.equal(config.properties.value, 0.36, 'validation does not mutate caller');
    config.properties.max = -1;
    t.throws(() => Model.normalize(config, ['track', 'fill', 'thumb'].map(name => ({name}))));
    config.properties.max = 1;
    config.metadata.sliderTrack.end = [-84, 0];
    t.throws(() => Model.normalize(config, ['track', 'fill', 'thumb'].map(name => ({name}))));
    t.throws(() => Model.normalize(Model.create('slider'), [{name: 'track'}, {name: 'fill'}]));
    t.same(Model.getScriptableProperties('slider', 'number'), ['value', 'min', 'max', 'step']);
    t.same(Model.getScriptableProperties('progress', 'number'), ['value', 'min', 'max']);
    t.same(Model.getScriptableProperties('toggle', 'boolean'), ['checked']);
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
    t.same(target.component.parts.map(p => p.costume), ['track', 'fill', 'thumb']);
    t.same(other.component.parts.map(p => p.costume), ['track', 'fill', 'thumb']);
    const saved = sb3.serialize(runtime);
    t.same(saved.targets[0].component, target.component);
    t.notOk(JSON.stringify(saved).includes('componentController'));
    t.end();
});

test('pointer capture, stepping and cancellation', t => {
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
    t.notOk(events.some(([opcode]) => opcode.startsWith('components_')), 'value changes do not start component hats');
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
    const extension = new Extension(runtime);
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
    extension.setTargetChecked({TARGET: '_myself_', CHECKED: 'false'}, util);
    t.notOk(extension.targetIsChecked({TARGET: '_myself_'}, util));
    extension.setTargetChecked({TARGET: '_myself_', CHECKED: true}, util);
    t.ok(extension.targetIsChecked({TARGET: '_myself_'}, util));
    target.componentController.setProperties({disabled: true});
    target.componentController.pointer({isDown: true}, 0, 0);
    t.notOk(target.componentController.pressed);
    target.setComponent(Model.create('progress'));
    runtime.setEditingTarget(target);
    t.same(extension.numericProperties(target.id, {TARGET: '_myself_'}).map(item => item.value),
        ['value', 'min', 'max'], 'progress property menu follows its declaration');
    extension.setTargetProperty({TARGET: '_myself_', PROPERTY: 'value', VALUE: 200}, util);
    t.equal(extension.targetProperty({TARGET: '_myself_', PROPERTY: 'value'}, util), 100);
    extension.setTargetProperty({TARGET: '_myself_', PROPERTY: 'step', VALUE: 2}, util);
    t.equal(extension.targetProperty({TARGET: '_myself_', PROPERTY: 'step'}, util), 0,
        'undeclared progress properties are unavailable');
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


test('fill stays centered and unscaled while progress changes its clip', t => {
    const {target, renderer} = setup();
    const [track, fill] = target.getDrawableIDs().map(id => renderer._allDrawables[id]);
    target.setDirection(0);
    target.setSize(150);
    target.componentController.setProperties({value: 25});
    t.same(fill._position, track._position);
    t.same(fill.scale, track.scale);
    t.equal(fill.direction, track.direction);
    t.same(fill.clipPlane, [1, 0, -42]);
    target.componentController.setProperties({value: 100});
    t.equal(fill.clipPlane, null, 'full value retains rounded end caps');
    target.componentController.setProperties({value: 0});
    t.notOk(fill._visible);
    target.component.metadata.sliderTrack = {start: [0, -50], end: [0, 50]};
    target.componentController.setProperties({value: 75});
    t.same(fill.clipPlane, [0, 1, 25]);
    t.same(fill._position, track._position, 'diagonal or vertical guides do not rotate the artwork');
    t.end();
});


test('cross-component properties, menus, events and clone self resolution', t => {
    const {runtime, target} = setup();
    runtime.setEditingTarget(target);
    const extension = new Extension(runtime);
    const clone = target.makeClone();
    runtime.targets.push(clone);
    const util = {target: clone};
    const events = [];
    runtime.startHats = (opcode, fields, owner) => events.push([opcode, owner]);
    extension.changeTargetProperty({TARGET: '_myself_', PROPERTY: 'value', VALUE: 5}, util);
    t.equal(clone.component.properties.value, 55);
    t.equal(target.component.properties.value, 50);
    extension.changeTargetProperty({TARGET: 'Slider', PROPERTY: 'value', VALUE: 10}, util);
    t.equal(target.component.properties.value, 60);
    t.equal(events.length, 0, 'numeric properties do not have component change hats');
    t.equal(extension.targetProperty({TARGET: '_myself_', PROPERTY: 'value'}, util), 55);
    extension.setTargetProperty({TARGET: 'Slider', PROPERTY: 'max', VALUE: 70}, util);
    extension.changeTargetProperty({TARGET: 'Slider', PROPERTY: 'value', VALUE: 99}, util);
    t.equal(target.component.properties.value, 70, 'clamping uses standard component setter');
    extension.setTargetProperty({TARGET: 'Slider', PROPERTY: 'min', VALUE: 100}, util);
    t.equal(target.component.properties.min, 0, 'invalid ranges are ignored');
    extension.setTargetProperty({TARGET: 'Slider', PROPERTY: 'step', VALUE: -1}, util);
    t.equal(target.component.properties.step, 1);
    t.equal(extension.targetProperty({TARGET: 'missing', PROPERTY: 'value'}, util), 0);
    t.doesNotThrow(() => extension.setTargetProperty({TARGET: 'missing', PROPERTY: 'value', VALUE: 1}, util));
    t.equal(extension.numericTargets().filter(item => item.value === 'Slider').length, 0,
        'the current original and its clones are not repeated by name');
    t.same(extension.numericProperties(target.id, {TARGET: '_myself_'}).map(item => item.value),
        ['value', 'min', 'max', 'step']);
    target.setComponent(Model.create('toggle'));
    extension.setTargetChecked({TARGET: 'Slider', CHECKED: true}, util);
    t.ok(extension.targetIsChecked({TARGET: 'Slider'}, util));
    t.same(events, [['components_whenStateChanged', target]], 'checked hats belong to the destination');
    t.notOk(extension.targetIsChecked({TARGET: '_myself_'}, util));
    t.equal(extension.targetProperty({TARGET: 'Slider', PROPERTY: 'value'}, util), 0);
    target.sprite.name = 'Renamed';
    t.same(extension.toggleTargets().map(item => item.value), ['_myself_'],
        'the renamed editing target remains represented only by myself');
    t.notOk(extension.targetIsChecked({TARGET: 'Slider'}, util), 'names follow standard Scratch target lookup');
    clone.dispose();
    t.end();
});


test('component menu shadows follow sprite renames without rewriting text inputs', t => {
    const {target} = setup();
    for (const menu of ['numericTargets', 'toggleTargets']) {
        target.blocks.createBlock({id: menu,
            opcode: `components_menu_${menu}`,
            inputs: {},
            fields: {[menu]: {name: menu, value: 'Slider'}},
            shadow: true,
            topLevel: false});
    }
    target.blocks.createBlock({id: 'text',
        opcode: 'text',
        inputs: {},
        fields: {TEXT: {name: 'TEXT', value: 'Slider'}},
        shadow: true,
        topLevel: false});
    target.blocks.updateAssetName('Slider', 'Renamed', 'sprite');
    for (const menu of ['numericTargets', 'toggleTargets']) {
        t.equal(target.blocks.getBlock(menu).fields[menu].value, 'Renamed');
    }
    t.equal(target.blocks.getBlock('text').fields.TEXT.value, 'Slider');
    t.end();
});


test('named bindings survive edits and invalid references fail', t => {
    const {target, runtime} = setup();
    const clone = target.makeClone();
    runtime.targets.push(clone);
    target.renameCostume(0, 'fill');
    const name = target.getCostumes()[0].name;
    t.not(name, 'fill', 'rename resolves conflicts');
    t.equal(target.component.parts[0].costume, name);
    t.equal(clone.component.parts[0].costume, name);
    target.addCostume({name: 'extra', skinId: 99}, 0);
    target.reorderCostume(1, 4);
    target.componentController.sync();
    t.equal(target.component.parts[0].costume, name);
    t.equal(target.deleteCostume(target.getCostumeIndexByName(name)), null);
    t.equal(target.deleteCostume(0).name, 'extra');
    const config = Model.copy(target.component);
    t.throws(() => Model.normalize(config, []), 'missing references fail');
    const bound = target.getCostumes().find(costume => costume.name === name);
    t.throws(() => Model.normalize(config, target.getCostumes().concat(bound)), 'ambiguous references fail');
    config.parts[0] = {name: 'track', costumeIndex: 0, collision: true};
    t.throws(() => Model.normalize(config, target.getCostumes()), 'numeric references are unsupported');
    t.end();
});

test('component size limits use local geometry and the full thumb travel', t => {
    const {target, renderer, runtime} = setup();
    runtime.setRuntimeOptions({fencing: true});
    renderer.getSkinSize = id => (id === 2 ? [28, 28] : [180, 12]);
    renderer.getSkinRotationCenter = id => (id === 2 ? [14, 14] : [90, 6]);
    const limit = 720 / 196 * 100;
    for (const direction of [90, 0, 45, -90]) {
        target.setDirection(direction);
        for (const value of [0, 50, 100]) {
            target.componentController.setProperties({value});
            target.setSize(400);
            t.equal(target.size, limit, 'maximum is independent of direction and value');
            target.setSize(1);
            t.equal(target.size, 5 / 28 * 100, 'minimum is independent of rotation');
        }
    }
    runtime.setRuntimeOptions({fencing: false});
    target.setSize(1000);
    t.equal(target.size, 1000, 'unrestricted size stays unrestricted');
    t.end();
});

test('pen stamps active parts in order even when hidden or non-collidable', t => {
    const {target, renderer, runtime} = setup();
    const pen = new Pen(runtime);
    pen._getPenLayerID = () => 42;
    let stamped = [];
    renderer.penStamp = (skin, id) => stamped.push(id);
    const check = expected => {
        stamped = [];
        pen._stamp(target);
        t.same(stamped, expected);
    };
    const ids = target.getDrawableIDs();
    check(ids);
    target.setVisible(false);
    target.component.parts[2].collision = false;
    check(ids);
    target.componentController.setProperties({value: 0});
    check([ids[0], ids[2]]);
    target.setComponent(Model.create('toggle'));
    const toggleIDs = target.getDrawableIDs();
    check([toggleIDs[0]]);
    target.componentController.setProperties({checked: true});
    check(toggleIDs);
    stamped = [];
    pen._stamp({drawableID: 123});
    t.same(stamped, [123], 'ordinary sprite stamping is unchanged');
    t.end();
});
