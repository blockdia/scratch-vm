const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Containers = require('../../src/extensions/scratch3_containers');
const Renderer = require('../fixtures/component-renderer');
const ContainerOption = require('../../src/util/container-option');
const formatMessage = require('format-message');

const setup = () => {
    const vm = new VM();
    const renderer = new Renderer();
    renderer.setDrawableContainerPaths = () => {};
    renderer.setDrawableContainerOrder = (...args) => {
        renderer.containerOrder = args;
    };
    vm.attachRenderer(renderer);
    const add = name => {
        const sprite = new Sprite(null, vm.runtime);
        sprite.name = name;
        sprite.costumes = [{name: 'costume', skinId: 0}];
        const target = sprite.createClone();
        vm.runtime.addTarget(target);
        return target;
    };
    return {vm, renderer, add, extension: new Containers(vm.runtime), containers: vm.runtime.spriteContainers};
};

test('localized container menus preserve the GUI message dictionary', async t => {
    const {vm, add, extension} = setup();
    const previousLocale = formatMessage.setup();
    const messages = {'containers.containingContainer': '所在容器'};
    try {
        const target = add('A//one');
        vm.setSpriteFolderContainer('A', true);
        vm.runtime.setEditingTarget(target);
        await vm.setLocale('zh-cn', messages);
        t.equal(extension.getContainers()[0].text, '所在容器');
        t.same(messages, {'containers.containingContainer': '所在容器'},
            'format-message must not replace shared strings with its cached message objects');
    } finally {
        formatMessage.setup(previousLocale);
        vm.quit();
    }
});

test('menus replace the current name with a relative choice and rename only named references', t => {
    const {vm, add, extension, containers} = setup();
    t.same(extension.getContainers().map(item => item.value), ['']);
    const target = add('A//N//one');
    const outside = add('outside');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    vm.runtime.setEditingTarget(target);
    t.same(extension.getContainers().map(item => item.value),
        [ContainerOption.SELF, 'A']);
    const clone = containers.createClone('A//N')[0];
    vm.runtime.setEditingTarget(clone);
    t.same(extension.getContainers().map(item => item.value), [ContainerOption.SELF, 'A'],
        'cloned members use the same relative menu semantics');
    vm.runtime.setEditingTarget(outside);
    t.same(extension.getContainers().map(item => item.value),
        ['A', 'A//N']);
    for (const [id, opcode, field, value] of [
        ['named', 'containers_menu_containers', 'containers', 'A//N'],
        ['self', 'containers_menu_containers', 'containers', ContainerOption.SELF],
        ['literal', 'text', 'TEXT', 'A//N']
    ]) {
        target.blocks.createBlock({id,
            opcode,
            fields: {[field]: {name: field, value}},
            inputs: {},
            topLevel: true,
            shadow: true,
            parent: null,
            next: null});
    }
    containers.beginUpdate();
    containers.move('A', 'B');
    vm.renameSprite(target.id, 'B//N//one');
    containers.endUpdate();
    t.equal(target.blocks.getBlock('named').fields.containers.value, 'B//N');
    t.equal(target.blocks.getBlock('self').fields.containers.value, ContainerOption.SELF);
    t.equal(target.blocks.getBlock('literal').fields.TEXT.value, 'A//N');
    vm.quit();
    t.end();
});

test('named inputs are literal paths without prefix decoding', t => {
    const {vm, add, extension, containers} = setup();
    const target = add('A//one');
    const other = add('_container_:A//two');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('_container_:A', true);
    extension.setProperty({CONTAINER: '_container_:A', PROPERTY: 'x', VALUE: 20}, {target});
    t.equal(containers.get('_container_:A').transform.x, 20, 'prefix-like text is an ordinary path');
    t.notOk(containers.get('A').transform, 'the prefix is never stripped to select another container');
    vm.runtime.setEditingTarget(other);
    t.same(extension.getContainers().map(item => item.value), [ContainerOption.SELF, 'A']);
    vm.setSpriteFolderContainer('_container_:A', false);
    extension.setProperty({CONTAINER: '_container_:A', PROPERTY: 'x', VALUE: 40}, {target});
    t.notOk(containers.get('A').transform, 'missing prefixed names do not fall back to a legacy selection');
    vm.quit();
    t.end();
});

test('transforms compose, validate numeric input, and update the editor without changing local sprite state', t => {
    const {vm, add, extension, containers} = setup();
    const target = add('A//N//one');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    target.setXY(10, 5);
    const util = {target};
    const args = {CONTAINER: ContainerOption.SELF, PROPERTY: 'x', VALUE: '20'};
    vm.runtime._refreshTargets = false;
    extension.setProperty(args, util);
    extension.changeProperty({...args, VALUE: '5'}, util);
    t.equal(extension.property(args, util), 25);
    t.ok(vm.runtime._refreshTargets, 'runtime changes refresh container controls at the next frame');
    extension.setProperty({CONTAINER: 'A', PROPERTY: 'size', VALUE: 200}, util);
    t.same(target.getWorldPosition(), [70, 10], 'nested transforms use local coordinates');
    t.same([target.x, target.y], [10, 5], 'member local properties are preserved');
    extension.goToXY({CONTAINER: ContainerOption.SELF, X: -10, Y: 20}, util);
    t.same(target.getWorldPosition(), [0, 50]);
    extension.setProperty({...args, PROPERTY: 'direction', VALUE: 450}, util);
    t.equal(extension.property({...args, PROPERTY: 'direction'}, util), 90);
    extension.setRotationStyle({CONTAINER: ContainerOption.SELF, STYLE: 'left-right'}, util);
    t.equal(containers.get('A//N').transform.rotationStyle, 'left-right');
    const saved = containers.serialize();
    for (const [PROPERTY, VALUE] of [['size', 0], ['size', -1], ['size', 10001], ['x', Infinity],
        ['y', -Infinity], ['__proto__', 1], ['rotationStyle', 2]]) {
        extension.setProperty({...args, PROPERTY, VALUE}, util);
    }
    extension.goToXY({CONTAINER: 'A', X: 50, Y: Infinity}, util);
    extension.setRotationStyle({CONTAINER: 'A', STYLE: 'invalid'}, util);
    t.same(containers.serialize(), saved, 'invalid patches do not partially update a transform');
    extension.setProperty({...args, CONTAINER: 'missing'}, util);
    t.equal(extension.property({...args, CONTAINER: 'missing'}, util), 0);
    t.equal(extension.property({...args, PROPERTY: '__proto__'}, util), 0);
    vm.quit();
    t.end();
});

test('visibility is the selected container own state and layer operations preserve sibling semantics', t => {
    const {vm, renderer, add, extension} = setup();
    const target = add('A//N//one');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const util = {target};
    extension.hide({CONTAINER: 'A'}, util);
    t.notOk(target.isEffectivelyVisible());
    t.ok(extension.isVisible({CONTAINER: ContainerOption.SELF}, util), 'parent hide preserves child flag');
    extension.hide({CONTAINER: ContainerOption.SELF}, util);
    extension.show({CONTAINER: 'A'}, util);
    t.notOk(target.isEffectivelyVisible());
    t.ok(target.visible);
    extension.show({CONTAINER: ContainerOption.SELF}, util);
    t.ok(target.isEffectivelyVisible());
    t.notOk(extension.isVisible({CONTAINER: 'missing'}, util));
    extension.goToLayer({CONTAINER: ContainerOption.SELF, LAYER: 'front'}, util);
    t.same(renderer.containerOrder, ['A//N', Infinity, 'sprite', false]);
    extension.goToLayer({CONTAINER: 'A', LAYER: 'back'}, util);
    t.same(renderer.containerOrder, ['A', -Infinity, 'sprite', false]);
    extension.moveLayers({CONTAINER: ContainerOption.SELF, DIRECTION: 'backward', LAYERS: 2.4}, util);
    t.same(renderer.containerOrder, ['A//N', -2, 'sprite', true]);
    extension.moveLayers({CONTAINER: 'A', DIRECTION: 'forward', LAYERS: Infinity}, util);
    t.same(renderer.containerOrder, ['A//N', -2, 'sprite', true]);
    vm.quit();
    t.end();
});

test('relative operations isolate container instances and group deletion stops only that subtree', t => {
    const {vm, add, extension, containers} = setup();
    const target = add('A//one');
    add('A//N//two');
    const outside = add('outside');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    extension.createClone({CONTAINER: 'A'}, {target: outside});
    const clones = vm.runtime.targets.filter(member => !member.isOriginal);
    const instance = containers.getContainingContainer(clones[0]).id;
    extension.setProperty({CONTAINER: ContainerOption.SELF, PROPERTY: 'x', VALUE: 80}, {target: clones[0]});
    t.equal(containers.get(instance).transform.x, 80);
    t.notOk(containers.get('A').transform, 'source container unchanged');
    extension.createClone({CONTAINER: ContainerOption.SELF}, {target: clones[0]});
    const other = vm.runtime.targets.filter(member => !member.isOriginal && !clones.includes(member));
    const otherID = containers.getContainingContainer(other[0]).id;
    t.equal(containers.get(otherID).transform.x, 80, 'relative cloning copies live instance state');
    extension.setProperty({CONTAINER: 'A', PROPERTY: 'y', VALUE: 50}, {target: clones[0]});
    t.equal(containers.get('A').transform.y, 50, 'named choices always resolve to the original');
    t.equal(containers.get(instance).transform.y, 0);
    const stopped = [];
    const stopForTarget = vm.runtime.stopForTarget.bind(vm.runtime);
    vm.runtime.stopForTarget = member => {
        stopped.push(member.id);
        stopForTarget(member);
    };
    extension.deleteClone({}, {target});
    extension.deleteClone({}, {target: outside});
    t.equal(vm.runtime._cloneCounter, 4, 'source and ordinary sprites cannot delete a container');
    extension.deleteClone({}, {target: clones[0]});
    t.same([...new Set(stopped)].sort(), clones.map(member => member.id).sort(),
        'all deleted members have their threads stopped');
    t.equal(vm.runtime._cloneCounter, 2);
    t.notOk(containers.get(instance));
    t.ok(containers.get(otherID));
    t.ok(other.every(member => vm.runtime.targets.includes(member)));
    t.ok(vm.runtime.targets.includes(target));
    vm.quit();
    t.end();
});

test('nested instance deletion preserves its parent, siblings and source, including ordinary sprite clones', t => {
    const {vm, add, extension, containers} = setup();
    const root = add('A//one');
    const nested = add('A//N//two');
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A//N', true);
    const [rootClone, nestedClone] = containers.createClone('A');
    const siblings = containers.createClone('A');
    const extra = nestedClone.makeClone();
    vm.runtime.addTarget(extra);
    const nestedID = containers.getContainingContainer(nestedClone).id;
    extension.deleteClone({}, {target: extra});
    t.notOk(containers.get(nestedID), 'whole nested instance is removed');
    t.ok(vm.runtime.targets.includes(rootClone), 'parent member survives');
    t.ok(siblings.every(member => vm.runtime.targets.includes(member)), 'independent sibling instance survives');
    t.ok(vm.runtime.targets.includes(root) && vm.runtime.targets.includes(nested), 'source members survive');
    t.equal(vm.runtime._cloneCounter, 3);
    const ordinary = nested.makeClone();
    vm.runtime.addTarget(ordinary);
    extension.deleteClone({}, {target: ordinary});
    t.ok(vm.runtime.targets.includes(ordinary), 'a sprite clone in an original container cannot delete the source');
    extension.createClone({CONTAINER: ContainerOption.SELF}, {target: rootClone});
    t.equal(vm.runtime._cloneCounter, 5, 'copying the remaining parent does not resurrect the deleted subtree');
    vm.stopAll();
    t.equal(containers.cloneDefinitions.size, 0);
    vm.quit();
    t.end();
});

test('creating a container loads the built-in once and emits reporter-compatible menu shadows', t => {
    const {vm, add} = setup();
    const target = add('A//one');
    t.ok(vm.extensionManager.isBuiltinExtension('containers'));
    t.notOk(vm.extensionManager.isExtensionLoaded('containers'), 'ordinary folder does not load the extension');
    vm.setSpriteFolderContainer('missing', true);
    vm.setSpriteFolderContainer('A', false);
    t.notOk(vm.extensionManager.isExtensionLoaded('containers'), 'failed or disabled conversion does not load it');
    let loads = 0;
    const load = vm.extensionManager.loadExtensionIdSync.bind(vm.extensionManager);
    vm.extensionManager.loadExtensionIdSync = id => {
        if (id === 'containers') loads++;
        load(id);
    };
    vm.setSpriteFolderContainer('A', true);
    t.ok(vm.extensionManager.isExtensionLoaded('containers'));
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteFolderContainer('A', false);
    vm.setSpriteFolderContainer('A', true);
    t.equal(loads, 1, 'repeated conversions reuse the registered extension');
    const xml = vm.runtime.getBlocksXML(target).find(category => category.id === 'containers').xml;
    t.match(xml, 'containers_menu_containers');
    for (const block of new Containers(vm.runtime).getInfo().blocks.filter(item => item.opcode)) {
        t.type(vm.runtime.getOpcodeFunction(`containers_${block.opcode}`), 'function');
    }
    const deletion = vm.runtime.getBlocksJSON().find(block => block && block.type === 'containers_deleteClone');
    t.equal(deletion.previousStatement, null, 'delete connects to a preceding command');
    t.notOk(Object.prototype.hasOwnProperty.call(deletion, 'nextStatement'), 'delete is a terminal block');
    vm.quit();
    t.end();
});

test('projects with containers but no blocks or extension declaration load and save the extension', async t => {
    const project = spriteContainers => ({
        targets: [true, false].map(isStage => ({isStage,
            name: isStage ? 'Stage' : 'A//one',
            variables: {},
            lists: {},
            broadcasts: {},
            blocks: {},
            comments: {},
            costumes: [],
            sounds: [],
            currentCostume: 0})),
        monitors: [],
        extensions: [],
        spriteContainers,
        meta: {semver: '3.0.0'}
    });
    for (const [metadata, expected] of [[[], false], [[{path: 'missing'}], false],
        [[{path: '//invalid'}], false], [[{path: 'A'}], true]]) {
        const vm = new VM();
        t.teardown(() => vm.quit());
        await vm.loadProject(project(metadata));
        t.equal(vm.extensionManager.isExtensionLoaded('containers'), expected, JSON.stringify(metadata));
        const saved = JSON.parse(vm.toJSON());
        t.equal(saved.extensions.includes('containers'), expected, 'saved dependency follows active containers');
        const target = vm.runtime.getSpriteTargetByName('A//one');
        t.notOk(JSON.parse(vm.toJSON(target.id)).extensions, 'sprite export does not carry project containers');
        if (expected) {
            const reloaded = new VM();
            t.teardown(() => reloaded.quit());
            await reloaded.loadProject(saved);
            t.ok(reloaded.extensionManager.isExtensionLoaded('containers'), 'round trip restores the extension');
            t.ok(reloaded.runtime.getBlocksXML(reloaded.editingTarget).some(category => category.id === 'containers'));
        }
    }
});
