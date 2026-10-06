const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Transform = require('../../src/util/container-transform');

// Count actual matrix construction across a shared container, rather than timing a machine-dependent benchmark.
test('container sync reuses geometry across members while invalidating every geometry input', t => {
    const vm = new VM();
    const sprite = new Sprite(null, vm.runtime);
    sprite.name = 'A//Sprite';
    const target = sprite.createClone();
    vm.runtime.addTarget(target);
    const containers = vm.runtime.spriteContainers;
    containers.set('A', true);
    containers.beginUpdate();
    for (let i = 0; i < 50; i++) vm.runtime.addTarget(target.makeClone());
    containers.endUpdate();
    const matrix = Transform.matrix;
    let builds = 0;
    Transform.matrix = (...args) => {
        builds++;
        return matrix(...args);
    };
    t.teardown(() => {
        Transform.matrix = matrix;
        vm.quit();
    });
    const geometry = {frame: {x: 0, y: 0, width: 100, height: 60},
        perspective: [[20, 0], [-20, 0], [0, 0], [0, 0]]};
    containers.setGeometry('A', geometry);
    t.equal(builds, 1, 'one projective solve for 51 members');
    const original = JSON.stringify;
    let serializations = 0;
    JSON.stringify = (...args) => {
        serializations++;
        return original(...args);
    };
    try {
        for (let i = 0; i < 20; i++) containers.sync();
    } finally {
        JSON.stringify = original;
    }
    t.equal(serializations, 0, 'unchanged synchronization does not serialize geometry');
    t.equal(builds, 1, 'unchanged sync reuses prepared matrices');
    containers.setVisible('A', false);
    t.equal(builds, 1, 'visibility does not rebuild geometry');
    const snapshot = containers.getTargetContainers(target)[0];
    snapshot.geometry.perspective[0][0] = 99;
    snapshot.geometry.frame.width = 900;
    t.same(containers.get('A').geometry.perspective, geometry.perspective, 'public snapshots stay independent');
    t.equal(containers.get('A').geometry.frame.width, 100);
    containers.setStretch('A', {x: -200, y: 100});
    t.equal(builds, 2, 'stretch invalidates once');
    t.ok(target.localToWorld(10, 0)[0] < 0, 'mirroring reaches members');
    containers.setTransform('A', {x: 50});
    t.equal(builds, 3, 'affine transform invalidates once');
    t.ok(Math.abs(target.localToWorld(0, 0)[0] - 50) < 1e-6);
    let changes = 0;
    target.emitVisualChange = () => {
        changes++;
    };
    containers.setGeometry('A', {perspective: null});
    t.equal(builds, 4, 'geometry invalidates even when the affine matrix is unchanged');
    t.ok(changes > 0, 'changed geometry emits a visual change');
    t.same(target.localToWorld(0, 0), [50, 0], 'cleared perspective reaches members');
    changes = 0;
    containers.sync();
    t.equal(changes, 0, 'unchanged geometry does not emit a visual change');
    t.notMatch(containers.serialize(), /_matrixCache|_containerGeometries/, 'cache stays out of project data');
    t.end();
});
