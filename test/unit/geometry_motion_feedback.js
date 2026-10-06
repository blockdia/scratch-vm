const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Renderer = require('../fixtures/component-renderer');

const setup = () => {
    const vm = new VM();
    const renderer = new Renderer();
    renderer.setDrawableContainerPaths = () => {};
    renderer.setDrawableContainerOrder = () => {};
    renderer.getContainerGeometryFrame = () => ({x: 0, y: 0, width: 100, height: 60});
    vm.attachRenderer(renderer);
    const add = name => {
        const sprite = new Sprite(null, vm.runtime);
        sprite.name = name;
        sprite.costumes = [{name: 'costume', skinId: 0}];
        const target = sprite.createClone();
        vm.runtime.addTarget(target);
        return target;
    };
    add('Stage').isStage = true;
    const target = add('A//Sprite');
    const marker = add('Marker');
    marker.setXY(0, 150);
    vm.setSpriteFolderContainer('A', true);
    vm.setSpriteContainerGeometry('A', {frame: {x: 0, y: 0, width: 100, height: 60},
        perspective: [[20, 0], [-20, 0], [0, 0], [0, 0]]});
    vm.extensionManager.loadExtensionIdSync('containers');
    return {vm, target};
};

for (const enabled of [false, true]) {
    test(`unprojectable motion warns at its block and continues with compiler=${enabled}`, t => {
        const {vm, target} = setup();
        const previousDocument = global.document;
        global.document = {hidden: true};
        t.teardown(() => {
            if (typeof previousDocument === 'undefined') delete global.document;
            else global.document = previousDocument;
            vm.quit();
        });
        vm.setCompilerOptions({enabled});
        for (const [opcode, args, fields = {}, collapsed = false] of [
            ['containers_goToWorldXY', {X: 0, Y: 150}],
            ['containers_setWorldProperty', {VALUE: 150}, {PROPERTY: 'y'}],
            ['motion_goto', {TO: 'Marker'}],
            ['motion_glideto', {TO: 'Marker', SECS: 10}],
            ['motion_pointtowards', {TOWARDS: 'Marker'}],
            ['motion_ifonedgebounce', {}, {}, true],
            ['containers_setWorldProperty', {VALUE: 45}, {PROPERTY: 'direction'}, true]
        ]) {
            vm.runtime.logger.clear();
            vm.setSpriteContainerStretch('A', {x: collapsed ? 0 : 100, y: 100});
            target.setXY(0, 0);
            target.setDirection(90);
            target.getBounds = () => ({left: -300, right: -200, bottom: -5, top: 5});
            target.blocks.deleteAllBlocks();
            const block = (id, op, parent, next, inputs = {}, values = {}) => target.blocks.createBlock({id,
                opcode: op,
                parent,
                next,
                inputs,
                fields: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, {name, value}])),
                topLevel: !parent,
                shadow: op === 'text'});
            block('before', 'looks_hide', null, 'warning');
            block('warning', opcode, 'before', 'after',
                Object.fromEntries(Object.keys(args).map(name => [name, {name, block: name}])), fields);
            for (const [name, value] of Object.entries(args)) block(name, 'text', 'warning', null, {}, {TEXT: value});
            block('after', 'looks_show', 'warning', null);
            for (let repeat = 0; repeat < 3; repeat++) {
                const thread = vm.runtime._pushThread('before', target, {stackClick: true});
                for (let step = 0; step < 5; step++) vm.runtime._step();
                t.equal(Boolean(thread.isCompiled), enabled, opcode);
            }
            t.same([target.x, target.y, target.direction], [0, 0, 90], `${opcode} preserves state`);
            t.ok(target.visible, `${opcode} continues immediately`);
            const entries = vm.runtime.logger.getEntries();
            t.equal(entries.length, 1, opcode);
            t.match(entries[0], {code: 'COORDINATE_TRANSFORM_FAILED',
                source: 'motion',
                targetId: target.id,
                blockId: 'warning',
                subjectName: target.getName(),
                count: 3}, opcode);
        }
        t.end();
    });
}

test('coordinate queries and local recovery remain quiet; successful world movement still works', t => {
    const {vm, target} = setup();
    t.notOk(target.worldToLocal(0, 150).every(Number.isFinite));
    t.equal(target.setWorldPosition(0, 150), false, 'setter reports failure to its caller');
    target.setXY(0, -150);
    t.same([target.x, target.y], [0, -150], 'local movement can cross the horizon');
    target.setXY(0, 0);
    t.equal(target.setWorldPosition(0, 30), true);
    t.ok(Math.abs(target.getWorldPosition()[1] - 30) < 1e-6);
    t.same(vm.runtime.logger.getEntries(), [], 'low-level operations and queries do not log');
    vm.quit();
    t.end();
});
