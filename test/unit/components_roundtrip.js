const test = require('tap').test;
const VM = require('../../src/virtual-machine');
const Storage = require('scratch-storage');
const JSZip = require('@turbowarp/jszip');
const template = require('../../src/components/templates');
const ComponentRenderer = require('../fixtures/component-renderer');

test('template creation, project reload and extension registration', async t => {
    const vm = new VM();
    vm.attachStorage(new Storage());
    vm.attachRenderer(new ComponentRenderer());
    const {sprite: stage, assets} = template('button', vm.runtime.storage, 'Stage');
    stage.isStage = true;
    delete stage.component;
    const initial = new JSZip();
    initial.file('project.json', JSON.stringify({targets: [stage],
        meta: {semver: '3.0.0'},
        monitors: [],
        extensions: []}));
    for (const asset of assets) initial.file(`${asset.assetId}.${asset.dataFormat}`, asset.data);
    await vm.loadProject(await initial.generateAsync({type: 'uint8array'}));
    for (const type of ['slider', 'button', 'toggle', 'progress']) {
        await vm.addComponent(type, type);
        t.equal(vm.editingTarget.component.type, type);
        t.ok(vm.editingTarget.componentController);
    }
    t.ok(vm.runtime.getOpcodeFunction('components_setValue'));
    const json = vm.toJSON();
    const config = JSON.parse(json).targets.map(target => target.component);
    const assetIds = vm.runtime.targets.map(target => target.getCostumes().map(costume => costume.assetId));
    const saved = await vm.saveProjectSb3();
    await vm.loadProject(await saved.arrayBuffer());
    t.same(vm.runtime.targets.map(target => target.getCostumes().map(costume => costume.assetId)), assetIds);
    t.same(vm.runtime.targets.map(target => target.component), config);
    t.ok(vm.runtime.targets.every(target => target.isStage || target.componentController));
    vm.quit();
});
