const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Containers = require('../../src/extensions/scratch3_containers');
const Renderer = require('../fixtures/component-renderer');
const Option = require('../../src/util/container-option');

const setup = t => {
    const vm = new VM();
    t.teardown(() => vm.quit());
    const runtime = vm.runtime;
    const containers = runtime.spriteContainers;
    const renderer = new Renderer();
    renderer.setDrawableContainerPaths = () => {};
    renderer.setDrawableContainerOrder = () => {};
    vm.attachRenderer(renderer);
    const add = (name, stage = false) => {
        const sprite = new Sprite(null, runtime);
        sprite.name = name;
        sprite.costumes = [{name: 'costume', skinId: 0}];
        const target = sprite.createClone();
        target.isStage = stage;
        runtime.addTarget(target);
        return target;
    };
    const stage = add('Stage', true);
    const body = add('A//Body');
    const weapon = add('A//N//Weapon');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const extension = new Containers(runtime);
    const util = target => ({target, startHats: (...args) => runtime.startHats(...args)});
    const create = (ID = '', CONTAINER = 'A') => {
        extension.createWithId({ID, CONTAINER}, util(stage));
        return extension.lastId();
    };
    return {vm, runtime, containers, renderer, stage, body, weapon, extension, util, add, create};
};

test('nested instances have independent public IDs and actual parent references before hats', t => {
    const {runtime, containers, body, extension, util, create} = setup(t);
    const seen = [];
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') {
            const chain = containers.getTargetContainers(target);
            t.ok(chain.every(entry => extension.exists({ID: entry.publicId})), 'entire chain is active');
            t.equal(runtime.lastContainerCloneId, '@container-clone:boss');
            seen.push(chain.map(entry => entry.publicId));
        }
        return [];
    };
    t.equal(create('boss'), '@container-clone:boss');
    t.same(seen, [['@container-clone:boss'], ['@container-clone:boss', '@container-clone:1']]);
    const member = runtime.targets.find(target => !target.isOriginal && target.getName().includes('//N//'));
    t.equal(extension.id({CONTAINER: Option.SELF}, util(member)), '@container-clone:1');
    t.equal(extension.parentId({CONTAINER: Option.SELF}, util(member)), '@container-clone:boss');
    t.equal(extension.originalId({CONTAINER: Option.SELF}, util(member)), '@container:A//N');
    t.equal(extension.id({CONTAINER: 'A'}, util(member)), '@container:A', 'names always select originals');
    t.equal(extension.id({CONTAINER: Option.SELF}, util(body)), '@container:A');
    t.equal(extension.parentId({CONTAINER: 'A'}, util(member)), '');
    t.equal(extension.parentId({CONTAINER: '@container:A//N'}, util(member)), '@container:A');
    t.equal(new Set(runtime.targets.filter(target => !target.isOriginal).map(target => target.publicId)).size, 2);
    t.end();
});

test('all container operations and coordinate frames accept public references from unrelated scripts', t => {
    const {containers, renderer, stage, body, extension, util, create} = setup(t);
    containers.setTransform('A', {x: 100, size: 200});
    containers.setTransform('A//N', {x: 10});
    const root = create('boss');
    const child = '@container-clone:1';
    extension.setProperty({CONTAINER: root, PROPERTY: 'x', VALUE: -100}, util(stage));
    extension.changeProperty({CONTAINER: child, PROPERTY: 'x', VALUE: 10}, util(stage));
    t.equal(extension.property({CONTAINER: root, PROPERTY: 'x'}, util(body)), -100);
    t.equal(extension.property({CONTAINER: '@container:A', PROPERTY: 'x'}, util(stage)), 100);
    t.equal(extension.convertPoint({FROM: child, TO: Option.STAGE, X: 5, Y: 0, COORDINATE: 'x'}, util(stage)), -50);
    t.equal(extension.convertPoint({FROM: Option.STAGE, TO: child, X: -50, Y: 0, COORDINATE: 'x'}, util(stage)), 5);
    extension.setEffect({CONTAINER: root, EFFECT: 'ghost', VALUE: 35}, util(stage));
    t.equal(extension.effect({CONTAINER: root, EFFECT: 'ghost'}, util(body)), 35);
    t.equal(extension.effect({CONTAINER: 'A', EFFECT: 'ghost'}, util(body)), 0);
    extension.hide({CONTAINER: root}, util(stage));
    t.equal(extension.isVisible({CONTAINER: root}, util(body)), false);
    t.equal(extension.isVisible({CONTAINER: 'A'}, util(body)), true);
    extension.show({CONTAINER: root}, util(stage));
    renderer.setDrawableContainerOrder = id => t.equal(id, containers.resolveReference(root));
    extension.goToLayer({CONTAINER: root, LAYER: 'front'}, util(stage));
    t.end();
});

test('cloning an instance copies live state and renews every identity; deletion covers exactly one subtree', t => {
    const {runtime, containers, extension, util, stage, create} = setup(t);
    const first = create('boss');
    extension.goToXY({CONTAINER: first, X: 73, Y: 29}, util(stage));
    const second = create('copy', first);
    t.equal(second, '@container-clone:copy');
    t.equal(extension.property({CONTAINER: second, PROPERTY: 'x'}, util(stage)), 73);
    t.equal(extension.parentId({CONTAINER: '@container-clone:2'}, util(stage)), second);
    t.equal(containers.cloneReferences.size, 4);
    t.equal(runtime._cloneCounter, 4);
    extension.deleteById({ID: '@container-clone:1'});
    t.ok(extension.exists({ID: first}), 'body keeps the parent alive');
    t.notOk(extension.exists({ID: '@container-clone:1'}));
    extension.deleteById({ID: first});
    t.notOk(extension.exists({ID: first}));
    t.ok(extension.exists({ID: second}));
    t.equal(runtime._cloneCounter, 2);
    const spriteId = runtime.targets.find(target => !target.isOriginal).publicId;
    for (const ID of ['A', '@container:A', stage.publicId, spriteId]) {
        extension.deleteById({ID});
    }
    t.equal(runtime._cloneCounter, 2, 'wrong types and originals are protected');
    for (const member of runtime.targets.filter(target => !target.isOriginal)) runtime.disposeTarget(member);
    t.equal(containers.cloneReferences.size, 0, 'last-member disposal unregisters empty ancestors');
    t.equal(containers.cloneDefinitions.size, 0);
    t.equal(extension.lastId(), second, 'deletion preserves the historical result');
    t.end();
});

test('reserved custom IDs are unavailable before commit; duplicate and partial creation roll back', t => {
    const {runtime, containers, body, create, extension} = setup(t);
    let observed = false;
    const observer = target => {
        if (target.isOriginal || observed) return;
        observed = true;
        t.notOk(extension.exists({ID: '@container-clone:boss'}), 'reserved is not active');
        t.equal(create('boss'), '', 'reentrant creation cannot steal the reservation');
    };
    runtime.on('targetWasCreated', observer);
    t.equal(create('boss'), '@container-clone:boss');
    runtime.off('targetWasCreated', observer);
    t.equal(create('boss'), '');
    t.equal(runtime._cloneCounter, 2);
    runtime.stopAll();
    let count = 0;
    const fail = target => {
        if (!target.isOriginal && ++count === 2) throw new Error('second member failed');
    };
    runtime.on('targetWasCreated', fail);
    t.throws(() => create('boss'), /second member failed/);
    runtime.off('targetWasCreated', fail);
    t.equal(containers.cloneReferences.size, 0);
    t.equal(containers.cloneDefinitions.size, 0);
    t.equal(runtime._cloneCounter, 0);
    t.equal(runtime.lastCloneId, '');
    t.equal(extension.lastId(), '');
    const make = body.makeClone;
    body.makeClone = () => null;
    t.equal(create('boss'), '');
    t.equal(containers.cloneReferences.size, 0, 'null creation also releases reservations');
    body.makeClone = make;
    t.equal(create('boss'), '@container-clone:boss', 'failed custom ID can be reused');
    t.end();
});

test('sync and ordering failures roll back installed members and public references', t => {
    const {runtime, containers, renderer, create} = setup(t);
    const getOrder = renderer.getDrawableOrder;
    renderer.getDrawableOrder = () => {
        throw new Error('sort failed');
    };
    t.throws(() => create('boss'), /sort failed/);
    t.equal(containers.cloneReferences.size, 0, 'source ordering failure cannot leak a reservation');
    renderer.getDrawableOrder = getOrder;
    const order = renderer.setDrawableContainerOrder;
    renderer.setDrawableContainerOrder = () => {
        throw new Error('order failed');
    };
    t.throws(() => create('boss'), /order failed/);
    t.equal(runtime._cloneCounter, 0);
    t.equal(containers.cloneReferences.size, 0);
    t.equal(runtime.lastContainerCloneId, '');
    renderer.setDrawableContainerOrder = order;
    const sync = renderer.setDrawableContainerPaths;
    let failed = false;
    renderer.setDrawableContainerPaths = (...args) => {
        if (!failed) {
            failed = true;
            throw new Error('sync failed');
        }
        return sync(...args);
    };
    t.throws(() => create('boss'), /sync failed/);
    t.equal(containers.cloneReferences.size, 0);
    t.equal(runtime._cloneCounter, 0);
    t.equal(create('boss'), '@container-clone:boss');
    t.end();
});

test('last result is global, separate from sprite results and updated before reentrant hats', t => {
    const {runtime, containers, body, create, extension, util} = setup(t);
    let nested = false;
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone' && !nested) {
            nested = true;
            t.equal(extension.lastId(), '@container-clone:parent');
            t.equal(extension.id({CONTAINER: Option.SELF}, util(target)), '@container-clone:parent');
            create('child', 'A//N');
        }
        return [];
    };
    t.equal(create('parent'), '@container-clone:child', 'latest creation wins across hat execution');
    runtime.ext_scratch3_control._createClone('_myself_', body);
    t.equal(extension.lastId(), '@container-clone:child', 'sprite creation leaves the container result alone');
    t.equal(new Containers(runtime).lastId(), '@container-clone:child');
    runtime.stopAll();
    t.equal(extension.lastId(), '@container-clone:child');
    runtime.greenFlag();
    t.equal(extension.lastId(), '');
    t.equal(containers.cloneReferences.size, 0);
    create('ok');
    t.equal(create('bad', 'missing'), '');
    t.equal(runtime.lastCloneId, '');
    runtime.runtimeOptions.maxClones = runtime._cloneCounter;
    t.equal(create('limited'), '');
    t.end();
});

test('invalid nonempty container ID suffixes fail before creating any part of the subtree', t => {
    const {runtime, containers, body, weapon, create} = setup(t);
    create('boss');
    const targets = runtime.targets.map(target => target.id);
    const bodyClones = body.sprite.clones.map(target => target.id);
    const weaponClones = weapon.sprite.clones.map(target => target.id);
    const references = [...containers.cloneReferences.keys()];
    const definitions = [...containers.cloneDefinitions.keys()];
    const spriteReferences = [...runtime.targetReferences.targets.keys()];
    const nextContainerId = containers.nextCloneId;
    const nextSpriteId = runtime.targetReferences.nextCloneId;
    const created = [];
    const hats = [];
    runtime.on('targetWasCreated', target => created.push(target));
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') hats.push(target);
        return [];
    };
    for (const suffix of ['1', '001', 0, 123, ' boss', 'boss ', '\tboss', 'boss\n', '   ', '\t\n',
        '@clone:boss', '@sprite:boss', '@container:boss', '@container-clone:boss']) {
        t.equal(create(suffix), '', `creation fails for ${JSON.stringify(suffix)}`);
        t.equal(runtime.lastCloneId, '', 'member creation result is also cleared');
        t.same(runtime.targets.map(target => target.id), targets, 'no member is installed');
        t.same(body.sprite.clones.map(target => target.id), bodyClones, 'no root member is created');
        t.same(weapon.sprite.clones.map(target => target.id), weaponClones, 'no nested member is created');
        t.same([...containers.cloneReferences.keys()], references, 'no container ID is reserved');
        t.same([...containers.cloneDefinitions.keys()], definitions, 'no container instance is retained');
        t.same([...runtime.targetReferences.targets.keys()], spriteReferences, 'no member ID is reserved');
        t.equal(runtime._cloneCounter, 2, 'failed requests do not consume clone capacity');
        t.equal(containers.nextCloneId, nextContainerId, 'no automatic container ID is consumed');
        t.equal(runtime.targetReferences.nextCloneId, nextSpriteId, 'no automatic member ID is consumed');
    }
    t.same(created, [], 'failed requests do not emit creation events');
    t.same(hats, [], 'failed requests do not start clone scripts');
    t.end();
});

test('empty suffixes allocate automatic IDs which never recycle until project reload', t => {
    const {vm, runtime, containers, extension, create} = setup(t);
    let next = 1;
    for (let i = 0; i < 3; i++) {
        t.equal(create('', 'A//N'), `@container-clone:${next++}`);
        runtime.stopAll();
    }
    runtime.greenFlag();
    t.equal(create('', 'A//N'), `@container-clone:${next++}`);
    for (const suffix of ['中文', '__proto__', 'boss']) {
        const id = create(suffix, 'A//N');
        t.equal(id, `@container-clone:${suffix}`);
        extension.deleteById({ID: id});
        t.equal(create(suffix, 'A//N'), id, 'custom names may be explicitly reused');
    }
    t.equal(containers.nextCloneId, next);
    vm.clear();
    t.equal(containers.nextCloneId, 1);
    t.equal(containers.cloneReferences.size, 0);
    t.equal(extension.lastId(), '');
    t.end();
});

test('unknown and wrong-type references never select a fallback; constructing a string has no effects', t => {
    const {runtime, containers, stage, extension, util, create} = setup(t);
    const ref = create('boss');
    const count = runtime._cloneCounter;
    for (const suffix of ['', '17', ' boss ', '中文']) {
        t.equal(extension.cloneId({ID: suffix}), `@container-clone:${suffix}`);
    }
    t.equal(extension.lastId(), ref);
    t.equal(runtime._cloneCounter, count);
    for (const id of ['', 'missing', '@container:', '@container-clone:', '@container-clone:missing',
        '@sprite:A//Body', '@clone:1', containers.resolveReference(ref)]) {
        t.equal(extension.id({CONTAINER: id}, util(stage)), '');
        t.equal(extension.originalId({CONTAINER: id}, util(stage)), '');
        t.equal(extension.parentId({CONTAINER: id}, util(stage)), '');
        t.notOk(extension.exists({ID: id}));
        t.equal(extension.property({CONTAINER: id, PROPERTY: 'x'}, util(stage)), 0);
        extension.hide({CONTAINER: id}, util(stage));
    }
    t.notOk(extension.exists({ID: 'A'}), 'exists accepts full references only');
    t.ok(extension.exists({ID: '@container:A'}));
    t.equal(runtime.resolveTargetReference(ref), null, 'container IDs cannot be used as sprite IDs');
    t.equal(extension.id({CONTAINER: Option.SELF}, util(stage)), '');
    t.ok(extension.isVisible({CONTAINER: ref}, util(stage)));
    t.end();
});

test('rename and reparent update original references and actual clone ancestry without changing clone IDs', t => {
    const {vm, runtime, containers, add, body, weapon, stage, create, extension, util} = setup(t);
    add('B//Other');
    vm.setSpriteFolderContainer('B', true);
    containers.setTransform('B', {x: 200});
    const ref = create('boss');
    containers.beginUpdate();
    containers.move('A', 'B//Moved');
    vm.renameSprite(body.id, 'B//Moved//Body');
    vm.renameSprite(weapon.id, 'B//Moved//N//Weapon');
    containers.endUpdate();
    t.notOk(extension.exists({ID: '@container:A'}));
    t.ok(extension.exists({ID: '@container:B//Moved'}));
    t.equal(extension.originalId({CONTAINER: ref}, util(stage)), '@container:B//Moved');
    t.equal(extension.parentId({CONTAINER: ref}, util(stage)), '@container:B');
    t.equal(extension.parentId({CONTAINER: '@container-clone:1'}, util(stage)), ref);
    t.equal(extension.convertPoint({FROM: ref, TO: Option.STAGE, X: 5, Y: 0, COORDINATE: 'x'}, util(stage)), 205);
    for (const prefix of ['@container:', '@container-clone:']) {
        vm.renameSprite(body.id, `${prefix}bad`);
        t.equal(body.getName(), 'B//Moved//Body', 'reserved names are rejected');
    }
    vm.setSpriteFolderContainer('B//Moved', false);
    t.equal(extension.originalId({CONTAINER: ref}, util(stage)), '', 'dissolved original is absent');
    t.ok(extension.exists({ID: ref}), 'independent clone survives');
    runtime.disposeTarget(weapon);
    t.notOk(extension.exists({ID: '@container:B//Moved//N'}), 'stale metadata does not imply a live original');
    t.end();
});

test('new reserved namespaces migrate legacy paths and fixed menus while preserving arbitrary strings', async t => {
    const {vm, runtime, containers, add} = setup(t);
    for (const prefix of ['@container:', '@container-clone:']) {
        vm.clear();
        add('Stage', true);
        const target = new Sprite(null, runtime).createClone();
        target.sprite.name = `${prefix}Group//One`;
        target.sprite.costumes = [{name: 'costume', skinId: 0}];
        containers.load([{path: `${prefix}Group`}]);
        for (const [id, opcode, field] of [['menu', 'containers_menu_containers', 'containers'],
            ['text', 'text', 'TEXT']]) {
            target.blocks.createBlock({id,
                opcode,
                fields: {[field]: {name: field, value: `${prefix}Group`}},
                inputs: {},
                next: null,
                parent: null,
                topLevel: true,
                shadow: true});
        }
        await vm.installTargets([target], {extensionIDs: new Set(), extensionURLs: new Map()}, true);
        t.equal(target.getName(), `_${prefix}Group//One`);
        t.ok(containers.resolveReference(`@container:_${prefix}Group`));
        t.equal(target.blocks.getBlock('menu').fields.containers.value, `_${prefix}Group`);
        t.equal(target.blocks.getBlock('text').fields.TEXT.value, `${prefix}Group`);
    }
});
