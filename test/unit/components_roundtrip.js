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
    t.notOk(vm.runtime.getOpcodeFunction('components_setValue'), 'removed shortcut opcode is not registered');
    t.notOk(vm.runtime.getOpcodeFunction('components_whenValueChanged'), 'removed value hat is not registered');
    const expected = {
        slider: [],
        progress: [],
        button: ['whenClicked'],
        toggle: ['whenStateChanged']
    };
    const selfOpcodes = Object.values(expected).flat();
    for (const target of vm.runtime.targets) {
        const xml = vm.runtime.getBlocksXML(target).find(category => category.id === 'components').xml;
        for (const opcode of selfOpcodes) {
            t.equal(xml.includes(`type="components_${opcode}"`),
                Boolean(target.component && expected[target.component.type].includes(opcode)),
                `${target.getName()}: ${opcode}`);
        }
        t.ok(xml.includes('components_menu_numericTargets'), 'standard dropdown shadow');
        t.ok(xml.includes('components_targetProperty'), 'cross-component blocks available to stage and sprites');
        t.notMatch(xml, /^<category[^>]*><sep/, 'no leading separator');
        t.notMatch(xml, /<sep[^>]*\/><sep/, 'no adjacent separators');
    }
    const allDefinitions = vm.runtime.getBlocksJSON();
    t.ok(allDefinitions.some(block => block && block.type === 'components_whenStateChanged'),
        'filtering does not unregister blocks in existing scripts');
    for (const opcode of ['value', 'changeValue', 'setValue', 'whenValueChanged', 'isChecked', 'setChecked']) {
        t.notOk(allDefinitions.some(block => block && block.type === `components_${opcode}`),
            `${opcode} shortcut definition is removed`);
    }
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
