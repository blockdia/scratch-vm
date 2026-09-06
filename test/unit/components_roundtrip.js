const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Storage = require('scratch-storage');
const template = require('../../src/components/templates');
const ComponentRenderer = require('../fixtures/component-renderer');

test('template creation, project reload and extension registration', async t => {
    const vm = new VM();
    vm.attachStorage(new Storage());
    vm.attachRenderer(new ComponentRenderer());
    const stage = template('button', vm.runtime.storage, 'Stage');
    stage.isStage = true;
    delete stage.component;
    await vm.loadProject(JSON.stringify({targets: [stage], meta: {semver: '3.0.0'}, monitors: [], extensions: []}));
    for (const type of ['slider', 'button', 'toggle', 'progress']) {
        await vm.addComponent(type, type);
        t.equal(vm.editingTarget.component.type, type);
        t.ok(vm.editingTarget.componentController);
    }
    t.ok(vm.runtime.getOpcodeFunction('components_setValue'));
    const json = vm.toJSON();
    const config = JSON.parse(json).targets.map(target => target.component);
    await vm.loadProject(json);
    t.same(vm.runtime.targets.map(target => target.component), config);
    t.ok(vm.runtime.targets.every(target => target.isStage || target.componentController));
    vm.quit();
});
