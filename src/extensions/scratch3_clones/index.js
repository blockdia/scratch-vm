const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const text = (id, message) => formatMessage({id: `clones.${id}`, default: message});

class Clones {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        const target = {type: ArgumentType.STRING, menu: 'targets'};
        return {
            id: 'clones',
            name: text('name', 'Clones'),
            color1: '#FFAB19',
            blocks: [
                {opcode: 'id',
                    blockType: BlockType.REPORTER,
                    text: text('id', 'my ID'),
                    disableMonitor: true},
                {opcode: 'targetId',
                    blockType: BlockType.REPORTER,
                    text: text('targetId', 'original ID of [TARGET]'),
                    disableMonitor: true,
                    arguments: {TARGET: {type: ArgumentType.STRING, menu: 'originalTargets'}}},
                {opcode: 'cloneId',
                    blockType: BlockType.REPORTER,
                    text: text('cloneId', '@clone: [ID]'),
                    disableMonitor: true,
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: 'boss'}}},
                {opcode: 'isClone',
                    blockType: BlockType.BOOLEAN,
                    text: text('isClone', 'am I a clone?'),
                    disableMonitor: true},
                {opcode: 'exists',
                    blockType: BlockType.BOOLEAN,
                    text: text('exists', 'ID [ID] exists?'),
                    disableMonitor: true,
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: '@clone:boss'}}},
                '---',
                {opcode: 'lastId',
                    blockType: BlockType.REPORTER,
                    text: text('lastId', 'last created clone ID')},
                {opcode: 'createWithId',
                    blockType: BlockType.COMMAND,
                    text: text('createWithId', 'create clone of [TARGET] with ID @clone: [ID]'),
                    arguments: {TARGET: target, ID: {type: ArgumentType.STRING, defaultValue: 'boss'}}},
                {opcode: 'delete',
                    blockType: BlockType.COMMAND,
                    text: text('delete', 'delete clone [ID]'),
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: '@clone:boss'}}}
            ],
            menus: {targets: {acceptReporters: true, items: 'getTargets'},
                originalTargets: {acceptReporters: true, items: 'getOriginalTargets'}}
        };
    }

    getTargets () {
        // Match the native clone menu: myself replaces the edited sprite, and is absent on the stage.
        const editing = this.runtime.getEditingTarget();
        const items = this.runtime.targets.filter(target => target.isOriginal && !target.isStage && target !== editing)
            .map(target => ({text: target.getName(), value: target.getName()}));
        if (!editing || !editing.isStage) items.unshift({text: text('myself', 'myself'), value: '_myself_'});
        return items.length ? items : [{text: '', value: ''}];
    }

    getOriginalTargets () {
        return this.getTargets();
    }

    id (args, util) {
        return util.target ? util.target.publicId || '' : '';
    }

    targetId (args, util) {
        const reference = Cast.toString(args.TARGET);
        const target = reference === '_myself_' ? util.target :
            reference === '_stage_' ? this.runtime.getTargetForStage() : this.runtime.resolveTargetReference(reference);
        const original = target && (target.isOriginal ? target :
            target.sprite.clones.find(member => member.isOriginal));
        return original ? original.publicId : '';
    }

    cloneId (args) {
        return `@clone:${Cast.toString(args.ID)}`;
    }

    isClone (args, util) {
        return Boolean(util.target && !util.target.isStage && util.target.isOriginal === false);
    }

    exists (args) {
        return Boolean(this.runtime.targetReferences.get(Cast.toString(args.ID)));
    }

    lastId () {
        return this.runtime.lastCloneId;
    }

    createWithId (args, util) {
        const clone = this.runtime.ext_scratch3_control._createClone(Cast.toString(args.TARGET), util.target,
            {cloneId: Cast.toString(args.ID), startHats: false});
        // Hats can evaluate blocks immediately. Preserve the caller's execution context.
        if (clone) util.startHats('control_start_as_clone', null, clone);
    }

    delete (args) {
        const id = Cast.toString(args.ID);
        const target = this.runtime.targetReferences.get(id);
        if (target && !target.isOriginal && !target.isStage) this.runtime.disposeTarget(target);
    }
}

module.exports = Clones;
