const {test} = require('tap');
const VM = require('../../src/virtual-machine');
const Sprite = require('../../src/sprites/sprite');
const Clones = require('../../src/extensions/scratch3_clones');
const Containers = require('../../src/extensions/scratch3_containers');

const setup = () => {
    const vm = new VM();
    const runtime = vm.runtime;
    const add = (name, isStage = false) => {
        const sprite = new Sprite(null, runtime);
        sprite.name = name;
        const target = sprite.createClone();
        target.isStage = isStage;
        runtime.addTarget(target);
        return target;
    };
    add('Stage', true);
    const caller = add('Caller');
    add('Group//One');
    const other = add('Group//Nested//Two');
    vm.setSpriteFolderContainer('Group', true);
    vm.setSpriteFolderContainer('Group//Nested', true);
    const thread = {target: caller, peekStack: () => 'creation-block'};
    const util = {target: caller, thread, startHats: (...args) => runtime.startHats(...args)};
    return {vm, runtime, caller, other, util};
};

test('native and ID clones report one shared capacity diagnostic with the requested sprite name', t => {
    const {vm, runtime, caller, other, util} = setup();
    runtime.runtimeOptions.maxClones = 0;
    runtime.sequencer.activeThread = util.thread;
    for (const create of [
        () => runtime.ext_scratch3_control.createClone({CLONE_OPTION: other.getName()}, util),
        () => new Clones(runtime).createWithId({TARGET: other.getName(), ID: 'boss'}, util)
    ]) {
        runtime.logger.clear();
        create();
        const entries = runtime.logger.getEntries();
        t.equal(entries.length, 1);
        t.match(entries[0], {code: 'CLONE_LIMIT',
            source: 'clones',
            level: 'warn',
            count: 1,
            subjectName: other.getName(),
            limit: '0',
            targetId: caller.id,
            blockId: 'creation-block'});
        t.match(entries[0].message, /Group\/\/Nested\/\/Two/);
        t.equal(runtime._cloneCounter, 0);
    }
    runtime.sequencer.activeThread = null;
    runtime.logger.clear();
    runtime.runtimeOptions.maxClones = Infinity;
    new Clones(runtime).createWithId({TARGET: other.getName(), ID: '123'}, util);
    t.equal(runtime.logger.getEntries()[0].code, 'INVALID_CLONE_ID', 'ID validation stays independent of capacity');
    vm.quit();
    t.end();
});

test('container preflight reports once with free slots and retains the source name for instances', t => {
    const {vm, runtime, caller, other, util} = setup();
    const extension = new Containers(runtime);
    const containers = runtime.spriteContainers;
    const makeClone = other.makeClone.bind(other);
    let memberAttempts = 0;
    other.makeClone = options => {
        memberAttempts++;
        return makeClone(options);
    };
    runtime.runtimeOptions.maxClones = 1;
    for (const method of ['createClone', 'createWithId']) {
        runtime.logger.clear();
        extension[method]({CONTAINER: '@container:Group', ID: 'squad'}, util);
        t.equal(runtime.logger.getEntries().length, 1);
        t.match(runtime.logger.getEntries()[0], {code: 'CLONE_LIMIT',
            source: 'containers',
            count: 1,
            subjectName: 'Group',
            limit: '1',
            targetId: caller.id,
            blockId: 'creation-block'});
        t.equal(runtime._cloneCounter, 0);
        t.equal(containers.cloneDefinitions.size, 0, 'no partial subtree');
        t.equal(runtime.lastContainerCloneId, '');
        t.equal(memberAttempts, 0, 'failed preflight returns before any member creation');
    }
    runtime.runtimeOptions.maxClones = 2;
    extension.createWithId({CONTAINER: '@container:Group', ID: 'squad'}, util);
    const instanceId = runtime.lastContainerCloneId;
    t.equal(runtime._cloneCounter, 2);
    runtime.logger.clear();
    extension.createClone({CONTAINER: instanceId}, util);
    t.equal(runtime.logger.getEntries().length, 1);
    t.match(runtime.logger.getEntries()[0], {source: 'containers', subjectName: 'Group', limit: '2'});
    t.equal(runtime._cloneCounter, 2, 'the existing instance survives');
    vm.quit();
    t.end();
});

test('container ID failures report once with caller context and leave no partial state', t => {
    const {vm, runtime, caller, util} = setup();
    const extension = new Containers(runtime);
    const containers = runtime.spriteContainers;
    for (const id of ['123', ' squad', 'squad ', '@clone:squad', '@sprite:squad',
        '@container:Group', '@container-clone:squad']) {
        runtime.logger.clear();
        extension.createWithId({CONTAINER: '@container:Group', ID: id}, util);
        t.equal(runtime.logger.getEntries().length, 1);
        t.match(runtime.logger.getEntries()[0], {code: 'INVALID_CLONE_ID',
            source: 'containers',
            count: 1,
            targetId: caller.id,
            blockId: 'creation-block'});
        t.ok(runtime.logger.getEntries()[0].message.includes(id));
        t.equal(runtime._cloneCounter, 0);
        t.equal(containers.cloneReferences.size, 0);
        t.equal(containers.cloneDefinitions.size, 0);
        t.equal(runtime.lastContainerCloneId, '');
    }
    extension.createWithId({CONTAINER: '@container:Group', ID: 'squad'}, util);
    const references = [...containers.cloneReferences];
    runtime.logger.clear();
    extension.createWithId({CONTAINER: '@container:Group', ID: 'squad'}, util);
    t.equal(runtime.logger.getEntries().length, 1);
    t.match(runtime.logger.getEntries()[0], {code: 'CLONE_ID_IN_USE', source: 'containers', count: 1});
    t.match(runtime.logger.getEntries()[0].message, /@container-clone:squad/);
    t.same([...containers.cloneReferences], references, 'existing instance and references survive the failure');
    t.equal(runtime._cloneCounter, 2);
    t.equal(runtime.lastContainerCloneId, '');
    runtime.logger.clear();
    extension.exists({ID: '@container-clone:missing'});
    t.equal(runtime.logger.getEntries().length, 0, 'existence checks stay silent');
    extension.createWithId({CONTAINER: '@container:Group', ID: ''}, util);
    t.equal(runtime._cloneCounter, 4, 'empty ID still allocates an automatic ID');
    t.equal(runtime.logger.getEntries().length, 0);
    vm.quit();
    t.end();
});

test('a limit change during container creation logs once for the group and rolls back all new members', t => {
    const {vm, runtime, util} = setup();
    runtime.runtimeOptions.maxClones = 10;
    runtime.on('targetWasCreated', target => {
        if (!target.isOriginal) runtime.runtimeOptions.maxClones = 1;
    });
    new Containers(runtime).createClone({CONTAINER: '@container:Group'}, util);
    t.equal(runtime._cloneCounter, 0);
    t.equal(runtime.spriteContainers.cloneDefinitions.size, 0);
    t.equal(runtime.logger.getEntries().length, 1);
    t.match(runtime.logger.getEntries()[0],
        {source: 'containers', code: 'CLONE_LIMIT', subjectName: 'Group', count: 1});
    vm.quit();
    t.end();
});
