const {test} = require('tap');
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Clones = require('../../src/extensions/scratch3_clones');
const Renderer = require('../fixtures/component-renderer');
const Components = require('../../src/extensions/scratch3_components');
const ComponentModel = require('../../src/components/model');

const setup = () => {
    const vm = new VM();
    const runtime = vm.runtime;
    const add = (name, stage = false) => {
        const sprite = new Sprite(null, runtime);
        sprite.name = name;
        sprite.costumes = [{name: 'costume', skinId: 0}];
        const target = sprite.createClone();
        target.isStage = stage;
        runtime.addTarget(target);
        return target;
    };
    add('Stage', true);
    const source = add('Enemy');
    const extension = new Clones(runtime);
    const create = (id = '', target = source) => {
        extension.createWithId({TARGET: '_myself_', ID: id},
            {target, startHats: (...args) => runtime.startHats(...args)});
        return extension.lastId();
    };
    return {vm, runtime, add, source, extension, create};
};

test('public references are allocated without a GUI, immutable across clones and cleaned on every lifecycle', t => {
    const {vm, runtime, source, extension, create} = setup();
    t.equal(extension.id({}, {target: source}), '@sprite:Enemy');
    t.equal(extension.id({}, {target: runtime.getTargetForStage()}), '_stage_');
    t.equal(runtime.resolveTargetReference('@sprite:Enemy'), source);
    t.equal(runtime.resolveTargetReference(''), null);
    t.equal(runtime.resolveTargetReference(null), null);
    const firstId = create();
    const first = runtime.resolveTargetReference(firstId);
    t.equal(firstId, '@clone:1');
    const secondId = create('', first);
    t.equal(secondId, '@clone:2', 'cloning a clone does not copy its identity');
    t.equal(runtime.resolveTargetReference('Enemy'), source);
    runtime.disposeTarget(first);
    t.equal(runtime.resolveTargetReference(firstId), null);
    t.equal(create(), '@clone:3');
    runtime.stopAll();
    t.equal(runtime.targetReferences.targets.size, 2, 'original and stage survive stop');
    t.equal(runtime.targetReferences.active.size, 2);
    t.equal(source.publicId, '@sprite:Enemy');
    t.equal(create(), '@clone:4', 'stop does not recycle automatic IDs');
    runtime.greenFlag();
    t.equal(create(), '@clone:5', 'green flag does not recycle automatic IDs');
    vm.clear();
    t.equal(runtime.targetReferences.nextCloneId, 1, 'loading/clearing the project resets the allocator');
    t.equal(runtime.targetReferences.targets.size, 0);
    vm.quit();
    t.end();
});

test('custom IDs reserve names across sprites and allow explicit reuse after deletion', t => {
    const {vm, runtime, source, add, create} = setup();
    const other = add('Other');
    let seenId;
    runtime.on('targetWasCreated', target => {
        if (!target.isOriginal) seenId = target.publicId;
    });
    t.equal(create('boss'), '@clone:boss');
    t.equal(seenId, '@clone:boss', 'ID is assigned before creation observers');
    const boss = runtime.resolveTargetReference('@clone:boss');
    t.equal(create('boss', other), '', 'never overwrite or silently suffix a duplicate');
    t.equal(runtime.resolveTargetReference('@clone:boss'), boss);
    t.equal(runtime._cloneCounter, 1, 'failed requests do not consume clone capacity');
    t.equal(create('中文'), '@clone:中文');
    t.equal(create('__proto__'), '@clone:__proto__', 'user names are safe Map keys');
    runtime.disposeTarget(boss);
    t.equal(create('boss', other), '@clone:boss');
    t.not(runtime.resolveTargetReference('@clone:boss'), boss);
    t.equal(runtime.resolveTargetReference('@clone:boss').sprite, other.sprite);
    t.equal(source.publicId, '@sprite:Enemy');
    vm.quit();
    t.end();
});

test('failed initialization and clone limits release registrations without reusing automatic numbers', t => {
    const {vm, runtime, create} = setup();
    const fail = target => {
        if (!target.isOriginal) throw new Error('initialization failed');
    };
    runtime.on('targetWasCreated', fail);
    t.throws(() => create('boss'), /initialization failed/);
    t.equal([...runtime.targetReferences.targets.values()].filter(target => !target.isOriginal).length, 0);
    t.equal(runtime._cloneCounter, 0);
    t.equal(runtime.lastCloneId, '', 'failed initialization clears the global result');
    runtime.off('targetWasCreated', fail);
    t.equal(create('boss'), '@clone:boss');
    runtime.runtimeOptions.maxClones = 1;
    t.equal(create('other'), '');
    t.equal(runtime.resolveTargetReference('@clone:other'), null);
    vm.quit();
    t.end();
});

test('ordinary target slots resolve exact clones while collision names still cover all siblings', t => {
    const {vm, runtime, source, add, create} = setup();
    const numberNamed = add('17');
    const id = create('boss');
    const clone = runtime.resolveTargetReference(id);
    clone.setXY(30, 40);
    clone.createVariable('hp', 'health', '');
    clone.variables.hp.value = 73;
    t.equal(runtime.resolveTargetReference(17), numberNamed);
    t.equal(runtime.ext_scratch3_sensing.getAttributeOf({OBJECT: id, PROPERTY: 'x position'}), 30);
    t.equal(runtime.ext_scratch3_sensing.getAttributeOf({OBJECT: id, PROPERTY: 'health'}), 73);
    t.equal(runtime.ext_scratch3_sensing.distanceTo({DISTANCETOMENU: id}, {target: source}), 50);
    runtime.ext_scratch3_motion.goTo({TO: id}, {target: source});
    t.same([source.x, source.y], [30, 40]);
    source.setXY(0, 0);
    runtime.ext_scratch3_motion.pointTowards({TOWARDS: id}, {target: source});
    t.ok(source.direction > 36 && source.direction < 37);
    const observer = add('Observer');
    source.drawableID = 1;
    clone.drawableID = 2;
    observer.drawableID = 3;
    let candidates;
    observer.renderer = {isTouchingDrawables: (drawable, ids) => {
        candidates = ids; return true;
    }};
    t.equal(observer.isTouchingSprite(id), true);
    t.same(candidates, [2]);
    observer.isTouchingSprite(source.publicId);
    t.same(candidates, [1], 'original ID excludes its clones');
    observer.isTouchingSprite('Enemy');
    t.same(candidates, [1, 2]);
    observer.renderer = null;
    runtime.disposeTarget(clone);
    const impersonator = add(id);
    t.equal(runtime.resolveTargetReference(id), null, 'deleted IDs never fall back to a sprite name');
    t.equal(runtime.ext_scratch3_sensing.getAttributeOf({OBJECT: id, PROPERTY: 'x position'}), 0);
    t.equal(runtime.ext_scratch3_sensing.distanceTo({DISTANCETOMENU: id}, {target: source}), 10000);
    for (const name of ['@clone:another', '@sprite:another']) {
        vm.renameSprite(impersonator.id, name);
        t.equal(impersonator.getName(), id, 'reserved prefix cannot be introduced by rename');
    }
    vm.quit();
    t.end();
});

test('container members all receive fresh IDs before hats and roll back as a group', t => {
    const {vm, runtime, source, add, create} = setup();
    source.sprite.name = 'Group//One';
    add('Group//Two');
    vm.setSpriteFolderContainer('Group', true);
    create('boss');
    const hats = [];
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') hats.push(runtime.resolveTargetReference(target.publicId));
        return [];
    };
    const members = runtime.spriteContainers.createClone('Group');
    t.equal(members.length, 3);
    t.same(hats, members);
    t.equal(new Set(members.map(target => target.publicId)).size, 3);
    t.notOk(members.some(target => target.publicId === '@clone:boss'));
    t.equal(runtime.lastCloneId, members[members.length - 1].publicId, 'container creation records the last member');
    runtime.stopAll();
    let count = 0;
    runtime.on('targetWasCreated', target => {
        if (!target.isOriginal && ++count === 2) throw new Error('second member failed');
    });
    t.throws(() => runtime.spriteContainers.createClone('Group'), /second member failed/);
    t.equal([...runtime.targetReferences.targets.values()].filter(target => !target.isOriginal).length, 0);
    t.equal(runtime._cloneCounter, 0);
    t.equal(runtime.spriteContainers.cloneDefinitions.size, 0);
    t.equal(runtime.lastCloneId, '', 'a rolled-back group leaves no creation result');
    vm.quit();
    t.end();
});

test('reserved legacy sprite names migrate fixed menus only, including imported sprite blocks', async t => {
    const {vm, runtime, source} = setup();
    const imported = new Sprite(null, runtime).createClone();
    imported.sprite.name = '@clone:legacy';
    const block = (id, opcode, fields) => imported.blocks.createBlock({id,
        opcode,
        fields,
        inputs: {},
        parent: null,
        next: null,
        topLevel: true,
        shadow: false});
    block('menu', 'clones_menu_targets', {targets: {name: 'targets', value: '@clone:legacy'}});
    block('original-menu', 'clones_menu_originalTargets',
        {originalTargets: {name: 'originalTargets', value: '@clone:legacy'}});
    block('text', 'text', {TEXT: {name: 'TEXT', value: '@clone:legacy'}});
    await vm.installTargets([imported], {extensionIDs: new Set(), extensionURLs: new Map()}, false);
    t.equal(imported.getName(), '_@clone:legacy');
    t.equal(imported.blocks.getBlock('menu').fields.targets.value, '_@clone:legacy');
    t.equal(imported.blocks.getBlock('original-menu').fields.originalTargets.value, '_@clone:legacy');
    vm.renameSprite(imported.id, 'Renamed');
    t.equal(imported.blocks.getBlock('original-menu').fields.originalTargets.value, 'Renamed');
    t.equal(imported.blocks.getBlock('text').fields.TEXT.value, '@clone:legacy');
    t.equal(source.getName(), 'Enemy');
    vm.quit();
    t.end();
});

test('component clone targets retain their property APIs', t => {
    const {vm, runtime, source, create} = setup();
    vm.attachRenderer(new Renderer());
    source.renderer = runtime.renderer;
    source.initDrawable('sprite');
    source.sprite.costumes = ['track', 'fill', 'thumb'].map(name => ({name, skinId: 0}));
    source.setComponent(ComponentModel.create('slider'));
    const id = create('slider');
    const components = new Components(runtime);
    const clone = runtime.resolveTargetReference(id);
    t.equal(components._target(id, {target: source}), clone);
    t.not(clone.component, source.component);
    vm.quit();
    t.end();
});

test('legacy reserved folders migrate containers without merging existing folders', async t => {
    const {vm, runtime, add} = setup();
    add('_@clone:Group//Existing');
    const first = new Sprite(null, runtime).createClone();
    const second = new Sprite(null, runtime).createClone();
    first.sprite.name = '@clone:Group//One';
    second.sprite.name = '@clone:Group//Nested//Two';
    runtime.spriteContainers.load([{path: '@clone:Group'}, {path: '@clone:Group//Nested'}]);
    first.blocks.createBlock({id: 'container-menu',
        opcode: 'containers_menu_containers',
        inputs: {},
        fields: {containers: {name: 'containers', value: '@clone:Group//Nested'}},
        parent: null,
        next: null,
        topLevel: true,
        shadow: true});
    await vm.installTargets([first, second], {extensionIDs: new Set(), extensionURLs: new Map()}, true);
    t.equal(first.getName(), '_@clone:Group2//One');
    t.equal(second.getName(), '_@clone:Group2//Nested//Two');
    t.same(runtime.spriteContainers.serialize().map(entry => entry.path),
        ['_@clone:Group2', '_@clone:Group2//Nested']);
    t.equal(first.blocks.getBlock('container-menu').fields.containers.value, '_@clone:Group2//Nested');
    vm.quit();
    t.end();
});


test('original IDs follow names; duplication, deletion and name reuse update the registry', async t => {
    const {vm, runtime, source, extension, create, add} = setup();
    const id = source.publicId;
    const cloneId = create('boss');
    const clone = runtime.resolveTargetReference(cloneId);
    t.equal(extension.targetId({TARGET: 'Enemy'}, {target: clone}), id, 'a name always selects the original');
    t.equal(extension.targetId({TARGET: '_myself_'}, {target: clone}), id, 'myself selects the clone original');
    t.equal(extension.targetId({TARGET: id}, {target: clone}), id);
    t.equal(extension.targetId({TARGET: cloneId}, {target: source}), id, 'even a clone reference reports its original');
    t.equal(extension.targetId({TARGET: 'missing'}, {target: source}), '');
    t.equal(extension.targetId({TARGET: '_stage_'}, {target: source}), '_stage_');
    t.ok(extension.exists({ID: id}));
    t.ok(extension.exists({ID: cloneId}));
    t.ok(extension.exists({ID: '_stage_'}));
    t.notOk(extension.exists({ID: 'Enemy'}), 'existence accepts IDs, not sprite names');
    t.notOk(extension.exists({ID: ''}));
    t.notOk(extension.exists({ID: '@sprite:missing'}));
    extension.delete({ID: id});
    extension.delete({ID: '_stage_'});
    t.equal(runtime.resolveTargetReference(id), source, 'delete clone cannot delete the original');
    t.ok(runtime.getTargetForStage(), 'delete clone cannot delete the stage');
    vm.renameSprite(source.id, 'Enemy');
    t.equal(source.publicId, id, 'own clones do not cause a same-name rename to add a suffix');
    vm.renameSprite(source.id, 'Renamed');
    const renamedId = '@sprite:Renamed';
    t.equal(source.publicId, renamedId);
    t.equal(runtime.resolveTargetReference(id), null, 'old names are not aliases');
    t.notOk(extension.exists({ID: id}));
    t.equal(runtime.resolveTargetReference(renamedId), source);
    t.equal(clone.publicId, cloneId, 'renaming the source leaves clone IDs unchanged');
    t.equal(extension.targetId({TARGET: cloneId}, {target: clone}), renamedId);
    runtime.moveExecutable(source, 1);
    runtime.greenFlag();
    t.equal(source.publicId, renamedId, 'green flag and layer order do not change the name reference');
    t.notOk(extension.exists({ID: cloneId}));
    t.equal(extension.targetId({TARGET: 'Renamed'}, {target: source}), renamedId);
    // No external assets are needed to exercise the actual editor duplication path.
    source.sprite.costumes = [];
    await vm.duplicateSprite(source.id);
    const duplicate = vm.editingTarget;
    t.equal(duplicate.publicId, '@sprite:Renamed2');
    t.equal(runtime.resolveTargetReference(duplicate.publicId), duplicate);
    runtime.disposeTarget(source);
    t.notOk(extension.exists({ID: renamedId}));
    t.equal(runtime.resolveTargetReference(renamedId), null);
    t.equal(extension.targetId({TARGET: renamedId}, {target: duplicate}), '');
    const replacement = add('Renamed');
    t.equal(runtime.resolveTargetReference(renamedId), replacement, 'a reused name selects the new original');
    t.not(replacement.id, source.id, 'internal target identities remain distinct');
    vm.clear();
    t.equal(runtime.resolveTargetReference(renamedId), null);
    vm.quit();
    t.end();
});

test('full-name references track folder moves, collision suffixes and numeric sprite names', t => {
    const {vm, runtime, source, extension, create, add} = setup();
    const other = add('B//敌人');
    vm.renameSprite(source.id, 'A//敌人');
    const oldId = source.publicId;
    t.equal(oldId, '@sprite:A//敌人');
    t.equal(runtime.resolveTargetReference('@sprite:B//敌人'), other);
    source.createVariable('saved', 'saved ID', '');
    source.variables.saved.value = oldId;
    source.blocks.createBlock({id: 'original-menu',
        opcode: 'clones_menu_originalTargets',
        fields: {originalTargets: {name: 'originalTargets', value: source.getName()}},
        inputs: {},
        parent: null,
        next: null,
        topLevel: true,
        shadow: true});
    const cloneId = create('boss');
    vm.renameSprite(source.id, 'B//敌人');
    t.equal(source.publicId, '@sprite:B//敌人2');
    t.equal(source.blocks.getBlock('original-menu').fields.originalTargets.value, 'B//敌人2');
    t.equal(source.variables.saved.value, oldId, 'stored strings remain user data');
    t.equal(runtime.resolveTargetReference(oldId), null);
    t.equal(extension.targetId({TARGET: cloneId}, {target: source}), '@sprite:B//敌人2');
    t.equal(runtime.resolveTargetReference('@sprite:1'), null, 'numeric values have no legacy index fallback');
    const numeric = add('1');
    t.equal(runtime.resolveTargetReference('@sprite:1'), numeric, 'numeric names are matched literally');
    t.equal(runtime.resolveTargetReference('@sprite:敵人'), null, 'no basename or alternate spelling fallback');
    vm.quit();
    t.end();
});

test('imports finalize duplicate names before registration and preserve existing menus', async t => {
    const {vm, runtime, source, create} = setup();
    create('boss');
    const makeMenu = owner => owner.blocks.createBlock({id: 'original-menu',
        opcode: 'clones_menu_originalTargets',
        fields: {originalTargets: {name: 'originalTargets', value: 'Enemy'}},
        inputs: {},
        parent: null,
        next: null,
        topLevel: true,
        shadow: true});
    makeMenu(source);
    const imported = new Sprite(null, runtime).createClone();
    imported.sprite.name = 'Enemy';
    makeMenu(imported);
    const update = imported.updateAllDrawableProperties.bind(imported);
    imported.updateAllDrawableProperties = () => {
        t.equal(imported.publicId, '@sprite:Enemy2', 'drawable initialization sees the final ID');
        t.equal(runtime.resolveTargetReference(imported.publicId), imported);
        update();
    };
    await vm.installTargets([imported], {extensionIDs: new Set(), extensionURLs: new Map()}, false);
    t.equal(runtime.resolveTargetReference('@sprite:Enemy'), source);
    t.equal(runtime.resolveTargetReference('@sprite:Enemy2'), imported);
    t.equal(imported.blocks.getBlock('original-menu').fields.originalTargets.value, 'Enemy2');
    t.equal(source.blocks.getBlock('original-menu').fields.originalTargets.value, 'Enemy');
    t.ok(runtime.resolveTargetReference('@clone:boss'));
    vm.quit();
    t.end();
});

test('legacy original-ID names migrate fixed query menus without reinterpreting text', async t => {
    const {vm, runtime, add} = setup();
    add('_@sprite:legacy');
    const imported = new Sprite(null, runtime).createClone();
    imported.sprite.name = '@sprite:legacy';
    for (const [id, opcode, field] of [['menu', 'clones_menu_targets', 'targets'], ['text', 'text', 'TEXT']]) {
        imported.blocks.createBlock({id,
            opcode,
            fields: {[field]: {name: field, value: '@sprite:legacy'}},
            inputs: {},
            parent: null,
            next: null,
            topLevel: true,
            shadow: true});
    }
    await vm.installTargets([imported], {extensionIDs: new Set(), extensionURLs: new Map()}, false);
    t.equal(imported.getName(), '_@sprite:legacy2');
    t.equal(imported.blocks.getBlock('menu').fields.targets.value, '_@sprite:legacy2');
    t.equal(imported.blocks.getBlock('text').fields.TEXT.value, '@sprite:legacy');
    t.equal(runtime.resolveTargetReference(imported.publicId), imported);
    t.equal(runtime.resolveTargetReference('@sprite:legacy'), null);
    vm.quit();
    t.end();
});


test('invalid nonempty ID suffixes fail without creating clones or consuming automatic IDs', t => {
    const {vm, runtime, source, create} = setup();
    create('boss');
    const targets = runtime.targets.map(target => target.id);
    const clones = source.sprite.clones.map(target => target.id);
    const references = [...runtime.targetReferences.targets.keys()];
    const created = [];
    const hats = [];
    runtime.on('targetWasCreated', target => created.push(target));
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') hats.push(target);
        return [];
    };
    for (const id of ['1', '001', 0, 123, ' boss', 'boss ', '\tboss', 'boss\n', '   ', '\t\n',
        '@clone:boss', '@sprite:boss', '@container:boss', '@container-clone:boss']) {
        t.equal(create(id), '', `creation fails for ${JSON.stringify(id)}`);
        t.same(runtime.targets.map(target => target.id), targets, 'no target is installed');
        t.same(source.sprite.clones.map(target => target.id), clones, 'no clone is retained by the sprite');
        t.same([...runtime.targetReferences.targets.keys()], references, 'no ID is reserved');
        t.equal(runtime._cloneCounter, 1, 'failed requests do not consume clone capacity');
        t.equal(runtime.targetReferences.nextCloneId, 1, 'failed requests do not consume automatic IDs');
    }
    t.equal(create('boss'), '', 'an occupied valid ID does not get replaced or suffixed');
    t.same(created, [], 'failed requests do not emit creation events');
    t.same(hats, [], 'failed requests do not start clone scripts');
    t.equal(create(''), '@clone:1', 'an empty suffix still allocates an automatic ID');
    t.equal(runtime._cloneCounter, 2);
    vm.quit();
    t.end();
});

test('last-created ID is global and readable without a thread, including after stop and deletion', t => {
    const {vm, runtime, source, extension, add, create} = setup();
    const other = add('Other');
    const anotherReader = new Clones(runtime);
    t.equal(extension.lastId(), '');
    runtime.ext_scratch3_control.createClone({CLONE_OPTION: '_myself_'}, {target: source});
    t.equal(extension.lastId(), '@clone:1', 'native creation updates the same global value');
    t.equal(anotherReader.lastId({}, {target: other}), '@clone:1', 'another sprite observes the same value');
    t.equal(create('boss', other), '@clone:boss');
    t.equal(extension.lastId({}, {target: source}), '@clone:boss', 'the latest writer wins across sprites');
    extension.delete({ID: '@clone:boss'});
    t.equal(extension.lastId(), '@clone:boss', 'deletion preserves the result for debugging');
    t.notOk(extension.exists({ID: extension.lastId()}));
    runtime.stopAll();
    t.equal(extension.lastId(), '@clone:boss', 'manual evaluation after stop still works');
    runtime.greenFlag();
    t.equal(extension.lastId(), '', 'a new run starts with an empty result');
    create('another');
    runtime.ext_scratch3_control.createClone({CLONE_OPTION: 'missing'}, {target: source});
    t.equal(extension.lastId(), '', 'missing target clears the previous result');
    create('after-missing');
    runtime.ext_scratch3_control.createClone({CLONE_OPTION: '_myself_'}, {target: runtime.getTargetForStage()});
    t.equal(extension.lastId(), '', 'attempting to clone the stage clears the result');
    create('before-limit');
    runtime.runtimeOptions.maxClones = 0;
    runtime.ext_scratch3_control.createClone({CLONE_OPTION: '_myself_'}, {target: source});
    t.equal(extension.lastId(), '', 'clone limit clears the result');
    runtime.runtimeOptions.maxClones = Infinity;
    create('before-clear');
    vm.clear();
    t.equal(extension.lastId(), '', 'project replacement clears the result');
    vm.quit();
    t.end();
});

test('creation results are published before hats and newer creations are never overwritten on return', t => {
    const {vm, runtime, source, extension} = setup();
    const seen = [];
    runtime.startHats = (opcode, fields, target) => {
        if (opcode === 'control_start_as_clone') {
            seen.push(extension.lastId());
            if (target.publicId === '@clone:parent') {
                runtime.ext_scratch3_control._createClone('_myself_', source, {cloneId: 'child'});
            }
        }
        return [];
    };
    const result = extension.createWithId({TARGET: '_myself_', ID: 'parent'},
        {target: source, startHats: (...args) => runtime.startHats(...args)});
    t.equal(result, undefined, 'the creation command no longer reports a value');
    t.same(seen, ['@clone:parent', '@clone:child']);
    t.equal(extension.lastId(), '@clone:child', 'a nested creation wins globally');
    vm.quit();
    t.end();
});


test('creation and original ID menus replace the current sprite with myself', t => {
    const {vm, runtime, source, extension, add, create} = setup();
    const stage = runtime.getTargetForStage();
    const values = menu => menu.map(item => item.value);
    runtime.setEditingTarget(source);
    t.same(values(extension.getTargets()), ['_myself_']);
    t.same(values(extension.getOriginalTargets()), ['_myself_']);
    t.equal(extension.getOriginalTargets()[0].text, 'myself');
    const other = add('Other');
    create('boss');
    runtime.setEditingTarget(source);
    t.same(values(extension.getTargets()), ['_myself_', 'Other'], 'clones do not appear and self replaces Enemy');
    t.same(values(extension.getOriginalTargets()), ['_myself_', 'Other'], 'self replaces the current original');
    runtime.setEditingTarget(other);
    t.same(values(extension.getTargets()), ['_myself_', 'Enemy']);
    t.same(values(extension.getOriginalTargets()), ['_myself_', 'Enemy'], 'menu follows the editing target');
    runtime.setEditingTarget(stage);
    t.same(values(extension.getTargets()), ['Enemy', 'Other'], 'no myself on stage');
    t.same(values(extension.getOriginalTargets()), ['Enemy', 'Other']);
    runtime.stopAll();
    runtime.disposeTarget(source);
    runtime.disposeTarget(other);
    t.same(extension.getTargets(), [{text: '', value: ''}], 'empty stage menu matches Scratch');
    t.same(extension.getOriginalTargets(), [{text: '', value: ''}]);
    vm.quit();
    t.end();
});

test('clone predicate distinguishes sprite originals, clones and stage independently of editing context', t => {
    const {vm, runtime, source, extension, create} = setup();
    const clone = runtime.resolveTargetReference(create('boss'));
    runtime.setEditingTarget(source);
    t.equal(extension.isClone({}, {target: source}), false);
    t.equal(extension.isClone({}, {target: clone}), true);
    t.equal(extension.isClone({}, {target: runtime.getTargetForStage()}), false);
    t.equal(extension.isClone({}, {target: null}), false);
    t.equal(extension.id({}, {target: clone}), '@clone:boss', 'my ID still reports the executing instance');
    t.equal(extension.targetId({TARGET: 'Enemy'}, {target: clone}), source.publicId);
    vm.quit();
    t.end();
});
