const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Model = require('../../src/components/model');
const ComponentRenderer = require('../fixtures/component-renderer');
const ContainerOption = require('../../src/util/container-option');
const ContainersExtension = require('../../src/extensions/scratch3_containers');
const interpolation = require('../../src/engine/tw-interpolate');
const Pen = require('../../src/extensions/scratch3_pen');

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
    return {vm, renderer, add, extension: new ContainersExtension(vm.runtime)};
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
    new ContainersExtension(vm.runtime).createClone({CONTAINER: 'World//A'}, {target: outside});
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
        ['outer', 'containers_menu_containers', 'A'],
        ['inner', 'containers_menu_containers', 'A//N'],
        ['sprite', 'control_create_clone_of_menu', 'A//N//one'],
        ['text', 'text', 'A']
    ]) {
        blocks.createBlock({id,
            opcode,
            inputs: {},
            fields: opcode === 'text' ? {TEXT: {name: 'TEXT', value}} :
                opcode === 'containers_menu_containers' ? {containers: {name: 'containers', value}} :
                    {CLONE_OPTION: {name: 'CLONE_OPTION', value}},
            next: null,
            parent: null,
            topLevel: true,
            shadow: true});
    }
    const containers = vm.runtime.spriteContainers;
    containers.beginUpdate();
    containers.move('A', 'B');
    vm.renameSprite(target.id, 'B//N//one');
    containers.endUpdate();
    t.equal(blocks.getBlock('outer').fields.containers.value, 'B');
    t.equal(blocks.getBlock('inner').fields.containers.value, 'B//N');
    t.equal(blocks.getBlock('sprite').fields.CLONE_OPTION.value, 'B//N//one');
    t.equal(blocks.getBlock('text').fields.TEXT.value, 'A');
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

test('failed member initialization rolls back counters, sprite lists, drawables and container instances', t => {
    for (const phase of ['created', 'variables', 'drawable']) {
        const {vm, renderer, add} = setup();
        const first = add('A//one');
        const second = add('A//two');
        vm.setSpriteFolderContainer('A', true);
        const expected = new Error(`failed during ${phase}`);
        let hats = 0;
        vm.runtime.startHats = () => hats++;
        if (phase === 'created') {
            vm.runtime.on('targetWasCreated', target => {
                if (!target.isOriginal && target.sprite === second.sprite) throw expected;
            });
        } else if (phase === 'variables') {
            second.duplicateVariables = () => {
                throw expected;
            };
        } else {
            const update = renderer.updateDrawablePosition.bind(renderer);
            renderer.updateDrawablePosition = (id, position) => {
                if (id > second.drawableID + 1) throw expected;
                update(id, position);
            };
        }
        t.throws(() => vm.runtime.spriteContainers.createClone('A'), expected, phase);
        t.equal(hats, 0, `${phase}: no clone hats started`);
        t.equal(vm.runtime._cloneCounter, 0, `${phase}: no leaked clone quota`);
        t.same([first.sprite.clones.length, second.sprite.clones.length], [1, 1], `${phase}: no orphan sprite clone`);
        t.equal(renderer._allDrawables.filter(Boolean).length, 2, `${phase}: no orphan drawable`);
        t.equal(vm.runtime.spriteContainers.cloneDefinitions.size, 0, `${phase}: no orphan instance`);
        t.same(vm.runtime.targets.map(target => target.id), [first.id, second.id]);
        vm.quit();
    }
    t.end();
});

test('native clone inputs address only sprites, including names formerly reserved for containers', t => {
    const {vm, add} = setup();
    const member = add('A//member');
    add('A//other');
    const named = add('Named');
    vm.setSpriteFolderContainer('A', true);
    const control = vm.runtime.ext_scratch3_control;
    for (const option of [ContainerOption.SELF, '_container_:A']) {
        control._createClone(option, member);
        t.equal(vm.runtime._cloneCounter, 0, 'obsolete container selection has no special meaning');
        vm.renameSprite(named.id, option);
        t.equal(named.getName(), option, 'container syntax no longer reserves sprite names');
        member.blocks.createBlock({id: option,
            opcode: 'control_create_clone_of_menu',
            fields: {CLONE_OPTION: {name: 'CLONE_OPTION', value: option}},
            inputs: {},
            topLevel: true,
            shadow: true,
            parent: null,
            next: null});
        control._createClone(option, member);
        t.equal(vm.runtime._cloneCounter, 1, 'only the named sprite is cloned');
        t.equal(vm.runtime.targets[vm.runtime.targets.length - 1].sprite, named.sprite);
        t.equal(vm.runtime.spriteContainers.cloneDefinitions.size, 0);
        vm.stopAll();
        vm.renameSprite(named.id, 'Renamed');
        t.equal(member.blocks.getBlock(option).fields.CLONE_OPTION.value, 'Renamed', 'ordinary rename reference');
    }
    vm.quit();
    t.end();
});

test('my container selects the nearest real container, excludes stage and follows folder moves', t => {
    const {vm, add} = setup();
    const outer = add('A//ordinary//one');
    const inner = add('A//N//ordinary//two');
    const outside = add('Outside');
    const stage = add('Stage');
    stage.isStage = true;
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const containers = vm.runtime.spriteContainers;
    t.equal(containers.getContainingContainer(outer).id, 'A');
    t.equal(containers.getContainingContainer(inner).id, 'A//N');
    t.equal(containers.getContainingContainer(outside), null);
    t.equal(containers.getContainingContainer(stage), null);
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: outside});
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: stage});
    t.equal(vm.runtime._cloneCounter, 0, 'a target with no containing container does not clone');
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: inner});
    t.equal(vm.runtime._cloneCounter, 1, 'nested selection does not clone the outer container');
    t.equal(vm.runtime.targets[vm.runtime.targets.length - 1].sprite, inner.sprite);
    vm.stopAll();
    containers.beginUpdate();
    containers.move('A//N', 'B');
    vm.renameSprite(inner.id, 'B//ordinary//two');
    containers.endUpdate();
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: inner});
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
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: a});
    const [copyA, copyB] = vm.runtime.targets.slice(-2);
    t.equal(copyA.variables.value.value, 73, 'local data comes from the current clone');
    t.same([copyA.x, copyA.y], [45, 20]);
    t.equal(copyB.component.properties.value, 64, 'sibling state comes from the same instance');
    t.not(copyA._containerClonePaths[0], a._containerClonePaths[0]);
    t.equal(copyA._containerClonePaths[0], copyB._containerClonePaths[0]);
    t.notOk(copyA.isEffectivelyVisible(), 'instance visibility is copied');
    new ContainersExtension(vm.runtime).createClone({CONTAINER: 'A'}, {target: a});
    t.equal(vm.runtime.targets.slice(-2)[0].variables.value.value, 10, 'named selection copies the original');
    vm.runtime.disposeTarget(b);
    const count = vm.runtime._cloneCounter;
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: a});
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
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: original});
    t.equal(vm.runtime._cloneCounter, 1, 'one free slot cannot hold the current two-member container');
    t.equal(vm.runtime.spriteContainers.cloneDefinitions.size, 0, 'no partial container instance');
    vm.runtime.runtimeOptions.maxClones = 3;
    new ContainersExtension(vm.runtime).createClone({CONTAINER: ContainerOption.SELF}, {target: original});
    const copy = vm.runtime.targets.slice(-2);
    t.equal(vm.runtime._cloneCounter, 3);
    t.equal(copy[0]._containerClonePaths[0], copy[1]._containerClonePaths[0], 'two cloned members in one instance');
    t.ok(copy.every(target => !target.isOriginal && target.sprite === original.sprite));
    t.notOk(vm.runtime.targets[1]._containerClonePaths, 'the first sprite clone stays in its source container');
    vm.quit();
    t.end();
});


test('nested transforms preserve local state, component interaction and independent clone instances', t => {
    const {vm, renderer, add} = setup();
    const target = add('A//B//one');
    target.setXY(10, 20);
    target.setDirection(90);
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//B', true);
    t.ok(vm.setSpriteContainerTransform('A', {x: 100, y: 50, direction: 180, size: 200}));
    t.ok(vm.setSpriteContainerTransform('A//B', {x: 5, y: 10, size: 200}));
    const near = (actual, expected) => actual.forEach((n, i) => t.ok(Math.abs(n - expected[i]) < 1e-8));
    near(target.getWorldPosition(), [200, 0]);
    near(target.worldToLocal(200, 0), [10, 20]);
    t.same([target.x, target.y, target.direction, target.size], [10, 20, 90, 100]);
    target.setComponent(Model.create('slider'));
    for (const id of target.getDrawableIDs()) {
        t.same(renderer._allDrawables[id].parentTransform, target._containerTransform);
    }
    const world = target.localToWorld(target.x + 35, target.y);
    near(target.componentController.localPoint(...world), [35, 0]);
    const [clone] = vm.runtime.spriteContainers.createClone('A//B');
    const instance = vm.runtime.spriteContainers.getContainingContainer(clone).id;
    near(clone.getWorldPosition(), [200, 0]);
    vm.setSpriteContainerTransform('A//B', {x: 25});
    near(clone.getWorldPosition(), [200, 0]);
    vm.setSpriteContainerTransform(instance, {y: 20});
    near(clone.getWorldPosition(), [220, 0]);
    near(target.getWorldPosition(), [200, -40]);
    const saved = JSON.parse(vm.toJSON()).spriteContainers;
    t.equal(saved.length, 2, 'runtime instances are not saved');
    t.equal(saved[1].transform.x, 25);
    saved[1].transform.x = 999;
    t.equal(vm.runtime.spriteContainers.get('A//B').transform.x, 25, 'snapshots cannot mutate state');
    vm.setSpriteFolderContainer('A//B', false);
    near(target.getWorldPosition(), [140, 30]);
    vm.setSpriteFolderContainer('A', false);
    near(target.getWorldPosition(), [10, 20]);
    vm.quit();
    t.end();
});

test('transform validation rejects non-finite values and loading clamps size to an invertible range', t => {
    const {vm, add} = setup();
    add('A//one');
    vm.setSpriteFolderContainer('A', true);
    for (const patch of [{size: Infinity}, {x: NaN}, {direction: Infinity},
        {rotationStyle: 'invalid'}, {rotation: 90}, {bad: 1}]) {
        t.notOk(vm.setSpriteContainerTransform('A', patch));
    }
    t.same(vm.runtime.spriteContainers.get('A'), {path: 'A', visible: true});
    t.ok(vm.setSpriteContainerTransform('A', {direction: 270, rotationStyle: 'left-right'}));
    t.equal(vm.runtime.spriteContainers.get('A').transform.direction, -90);
    const data = vm.runtime.spriteContainers.serialize();
    vm.runtime.spriteContainers.load(data);
    t.same(vm.runtime.spriteContainers.serialize(), data);
    vm.runtime.spriteContainers.load([{path: 'A', transform: {size: 0, y: Infinity, x: 20}}]);
    t.same(vm.runtime.spriteContainers.get('A').transform,
        {x: 20, y: 0, size: 0.01, direction: 90, rotationStyle: 'all around'});
    vm.quit();
    t.end();
});

test('motion and distance use world destinations and local movement coordinates', t => {
    const {vm, add} = setup();
    const target = add('A//one');
    const other = add('two');
    vm.runtime.runtimeOptions.fencing = false;
    target.setXY(10, 0);
    other.setXY(100, 20);
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteContainerTransform('A', {x: 100, direction: 180, size: 200});
    const util = {target, ioQuery: (device, method) => (method === 'getScratchX' ? 100 : 20)};
    const motion = vm.runtime.ext_scratch3_motion;
    const sensing = vm.runtime.ext_scratch3_sensing;
    t.equal(sensing.distanceTo({DISTANCETOMENU: 'two'}, util), 40);
    motion.pointTowards({TOWARDS: 'two'}, util);
    t.ok(Math.abs(target.direction + 90) < 1e-8, 'world upward maps to local left');
    motion.goTo({TO: 'two'}, util);
    t.ok(Math.abs(target.x + 10) < 1e-8);
    t.ok(Math.abs(target.y) < 1e-8);
    t.ok(sensing.distanceTo({DISTANCETOMENU: '_mouse_'}, util) < 1e-8);
    vm.quit();
    t.end();
});


test('interpolation stays local while parent matrices and pen positions remain in world space', t => {
    const {vm, renderer, add} = setup();
    const target = add('A//one');
    vm.runtime.runtimeOptions.fencing = false;
    target.setXY(10, 20);
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteContainerTransform('A', {x: 100, direction: 180, size: 200});
    const drawable = renderer._allDrawables[target.drawableID];
    drawable.getAABB = () => ({width: 40, height: 40});
    interpolation.setupInitialState(vm.runtime);
    target.setXY(30, 40);
    interpolation.interpolate(vm.runtime, 0.5);
    t.same(drawable._position, [20, 30], 'interpolation writes local positions');
    t.same(drawable.parentTransform, target._containerTransform, 'parent matrix survives interpolation');
    interpolation.setupInitialState(vm.runtime);
    t.same(drawable._position, [30, 40], 'next VM tick restores the local endpoint');
    const pen = new Pen(vm.runtime);
    pen._getPenLayerID = () => 1;
    let line;
    let point;
    renderer.penLine = (id, attributes, ...coordinates) => {
        line = coordinates;
    };
    renderer.penPoint = (id, attributes, ...coordinates) => {
        point = coordinates;
    };
    pen._penDown(target);
    target.setXY(50, 60);
    t.ok(Math.abs(point[0] - 180) < 1e-8 && Math.abs(point[1] + 60) < 1e-8);
    t.ok(line.every((n, i) => Math.abs(n - [180, -60, 220, -100][i]) < 1e-8));
    vm.quit();
    t.end();
});


test('container direction and rotation styles follow native sprite semantics', t => {
    const {vm, add} = setup();
    const target = add('A//one');
    target.setXY(10, 20);
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteContainerTransform('A', {direction: -90});
    const near = expected => target.getWorldPosition().forEach((n, i) => t.ok(Math.abs(n - expected[i]) < 1e-8));
    near([-10, -20]);
    vm.setSpriteContainerTransform('A', {rotationStyle: 'left-right'});
    near([-10, 20]);
    vm.setSpriteContainerTransform('A', {rotationStyle: "don't rotate", size: 200});
    near([20, 40]);
    t.same([target.x, target.y, target.direction, target.size], [10, 20, 90, 100]);
    vm.quit();
    t.end();
});
