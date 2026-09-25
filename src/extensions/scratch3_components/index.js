const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');
const Model = require('../../components/model');

const text = (id, defaultMessage) => formatMessage({id: `components.${id}`, default: defaultMessage});
const numericTypes = Model.getTypesWithScriptableProperties('number');
const booleanTypes = Model.getTypesWithScriptableProperties('boolean');

class Components {
    constructor (runtime) {
        this.runtime = runtime;
    }
    getInfo () {
        const number = defaultValue => ({type: ArgumentType.NUMBER, defaultValue});
        const target = menu => ({type: ArgumentType.STRING, menu});
        const property = {type: ArgumentType.STRING, menu: 'numericProperties', defaultValue: 'value'};
        return {
            id: 'components',
            name: text('name', 'Components'),
            color1: '#537FBA',
            blocks: [
                {opcode: 'whenClicked',
                    blockType: BlockType.EVENT,
                    text: text('whenClicked', 'when button clicked'),
                    componentTypes: ['button'],
                    isEdgeActivated: false},
                {opcode: 'whenStateChanged',
                    blockType: BlockType.EVENT,
                    text: text('whenStateChanged', 'when checked state changes'),
                    componentTypes: ['toggle'],
                    isEdgeActivated: false},
                '---',
                {opcode: 'targetProperty',
                    blockType: BlockType.REPORTER,
                    text: text('targetProperty', '[PROPERTY] of [TARGET]'),
                    disableMonitor: true,
                    arguments: {TARGET: target('numericTargets'), PROPERTY: property}},
                {opcode: 'changeTargetProperty',
                    blockType: BlockType.COMMAND,
                    text: text('changeTargetProperty', 'change [PROPERTY] of [TARGET] by [VALUE]'),
                    arguments: {TARGET: target('numericTargets'), PROPERTY: property, VALUE: number(1)}},
                {opcode: 'setTargetProperty',
                    blockType: BlockType.COMMAND,
                    text: text('setTargetProperty', 'set [PROPERTY] of [TARGET] to [VALUE]'),
                    arguments: {TARGET: target('numericTargets'), PROPERTY: property, VALUE: number(50)}},
                '---',
                {opcode: 'targetIsChecked',
                    blockType: BlockType.BOOLEAN,
                    text: text('targetIsChecked', '[TARGET] checked?'),
                    disableMonitor: true,
                    arguments: {TARGET: target('toggleTargets')}},
                {opcode: 'setTargetChecked',
                    blockType: BlockType.COMMAND,
                    text: text('setTargetChecked', 'set [TARGET] checked to [CHECKED]'),
                    arguments: {TARGET: target('toggleTargets'), CHECKED: {type: ArgumentType.BOOLEAN}}}
            ],
            menus: {
                numericTargets: {acceptReporters: true, items: 'numericTargets'},
                toggleTargets: {acceptReporters: true, items: 'toggleTargets'},
                numericProperties: {
                    acceptReporters: false,
                    items: 'numericProperties',
                    dependsOn: {argument: 'TARGET', field: 'numericTargets'}
                }
            }
        };
    }
    _targets (types) {
        const items = [];
        const editing = this.runtime && this.runtime.getEditingTarget();
        if (editing && editing.component && types.includes(editing.component.type)) {
            items.push({text: text('myself', 'myself'), value: '_myself_'});
        }
        if (this.runtime) {
            for (const target of this.runtime.targets) {
                if (target.isOriginal && !target.isStage && target.component && !target.componentError &&
                    types.includes(target.component.type) && (!editing || target.sprite !== editing.sprite)) {
                    items.push({text: target.getName(), value: target.getName()});
                }
            }
        }
        return items.length ? items : [{text: text('noComponents', 'no matching components'), value: ''}];
    }
    numericTargets () {
        return this._targets(numericTypes);
    }
    toggleTargets () {
        return this._targets(booleanTypes);
    }
    numericProperties (editingTargetID, menuContext) {
        const selectedTarget = menuContext && menuContext.TARGET;
        let target = null;
        if (selectedTarget === '_myself_') {
            target = this.runtime && (this.runtime.getTargetById(editingTargetID) || this.runtime.getEditingTarget());
        } else if (selectedTarget) {
            target = this._targetByName(selectedTarget);
        }
        const types = target && target.component && !target.componentError ? [target.component.type] : numericTypes;
        const names = [];
        for (const type of types) {
            for (const name of Model.getScriptableProperties(type, 'number')) {
                if (!names.includes(name)) names.push(name);
            }
        }
        return names.map(name => ({text: text(name, name), value: name}));
    }
    _targetByName (name) {
        return this.runtime && this.runtime.targets.find(target => target.isOriginal && !target.isStage &&
            target.getName() === name);
    }
    _target (name, util) {
        name = Cast.toString(name);
        if (name === '_myself_') return util.target;
        return this._targetByName(name);
    }
    _number (target, property) {
        const props = target && target.component && target.component.properties;
        return props && Model.hasScriptableProperty(target.component.type, property, 'number') &&
            typeof props[property] === 'number' ? props[property] : 0;
    }
    _setNumber (target, property, input, change = false) {
        if (!target || !target.componentController ||
            !Model.hasScriptableProperty(target.component.type, property, 'number')) return;
        const props = target.component.properties;
        if (typeof props[property] !== 'number') return;
        const value = Cast.toNumber(input) + (change ? props[property] : 0);
        if (!Number.isFinite(value)) return;
        const next = Model.copy(target.component);
        next.properties[property] = value;
        try {
            Model.normalize(next, target.getCostumes());
        } catch (e) {
            return;
        }
        target.componentController.setProperties({[property]: value});
    }
    targetProperty (args, util) {
        return this._number(this._target(args.TARGET, util), args.PROPERTY);
    }
    changeTargetProperty (args, util) {
        this._setNumber(this._target(args.TARGET, util), args.PROPERTY, args.VALUE, true);
    }
    setTargetProperty (args, util) {
        this._setNumber(this._target(args.TARGET, util), args.PROPERTY, args.VALUE);
    }
    targetIsChecked (args, util) {
        const target = this._target(args.TARGET, util);
        return Boolean(target && target.component &&
            Model.hasScriptableProperty(target.component.type, 'checked', 'boolean') &&
            target.component.properties.checked);
    }
    setTargetChecked (args, util) {
        const target = this._target(args.TARGET, util);
        if (target && target.componentController &&
            Model.hasScriptableProperty(target.component.type, 'checked', 'boolean')) {
            target.componentController.setProperties({checked: Cast.toBoolean(args.CHECKED)});
        }
    }
}
module.exports = Components;
