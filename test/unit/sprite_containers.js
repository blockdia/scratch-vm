const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Model = require('../../src/components/model');
const ComponentRenderer = require('../fixtures/component-renderer');
const CloneOption = require('../../src/util/container-clone-option');

const setup = () => {
    const vm = new VM();
    const renderer = new ComponentRenderer();
    renderer.setDrawableContainerPaths = (layer, memberships) => {
        renderer.memberships = memberships;
    };
    renderer.setDrawableContainerOrder = (...args) => {
        renderer.containerOrder = args;
    };
    vm.attachRenderer(renderer);
    const add = name => {
        const sprite = new Sprite(null, vm.runtime);
        sprite.name = name;
        sprite.costumes = ['track', 'fill', 'thumb'].map((costume, skinId) =>
            ({name: costume, skinId, assetId: String(skinId), dataFormat: 'svg'}));
        const target = sprite.createClone();
        vm.runtime.addTarget(target);
        target.updateAllDrawableProperties();
        return target;
    };
    return {vm, renderer, add};
};

test('container visibility composes without overwriting sprite or child container visibility', t => {
    const {vm, renderer, add} = setup();
    const outer = add('A//plain//one');
    const inner = add('A//B//two');
    const outside = add('AB//outside');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//B', true);
    t.same(renderer.memberships.map(entry => entry.containers), [['A'], ['A', 'A//B'], []]);
    inner.setComponent(Model.create('slider'));
    vm.setSpriteContainerVisible('A', false);
    t.ok(inner.visible, 'own visibility preserved');
    t.notOk(inner.isEffectivelyVisible());
    t.notOk(outer.isEffectivelyVisible());
    t.ok(outside.isEffectivelyVisible(), 'path boundary is respected');
    inner.setVisible(true);
    inner.setXY(10, 10);
    for (const id of inner.getDrawableIDs()) t.notOk(renderer._allDrawables[id]._visible);
    outer.setVisible(false);
    vm.setSpriteContainerVisible('A//B', false);
    vm.setSpriteContainerVisible('A', true);
    t.notOk(outer.isEffectivelyVisible(), 'own hide survives parent show');
    t.notOk(inner.isEffectivelyVisible(), 'inner hide survives parent show');
    vm.setSpriteFolderContainer('A//B', false);
    t.ok(inner.isEffectivelyVisible(), 'conversion removes only this visibility constraint');
    t.same(vm.runtime.spriteContainers.serialize(), [{path: 'A', visible: true}]);
    vm.quit();
    t.end();
});

test('sprite clones inherit membership, component replacement and renames update drawable membership', t => {
    const {vm, renderer, add} = setup();
    const target = add('A//one');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteContainerVisible('A', false);
    const clone = target.makeClone();
    vm.runtime.addTarget(clone);
    t.notOk(renderer._allDrawables[clone.drawableID]._visible, 'clone starts hidden');
    t.same(renderer.memberships.find(entry => entry.drawables.includes(clone.drawableID)).containers, ['A']);
    target.setComponent(Model.create('slider'));
    t.same(renderer.memberships.find(entry => entry.drawables.includes(target.drawableID)).drawables,
        target.getDrawableIDs());
    vm.renameSprite(target.id, 'outside');
    t.ok(target.isEffectivelyVisible());
    t.ok(clone.isEffectivelyVisible(), 'sprite rename also reparents live clones');
    t.same(renderer.memberships.map(entry => entry.containers), [[], []]);
    vm.quit();
    t.end();
});

test('metadata validates paths, follows folder moves, and clears with the project', t => {
    const {vm, add} = setup();
    const target = add('A//B//one');
    const containers = vm.runtime.spriteContainers;
    containers.load([null, {}, {path: 'A////B'}, {path: '//bad'}, {path: '__proto__'},
        {path: 'A', visible: false}, {path: 'A//B'}]);
    t.same(containers.serialize(), [{path: 'A', visible: false}, {path: 'A//B', visible: true}]);
    containers.beginUpdate();
    containers.move('A', 'C');
    vm.renameSprite(target.id, 'C//B//one');
    containers.endUpdate();
    t.notOk(target.isEffectivelyVisible());
    t.same(containers.serialize(), [{path: 'C', visible: false}, {path: 'C//B', visible: true}]);
    containers.beginUpdate();
    containers.move('C', '', true);
    vm.renameSprite(target.id, 'B//one');
    containers.endUpdate();
    t.ok(target.isEffectivelyVisible());
    t.same(containers.serialize(), [{path: 'B', visible: true}]);
    const saved = JSON.parse(vm.toJSON());
    t.same(saved.spriteContainers, [{path: 'B', visible: true}]);
    t.notOk(JSON.parse(vm.toJSON(target.id)).spriteContainers, 'sprite export does not leak project containers');
    vm.clear();
    t.same(containers.serialize(), []);
    t.notOk(containers.get('B'));
    vm.quit();
    t.end();
});

test('container cloning copies all live descendants once and starts hats after the complete subtree exists', t => {
    const {vm, add} = setup();
    const first = add('World//A//plain//one');
    const second = add('World//A//N//two');
    const outside = add('World//AB//outside');
    first.setXY(40, -25);
    first.setDirection(60);
    first.setEffect('ghost', 20);
    first.createVariable('local', 'local', '');
    first.variables.local.value = 42;
    first.createVariable('list', 'list', 'list');
    first.variables.list.value = [1, 2];
    second.setComponent(Model.create('slider'));
    second.componentController.setProperties({value: 37});
    vm.setSpriteFolderContainer('World', true);
    vm.setSpriteFolderContainer('World//A', true);
    vm.setSpriteFolderContainer('World//A//N', true);
    vm.setSpriteContainerVisible('World//A//N', false);
    const existing = first.makeClone();
    vm.runtime.addTarget(existing);
    existing.variables.local.value = 99;
    existing.setXY(80, -10);
    const before = vm.runtime.targets.slice();
    const hats = [];
    const startHats = vm.runtime.startHats;
    vm.runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') {
            hats.push(target);
            t.equal(vm.runtime.targets.length, before.length + 3, 'all members registered before any clone hat');
            t.ok(vm.runtime.targets.includes(target));
            t.ok(target._containerClonePaths, 'membership assigned before startup');
        }
        return [];
    };
    const containers = vm.runtime.spriteContainers;
    vm.runtime.ext_scratch3_control._createClone(CloneOption.encode('World//A'), outside);
    vm.runtime.startHats = startHats;
    const clones = vm.runtime.targets.filter(target => !before.includes(target));
    t.equal(clones.length, 3, 'existing sprite clones are included and neighboring folders are excluded');
    t.same(hats, clones, 'one clone hat per member');
    t.same(clones.map(target => target.getName()), [first.getName(), second.getName(), existing.getName()]);
    t.equal(clones[2].variables.local.value, 99, 'existing clone state is copied independently');
    t.same([clones[2].x, clones[2].y], [80, -10]);
    t.same([clones[0].x, clones[0].y, clones[0].direction], [40, -25, 60]);
    t.same(clones[0].effects, first.effects);
    t.not(clones[0].effects, first.effects);
    t.equal(clones[0].variables.local.value, 42);
    clones[0].variables.list.value.push(3);
    t.same(first.variables.list.value, [1, 2], 'local lists are independent');
    t.equal(clones[1].component.properties.value, 37);
    t.not(clones[1].component, second.component);
    t.equal(clones[1].getDrawableIDs().length, second.getDrawableIDs().length);
    t.notOk(clones[1].isEffectivelyVisible(), 'nested visibility copied');
    const paths = containers.getTargetContainers(clones[1]);
    t.equal(paths[0].id, 'World', 'outer parent retained');
    t.same(paths.slice(1).map(entry => entry.path), ['World//A', 'World//A//N']);
    t.ok(paths.slice(1).every(entry => entry.isClone));
    vm.setSpriteContainerVisible('World//A//N', true);
    t.notOk(clones[1].isEffectivelyVisible(), 'instance visibility is independent of the source');
    vm.setSpriteContainerVisible(paths[2].id, true);
    t.ok(clones[1].isEffectivelyVisible());
    vm.setSpriteContainerVisible('World', false);
    t.notOk(clones[0].isEffectivelyVisible(), 'external ancestor still constrains the instance');
    t.equal(containers.serialize().length, 3, 'runtime instances are not saved');
    vm.stopAll();
    t.equal(vm.runtime._cloneCounter, 0);
    t.equal(containers.cloneDefinitions.size, 0);
    vm.quit();
    t.end();
});

test('container cloning is all-or-nothing at the clone limit and instances have independent lifetimes', t => {
    const {vm, add} = setup();
    const first = add('A//one');
    add('A//N//two');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const containers = vm.runtime.spriteContainers;
    vm.runtime.runtimeOptions.maxClones = 1;
    t.same(containers.createClone('A'), []);
    t.equal(vm.runtime.targets.length, 2);
    t.equal(vm.runtime._cloneCounter, 0);
    t.equal(containers.cloneDefinitions.size, 0);
    vm.runtime.runtimeOptions.maxClones = 5;
    const a = containers.createClone('A');
    const b = containers.createClone('A');
    t.not(a[0]._containerClonePaths[0], b[0]._containerClonePaths[0]);
    t.same(containers.createClone('A'), [], 'insufficient capacity never creates a partial tree');
    vm.runtime.ext_scratch3_control._createClone('_myself_', a[0]);
    const extra = vm.runtime.targets[vm.runtime.targets.length - 1];
    t.same(extra._containerClonePaths, a[0]._containerClonePaths, 'ordinary self-clones stay in their instance');
    t.equal(vm.runtime._cloneCounter, 5);
    vm.runtime.ext_scratch3_control.deleteClone({}, {target: a[0]});
    t.ok(vm.runtime.targets.includes(a[1]), 'delete this clone removes only that member');
    vm.runtime.disposeTarget(a[1]);
    vm.runtime.disposeTarget(extra);
    t.equal(containers.cloneDefinitions.size, 2, 'only the other instance remains');
    t.same(containers.createClone('missing'), []);
    t.same(containers.createClone('A//ordinary'), []);
    vm.stopAll();
    t.equal(containers.cloneDefinitions.size, 0);
    t.equal(vm.runtime.targets[0], first);
    t.equal(vm.runtime._cloneCounter, 0);
    vm.quit();
    t.end();
});

test('container clone selections follow folder renames without changing sprite or reporter references', t => {
    const {vm, add} = setup();
    const target = add('A//N//one');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const blocks = target.blocks;
    for (const [id, opcode, value] of [
        ['outer', 'control_create_clone_of_menu', CloneOption.encode('A')],
        ['inner', 'control_create_clone_of_menu', CloneOption.encode('A//N')],
        ['sprite', 'control_create_clone_of_menu', 'A//N//one'],
        ['text', 'text', CloneOption.encode('A')]
    ]) blocks.createBlock({id, opcode, inputs: {},
        fields: opcode === 'text' ? {TEXT: {name: 'TEXT', value}} : {CLONE_OPTION: {name: 'CLONE_OPTION', value}},
        next: null, parent: null, topLevel: true, shadow: true});
    const containers = vm.runtime.spriteContainers;
    t.same(containers.getCloneMenu(), [['A', CloneOption.encode('A')], ['A//N', CloneOption.encode('A//N')]]);
    containers.beginUpdate();
    containers.move('A', 'B');
    vm.renameSprite(target.id, 'B//N//one');
    containers.endUpdate();
    t.equal(blocks.getBlock('outer').fields.CLONE_OPTION.value, CloneOption.encode('B'));
    t.equal(blocks.getBlock('inner').fields.CLONE_OPTION.value, CloneOption.encode('B//N'));
    t.equal(blocks.getBlock('sprite').fields.CLONE_OPTION.value, 'B//N//one');
    t.equal(blocks.getBlock('text').fields.TEXT.value, CloneOption.encode('A'));
    t.equal(containers.createClone('B').length, 1);
    const saved = JSON.parse(vm.toJSON());
    t.equal(saved.targets.length, 1, 'clones are excluded from project serialization');
    t.same(saved.spriteContainers, [{path: 'B', visible: true}, {path: 'B//N', visible: true}]);
    vm.clear();
    t.equal(containers.cloneDefinitions.size, 0);
    vm.quit();
    t.end();
});

test('runtime instance edits do not dirty the project and parent moves preserve live instances', t => {
    const {vm, add} = setup();
    const original = add('World//A//one');
    const containers = vm.runtime.spriteContainers;
    vm.setSpriteFolderContainer('World', true);
    vm.setSpriteFolderContainer('World//A', true);
    const [clone] = containers.createClone('World//A');
    const id = containers.getTargetContainers(clone)[1].id;
    let changes = 0;
    vm.runtime.on('PROJECT_CHANGED', () => changes++);
    vm.setSpriteContainerVisible(id, false);
    vm.setSpriteContainerOrder(id, Infinity);
    t.equal(changes, 0);
    vm.setSpriteContainerVisible(id, true);
    containers.beginUpdate();
    containers.move('World', 'Scene');
    vm.renameSprite(original.id, 'Scene//A//one');
    containers.endUpdate();
    t.same(containers.getTargetContainers(clone).map(entry => entry.path), ['Scene', 'Scene//A']);
    vm.setSpriteContainerVisible('Scene', false);
    t.notOk(clone.isEffectivelyVisible());
    containers.beginUpdate();
    containers.move('Scene', '', true);
    vm.renameSprite(original.id, 'A//one');
    containers.endUpdate();
    t.ok(clone.isEffectivelyVisible(), 'dissolving external parent releases its visibility constraint');
    t.same(containers.getTargetContainers(clone).map(entry => entry.path), ['A']);
    vm.quit();
    t.end();
});

test('a refused member rolls back the partially constructed instance without starting hats', t => {
    const {vm, add} = setup();
    const first = add('A//one');
    const second = add('A//two');
    vm.setSpriteFolderContainer('A', true);
    const startHats = vm.runtime.startHats;
    let hats = 0;
    vm.runtime.startHats = () => hats++;
    second.makeClone = () => null;
    t.same(vm.runtime.spriteContainers.createClone('A'), []);
    t.equal(hats, 0);
    t.equal(vm.runtime._cloneCounter, 0);
    t.equal(first.sprite.clones.length, 1);
    t.equal(vm.runtime.spriteContainers.cloneDefinitions.size, 0);
    t.same(vm.runtime.targets, [first, second]);
    vm.runtime.startHats = startHats;
    vm.quit();
    t.end();
});

test('my container is the nearest real container and replaces only its named menu option', t => {
    const {vm, add} = setup();
    const outer = add('A//ordinary//one');
    const inner = add('A//N//ordinary//two');
    const outside = add('Outside');
    const stage = add('Stage');
    stage.isStage = true;
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const containers = vm.runtime.spriteContainers;
    t.same(containers.getCloneMenu(outer), [[null, CloneOption.SELF], ['A//N', CloneOption.encode('A//N')]]);
    t.same(containers.getCloneMenu(inner), [[null, CloneOption.SELF], ['A', CloneOption.encode('A')]]);
    t.same(containers.getCloneMenu(outside), containers.getCloneMenu());
    t.same(containers.getCloneMenu(stage), containers.getCloneMenu());
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, outside);
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, stage);
    t.equal(vm.runtime._cloneCounter, 0, 'a target with no containing container does not clone');
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, inner);
    t.equal(vm.runtime._cloneCounter, 1, 'nested selection does not clone the outer container');
    t.equal(vm.runtime.targets[vm.runtime.targets.length - 1].sprite, inner.sprite);
    vm.stopAll();
    containers.beginUpdate();
    containers.move('A//N', 'B');
    vm.renameSprite(inner.id, 'B//ordinary//two');
    containers.endUpdate();
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, inner);
    t.equal(containers.getTargetContainers(vm.runtime.targets[vm.runtime.targets.length - 1])[0].path, 'B',
        'relative selection follows the current membership after a move');
    vm.quit();
    t.end();
});

test('my container selects the current instance while named options select the source container', t => {
    const {vm, add} = setup();
    const first = add('A//one');
    const second = add('A//two');
    first.createVariable('value', 'value', '');
    first.variables.value.value = 10;
    second.setComponent(Model.create('slider'));
    vm.setSpriteFolderContainer('A', true);
    const containers = vm.runtime.spriteContainers;
    const [a, b] = containers.createClone('A');
    a.setXY(45, 20);
    a.variables.value.value = 73;
    b.componentController.setProperties({value: 64});
    containers.setVisible(a._containerClonePaths[0], false);
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, a);
    const [copyA, copyB] = vm.runtime.targets.slice(-2);
    t.equal(copyA.variables.value.value, 73, 'local data comes from the current clone');
    t.same([copyA.x, copyA.y], [45, 20]);
    t.equal(copyB.component.properties.value, 64, 'sibling state comes from the same instance');
    t.not(copyA._containerClonePaths[0], a._containerClonePaths[0]);
    t.equal(copyA._containerClonePaths[0], copyB._containerClonePaths[0]);
    t.notOk(copyA.isEffectivelyVisible(), 'instance visibility is copied');
    vm.runtime.ext_scratch3_control._createClone(CloneOption.encode('A'), a);
    t.equal(vm.runtime.targets.slice(-2)[0].variables.value.value, 10, 'named selection copies the original');
    vm.runtime.disposeTarget(b);
    const count = vm.runtime._cloneCounter;
    vm.runtime.ext_scratch3_control._createClone(CloneOption.SELF, a);
    t.equal(vm.runtime._cloneCounter, count + 1, 'deleted instance members are not resurrected');
    vm.stopAll();
    t.equal(containers.cloneDefinitions.size, 0);
    vm.quit();
    t.end();
});

test('container snapshots include nested container clones but exclude separate sibling instances', t => {
    const {vm, add} = setup();
    const original = add('A//one');
    add('A//N//two');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const containers = vm.runtime.spriteContainers;
    vm.runtime.addTarget(original.makeClone());
    containers.createClone('A//N');
    const copy = containers.createClone('A');
    t.equal(copy.length, 4, 'two originals, one sprite clone and one nested container clone');
    const membership = copy.map(target => containers.getTargetContainers(target));
    t.equal(new Set(membership.map(chain => chain[0].id)).size, 1, 'all copied members share a new root');
    t.not(membership[0][0].id, 'A');
    t.equal(new Set(membership.filter(chain => chain.length === 2).map(chain => chain[1].id)).size, 2,
        'nested original container and nested clone retain separate identities');
    t.equal(containers.createClone('A').length, 4, 'a sibling container instance is not copied again');
    vm.stopAll();
    t.equal(containers.cloneDefinitions.size, 0);
    t.equal(vm.runtime._cloneCounter, 0);
    vm.quit();
    t.end();
});

test('clone myself followed by clone my container copies both members and counts both against the limit', t => {
    const {vm, add} = setup();
    const original = add('A//one');
    vm.setSpriteFolderContainer('A', true);
    const control = vm.runtime.ext_scratch3_control;
    control._createClone('_myself_', original);
    vm.runtime.runtimeOptions.maxClones = 2;
    control._createClone(CloneOption.SELF, original);
    t.equal(vm.runtime._cloneCounter, 1, 'one free slot cannot hold the current two-member container');
    t.equal(vm.runtime.spriteContainers.cloneDefinitions.size, 0, 'no partial container instance');
    vm.runtime.runtimeOptions.maxClones = 3;
    control._createClone(CloneOption.SELF, original);
    const copy = vm.runtime.targets.slice(-2);
    t.equal(vm.runtime._cloneCounter, 3);
    t.equal(copy[0]._containerClonePaths[0], copy[1]._containerClonePaths[0], 'two cloned members in one instance');
    t.ok(copy.every(target => !target.isOriginal && target.sprite === original.sprite));
    t.notOk(vm.runtime.targets[1]._containerClonePaths, 'the first sprite clone stays in its source container');
    vm.quit();
    t.end();
});
