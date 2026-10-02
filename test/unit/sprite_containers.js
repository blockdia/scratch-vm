const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Model = require('../../src/components/model');
const ComponentRenderer = require('../fixtures/component-renderer');

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
