const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const Cast = require('../../util/cast');
const formatMessage = require('format-message');

class Components {
    getInfo () {
        const text = (id, defaultMessage) => formatMessage({id: `components.${id}`, default: defaultMessage});
        return {
            id: 'components',
            name: text('name', 'Components'),
            color1: '#537FBA',
            blocks: [
                {opcode: 'value', blockType: BlockType.REPORTER, text: text('value', 'value'), disableMonitor: true},
                {opcode: 'setValue',
                    blockType: BlockType.COMMAND,
                    text: text('setValue', 'set value to [VALUE]'),
                    arguments: {VALUE: {type: ArgumentType.NUMBER, defaultValue: 50}}},
                {opcode: 'whenValueChanged',
                    blockType: BlockType.EVENT,
                    text: text('whenValueChanged', 'when value changes'),
                    isEdgeActivated: false},
                {opcode: 'whenClicked',
                    blockType: BlockType.EVENT,
                    text: text('whenClicked', 'when button clicked'),
                    isEdgeActivated: false},
                {opcode: 'isChecked',
                    blockType: BlockType.BOOLEAN,
                    text: text('isChecked', 'checked?'),
                    disableMonitor: true},
                {opcode: 'setChecked',
                    blockType: BlockType.COMMAND,
                    text: text('setChecked', 'set checked to [CHECKED]'),
                    arguments: {CHECKED: {type: ArgumentType.BOOLEAN}}},
                {opcode: 'whenStateChanged',
                    blockType: BlockType.EVENT,
                    text: text('whenStateChanged', 'when state changes'),
                    isEdgeActivated: false}
            ]
        };
    }
    value (args, util) {
        const config = util.target.component;
        return config && config.properties && typeof config.properties.value === 'number' ? config.properties.value : 0;
    }
    setValue (args, util) {
        const controller = util.target.componentController;
        if (controller && 'value' in util.target.component.properties) {
            const value = Cast.toNumber(args.VALUE);
            if (Number.isFinite(value)) controller.setProperties({value});
        }
    }
    isChecked (args, util) {
        const config = util.target.component;
        return Boolean(config && config.properties && config.properties.checked);
    }
    setChecked (args, util) {
        const controller = util.target.componentController;
        if (controller && util.target.component.type === 'toggle') {
            controller.setProperties({checked: Cast.toBoolean(args.CHECKED)});
        }
    }
}
module.exports = Components;
