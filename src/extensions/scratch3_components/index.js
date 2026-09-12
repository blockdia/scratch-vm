const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

const text = (id, defaultMessage) => formatMessage({id: `components.${id}`, default: defaultMessage});
const numericTypes = ['slider', 'progress'];
const numericProperties = ['value', 'min', 'max', 'step'];

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
                {opcode: 'value',
                    blockType: BlockType.REPORTER,
                    text: text('value', 'value'),
                    componentTypes: numericTypes,
                    disableMonitor: true},
                {opcode: 'changeValue',
                    blockType: BlockType.COMMAND,
                    text: text('changeValue', 'change value by [VALUE]'),
                    componentTypes: numericTypes,
                    arguments: {VALUE: number(1)}},
                {opcode: 'setValue',
                    blockType: BlockType.COMMAND,
                    text: text('setValue', 'set value to [VALUE]'),
                    componentTypes: numericTypes,
                    arguments: {VALUE: number(50)}},
                {opcode: 'whenValueChanged',
                    blockType: BlockType.EVENT,
                    text: text('whenValueChanged', 'when value changes'),
                    componentTypes: numericTypes,
                    isEdgeActivated: false},
                {opcode: 'whenClicked',
                    blockType: BlockType.EVENT,
                    text: text('whenClicked', 'when button clicked'),
                    componentTypes: ['button'],
                    isEdgeActivated: false},
                {opcode: 'isChecked',
                    blockType: BlockType.BOOLEAN,
                    text: text('isChecked', 'checked?'),
                    componentTypes: ['toggle'],
                    disableMonitor: true},
                {opcode: 'setChecked',
                    blockType: BlockType.COMMAND,
                    text: text('setChecked', 'set checked to [CHECKED]'),
                    componentTypes: ['toggle'],
                    arguments: {CHECKED: {type: ArgumentType.BOOLEAN}}},
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
                numericProperties: {acceptReporters: false,
                    items: [
                        {text: text('value', 'value'), value: 'value'},
                        {text: text('min', 'minimum'), value: 'min'},
                        {text: text('max', 'maximum'), value: 'max'},
                        {text: text('step', 'step'), value: 'step'}
                    ]}
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
                    types.includes(target.component.type)) {
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
        return this._targets(['toggle']);
    }
    _target (name, util) {
        name = Cast.toString(name);
        if (name === '_myself_') return util.target;
        return this.runtime && this.runtime.targets.find(target => target.isOriginal && !target.isStage &&
            target.getName() === name);
    }
    _number (target, property) {
        const props = target && target.component && target.component.properties;
        return props && numericProperties.includes(property) &&
            typeof props[property] === 'number' ? props[property] : 0;
    }
    _setNumber (target, property, input, change = false) {
        if (!target || !target.componentController || !numericProperties.includes(property)) return;
        const props = target.component.properties;
        if (typeof props[property] !== 'number') return;
        const value = Cast.toNumber(input) + (change ? props[property] : 0);
        if (!Number.isFinite(value)) return;
        const next = Object.assign({}, props, {[property]: value});
        if (next.max <= next.min || !Number.isFinite(next.max - next.min) || next.step < 0) return;
        target.componentController.setProperties({[property]: value});
    }
    value (args, util) {
        return this._number(util.target, 'value');
    }
    changeValue (args, util) {
        this._setNumber(util.target, 'value', args.VALUE, true);
    }
    setValue (args, util) {
        this._setNumber(util.target, 'value', args.VALUE);
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
    isChecked (args, util) {
        const config = util.target && util.target.component;
        return Boolean(config && config.type === 'toggle' && config.properties.checked);
    }
    setChecked (args, util) {
        const target = util.target;
        if (target && target.componentController && target.component.type === 'toggle') {
            target.componentController.setProperties({checked: Cast.toBoolean(args.CHECKED)});
        }
    }
    targetIsChecked (args, util) {
        return this.isChecked(args, {target: this._target(args.TARGET, util)});
    }
    setTargetChecked (args, util) {
        this.setChecked(args, {target: this._target(args.TARGET, util)});
    }
}
module.exports = Components;
