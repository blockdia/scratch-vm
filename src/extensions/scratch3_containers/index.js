const BlockType = require('../../extension-support/block-type');
const ArgumentType = require('../../extension-support/argument-type');
const TargetType = require('../../extension-support/target-type');
const Cast = require('../../util/cast');
const ContainerOption = require('../../util/container-option');
const Transform = require('../../util/container-transform');
const Effects = require('../../util/container-effects');
const formatMessage = require('format-message');

const text = (id, defaultMessage) => formatMessage({id: `containers.${id}`, default: defaultMessage});
const numericProperties = ['x', 'y', 'size', 'direction'];
const creationWarnings = {
    INVALID_CLONE_ID: {
        id: 'containers.invalidCloneId',
        default: 'Cannot create container clone: ID "{id}" must not contain leading or trailing whitespace, ' +
            'consist only of digits, or start with a reserved reference prefix.'
    },
    CLONE_ID_IN_USE: {
        id: 'containers.cloneIdInUse',
        default: 'Cannot create container clone: ID "@container-clone:{id}" is already in use.'
    }
};

class Containers {
    constructor (runtime) {
        this.runtime = runtime;
    }

    getInfo () {
        const container = {type: ArgumentType.STRING, menu: 'containers'};
        const property = {type: ArgumentType.STRING, menu: 'properties', defaultValue: 'x'};
        const coordinate = {type: ArgumentType.STRING, menu: 'coordinates', defaultValue: 'x'};
        const space = defaultValue => ({type: ArgumentType.STRING, menu: 'coordinateSpaces', defaultValue});
        const number = defaultValue => ({type: ArgumentType.NUMBER, defaultValue});
        const item = (value, label) => ({text: text(value, label), value});
        return {
            id: 'containers',
            name: text('name', 'Containers'),
            color1: '#A9744F',
            blocks: [
                {opcode: 'property',
                    blockType: BlockType.REPORTER,
                    text: text('property', '[PROPERTY] of [CONTAINER]'),
                    disableMonitor: true,
                    arguments: {CONTAINER: container, PROPERTY: property}},
                {opcode: 'setProperty',
                    blockType: BlockType.COMMAND,
                    text: text('setProperty', 'set [PROPERTY] of [CONTAINER] to [VALUE]'),
                    arguments: {CONTAINER: container, PROPERTY: property, VALUE: number(0)}},
                {opcode: 'changeProperty',
                    blockType: BlockType.COMMAND,
                    text: text('changeProperty', 'change [PROPERTY] of [CONTAINER] by [VALUE]'),
                    arguments: {CONTAINER: container, PROPERTY: property, VALUE: number(10)}},
                {opcode: 'goToXY',
                    blockType: BlockType.COMMAND,
                    text: text('goToXY', 'go [CONTAINER] to x: [X] y: [Y]'),
                    arguments: {CONTAINER: container, X: number(0), Y: number(0)}},
                {opcode: 'setRotationStyle',
                    blockType: BlockType.COMMAND,
                    text: text('setRotationStyle', 'set rotation style of [CONTAINER] to [STYLE]'),
                    arguments: {CONTAINER: container, STYLE: {type: ArgumentType.STRING, menu: 'rotationStyles'}}},
                '---',
                {opcode: 'setWorldProperty',
                    blockType: BlockType.COMMAND,
                    text: text('setWorldProperty', 'set [PROPERTY] on stage to [VALUE]'),
                    filter: [TargetType.SPRITE],
                    arguments: {PROPERTY: property, VALUE: number(0)}},
                {opcode: 'goToWorldXY',
                    blockType: BlockType.COMMAND,
                    text: text('goToWorldXY', 'go to stage x: [X] y: [Y]'),
                    filter: [TargetType.SPRITE],
                    arguments: {X: number(0), Y: number(0)}},
                '---',
                {opcode: 'targetProperty',
                    blockType: BlockType.REPORTER,
                    text: text('targetProperty', '[PROPERTY] of [TARGET] in [SPACE]'),
                    disableMonitor: true,
                    arguments: {PROPERTY: {type: ArgumentType.STRING, menu: 'targetProperties', defaultValue: 'x'},
                        TARGET: {type: ArgumentType.STRING, menu: 'positionTargets', defaultValue: '_mouse_'},
                        SPACE: space(ContainerOption.SELF)}},
                {opcode: 'convertPoint',
                    blockType: BlockType.REPORTER,
                    text: text('convertPoint', '[COORDINATE] of x: [X] y: [Y] from [FROM] to [TO]'),
                    disableMonitor: true,
                    arguments: {COORDINATE: coordinate,
                        X: number(0),
                        Y: number(0),
                        FROM: space(ContainerOption.SELF),
                        TO: space(ContainerOption.STAGE)}},
                '---',
                {opcode: 'effect',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('effect', '[EFFECT] effect of [CONTAINER]'),
                    arguments: {CONTAINER: container, EFFECT: {type: ArgumentType.STRING, menu: 'effects'}}},
                {opcode: 'setEffect',
                    blockType: BlockType.COMMAND,
                    text: text('setEffect', 'set [EFFECT] effect of [CONTAINER] to [VALUE]'),
                    arguments: {CONTAINER: container,
                        EFFECT: {type: ArgumentType.STRING, menu: 'effects'},
                        VALUE: number(0)}},
                {opcode: 'changeEffect',
                    blockType: BlockType.COMMAND,
                    text: text('changeEffect', 'change [EFFECT] effect of [CONTAINER] by [VALUE]'),
                    arguments: {CONTAINER: container,
                        EFFECT: {type: ArgumentType.STRING, menu: 'effects'},
                        VALUE: number(25)}},
                {opcode: 'clearEffects',
                    blockType: BlockType.COMMAND,
                    text: text('clearEffects', 'clear graphic effects of [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                '---',
                {opcode: 'show',
                    blockType: BlockType.COMMAND,
                    text: text('show', 'show [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'hide',
                    blockType: BlockType.COMMAND,
                    text: text('hide', 'hide [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'isVisible',
                    blockType: BlockType.BOOLEAN,
                    text: text('isVisible', '[CONTAINER] shown?'),
                    disableMonitor: true,
                    arguments: {CONTAINER: container}},
                '---',
                {opcode: 'goToLayer',
                    blockType: BlockType.COMMAND,
                    text: text('goToLayer', 'go [CONTAINER] to [LAYER] layer'),
                    arguments: {CONTAINER: container, LAYER: {type: ArgumentType.STRING, menu: 'layers'}}},
                {opcode: 'moveLayers',
                    blockType: BlockType.COMMAND,
                    text: text('moveLayers', 'go [CONTAINER] [DIRECTION] [LAYERS] layers'),
                    arguments: {CONTAINER: container,
                        LAYERS: number(1),
                        DIRECTION: {type: ArgumentType.STRING, menu: 'layerDirections'}}},
                '---',
                {opcode: 'id',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('id', 'ID of [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'originalId',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('originalId', 'original ID of [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'parentId',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('parentId', 'parent container ID of [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'cloneId',
                    blockType: BlockType.REPORTER,
                    disableMonitor: true,
                    text: text('cloneId', '@container-clone: [ID]'),
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: 'boss'}}},
                {opcode: 'exists',
                    blockType: BlockType.BOOLEAN,
                    disableMonitor: true,
                    text: text('exists', 'container ID [ID] exists?'),
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: '@container-clone:boss'}}},
                '---',
                {opcode: 'lastId',
                    blockType: BlockType.REPORTER,
                    text: text('lastId', 'last created container clone ID')},
                {opcode: 'createClone',
                    blockType: BlockType.COMMAND,
                    text: text('createClone', 'create clone of [CONTAINER]'),
                    arguments: {CONTAINER: container}},
                {opcode: 'createWithId',
                    blockType: BlockType.COMMAND,
                    text: text('createWithId', 'create clone of [CONTAINER] with ID @container-clone: [ID]'),
                    arguments: {CONTAINER: container, ID: {type: ArgumentType.STRING, defaultValue: 'boss'}}},
                {opcode: 'deleteById',
                    blockType: BlockType.COMMAND,
                    text: text('deleteById', 'delete container clone [ID]'),
                    arguments: {ID: {type: ArgumentType.STRING, defaultValue: '@container-clone:boss'}}},
                {opcode: 'deleteClone',
                    blockType: BlockType.COMMAND,
                    isTerminal: true,
                    text: text('deleteClone', "delete the [CONTAINER] container clone I'm in"),
                    arguments: {CONTAINER: {type: ArgumentType.STRING,
                        menu: 'ancestorContainers',
                        defaultValue: ContainerOption.SELF}}}
            ],
            menus: {
                effects: {acceptReporters: false, items: Effects.names.map(name => item(name, name))},
                containers: {acceptReporters: true, items: 'getContainers'},
                ancestorContainers: {acceptReporters: true, items: 'getAncestorContainers'},
                positionTargets: {acceptReporters: true, items: 'getPositionTargets'},
                coordinateSpaces: {acceptReporters: true, items: 'getCoordinateSpaces'},
                targetProperties: {acceptReporters: false,
                    items: 'getTargetProperties',
                    dependsOn: {argument: 'TARGET', field: 'positionTargets'}},
                coordinates: {acceptReporters: false, items: [item('x', 'x position'), item('y', 'y position')]},
                properties: {acceptReporters: false,
                    items: [item('x', 'x position'), item('y', 'y position'),
                        item('size', 'size'), item('direction', 'direction')]},
                rotationStyles: {acceptReporters: false,
                    items: [item('all around', 'all around'), item('left-right', 'left-right'),
                        item("don't rotate", "don't rotate")]},
                layers: {acceptReporters: false, items: [item('front', 'front'), item('back', 'back')]},
                layerDirections: {acceptReporters: false,
                    items: [item('forward', 'forward'), item('backward', 'backward')]}
            }
        };
    }

    getContainers () {
        const containers = this.runtime.spriteContainers;
        const items = [];
        const current = containers.getContainingContainer(this.runtime.getEditingTarget());
        if (current) {
            items.push({text: text('containingContainer', 'my container'), value: ContainerOption.SELF});
        }
        // Like Scratch's sprite menu, the relative choice replaces the current named entry.
        for (const {path} of containers.serialize()) {
            if (!current || path !== current.path) items.push({text: path, value: path});
        }
        return items.length ? items : [{text: text('noContainers', 'no containers'), value: ''}];
    }

    getAncestorContainers () {
        const target = this.runtime.getEditingTarget();
        const ancestry = target ? this.runtime.spriteContainers.getTargetContainers(target) : [];
        // The relative choice replaces the innermost container, just like the sprite menu.
        // The relative default remains available on the stage and outside containers.
        return [{text: text('innermostContainer', 'innermost'), value: ContainerOption.SELF},
            ...ancestry.slice(0, -1).reverse()
                .map(({path}) => ({text: path, value: path}))];
    }

    getPositionTargets () {
        const editing = this.runtime.getEditingTarget();
        return [{text: text('mouse', 'mouse-pointer'), value: '_mouse_'},
            {text: text('myself', 'myself'), value: '_myself_'},
            ...this.runtime.targets.filter(target => target.isOriginal && !target.isStage &&
                (!editing || target.sprite !== editing.sprite))
                .map(target => ({text: target.getName(), value: target.getName()}))];
    }

    getCoordinateSpaces () {
        const containers = this.runtime.spriteContainers;
        const current = containers.getContainingContainer(this.runtime.getEditingTarget());
        return [{text: text('stage', 'Stage'), value: ContainerOption.STAGE},
            {text: text('containingContainer', 'my container'), value: ContainerOption.SELF},
            ...containers.serialize().filter(({path}) => !current || path !== current.path)
                .map(({path}) => ({text: path, value: path}))];
    }

    getTargetProperties (editingTargetID, menuContext) {
        const mouse = menuContext && menuContext.TARGET === '_mouse_';
        const labels = {x: 'x position', y: 'y position', size: 'size', direction: 'direction'};
        return (mouse ? ['x', 'y'] : numericProperties).map(value => ({text: text(value, labels[value]), value}));
    }

    targetProperty (args, util) {
        const name = Cast.toString(args.TARGET);
        const space = Cast.toString(args.SPACE);
        const containers = this.runtime.spriteContainers;
        const matrix = containers.getSpaceMatrix(space, util.target);
        if (!matrix) return 0;
        let position;
        let value;
        if (name === '_mouse_') {
            if (!['x', 'y'].includes(args.PROPERTY)) return 0;
            position = [util.ioQuery('mouse', 'getScratchX'), util.ioQuery('mouse', 'getScratchY')];
        } else {
            const target = name === '_myself_' ? util.target : this.runtime.resolveTargetReference(name);
            if (!target || target.isStage) return 0;
            switch (args.PROPERTY) {
            case 'x':
            case 'y': position = target.getWorldPosition(); break;
            case 'direction':
                value = Transform.inverseDirection(matrix, target.getWorldDirection(), ...target.getWorldPosition());
                break;
            case 'size': value = target.getWorldSize() / (matrix.sizeScale || 1); break;
            default: return 0;
            }
        }
        if (position) {
            value = this._coordinate(Transform.inversePoint(matrix, position[0], position[1]), args.PROPERTY);
        }
        return Number.isFinite(value) ? value : 0;
    }

    convertPoint (args, util) {
        return this._coordinate(this.runtime.spriteContainers.convertPoint(
            Cast.toString(args.FROM), Cast.toString(args.TO),
            Cast.toNumber(args.X), Cast.toNumber(args.Y), util.target),
        args.COORDINATE);
    }

    _coordinate (position, coordinate) {
        return position && (coordinate === 'x' || coordinate === 'y') ? position[coordinate === 'x' ? 0 : 1] : 0;
    }

    goToWorldXY (args, util) {
        util.target.setWorldPosition(Cast.toNumber(args.X), Cast.toNumber(args.Y));
    }

    _container (value, util) {
        const containers = this.runtime.spriteContainers;
        const id = containers.resolveReference(value, util.target);
        return id === null ? null : containers.get(id);
    }

    _setTransform (container, patch) {
        if (container) this.runtime.spriteContainers.setTransform(container.path, patch);
    }

    effect (args, util) {
        const container = this._container(args.CONTAINER, util);
        return container && Effects.names.includes(args.EFFECT) ? (container.effects || {})[args.EFFECT] || 0 : 0;
    }

    setEffect (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (container && Effects.names.includes(args.EFFECT)) {
            // Clamp bounded effects before the container API rejects non-finite values.
            const value = this.runtime.ext_scratch3_looks.clampEffect(args.EFFECT, Cast.toNumber(args.VALUE));
            this.runtime.spriteContainers.setEffects(container.path, {[args.EFFECT]: value});
        }
    }

    changeEffect (args, util) {
        this.setEffect({...args, VALUE: this.effect(args, util) + Cast.toNumber(args.VALUE)}, util);
    }

    clearEffects (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (container) this.runtime.spriteContainers.setEffects(container.path, null);
    }

    property (args, util) {
        const container = this._container(args.CONTAINER, util);
        return container && numericProperties.includes(args.PROPERTY) ?
            (container.transform || Transform.defaults)[args.PROPERTY] : 0;
    }

    setWorldProperty (args, util) {
        const target = util.target;
        const value = Cast.toNumber(args.VALUE);
        if (target.isStage || !Number.isFinite(value)) return;
        switch (args.PROPERTY) {
        case 'x':
        case 'y': {
            const position = target.getWorldPosition();
            position[args.PROPERTY === 'x' ? 0 : 1] = value;
            target.setWorldPosition(position[0], position[1]);
            break;
        }
        case 'direction': target.setWorldDirection(value); break;
        case 'size': target.setWorldSize(value); break;
        }
    }

    _setProperty (args, util, change) {
        const container = this._container(args.CONTAINER, util);
        if (!container || !numericProperties.includes(args.PROPERTY)) return;
        const value = Cast.toNumber(args.VALUE) + (change ?
            (container.transform || Transform.defaults)[args.PROPERTY] : 0);
        this._setTransform(container, {[args.PROPERTY]: value});
    }

    setProperty (args, util) {
        this._setProperty(args, util, false);
    }

    changeProperty (args, util) {
        this._setProperty(args, util, true);
    }

    goToXY (args, util) {
        this._setTransform(this._container(args.CONTAINER, util), {x: Cast.toNumber(args.X), y: Cast.toNumber(args.Y)});
    }

    setRotationStyle (args, util) {
        this._setTransform(this._container(args.CONTAINER, util), {rotationStyle: Cast.toString(args.STYLE)});
    }

    _setVisible (args, util, visible) {
        const container = this._container(args.CONTAINER, util);
        if (container) this.runtime.spriteContainers.setVisible(container.path, visible);
    }

    show (args, util) {
        this._setVisible(args, util, true);
    }

    hide (args, util) {
        this._setVisible(args, util, false);
    }

    isVisible (args, util) {
        const container = this._container(args.CONTAINER, util);
        return Boolean(container && container.visible);
    }

    goToLayer (args, util) {
        const container = this._container(args.CONTAINER, util);
        if (!container || !['front', 'back'].includes(args.LAYER)) return;
        this.runtime.spriteContainers.setOrder(container.path, args.LAYER === 'front' ? Infinity : -Infinity);
    }

    moveLayers (args, util) {
        const container = this._container(args.CONTAINER, util);
        const layers = Cast.toNumber(args.LAYERS);
        if (!container || !Number.isFinite(layers) || !['forward', 'backward'].includes(args.DIRECTION)) return;
        this.runtime.spriteContainers.setOrder(container.path,
            Math.round(layers) * (args.DIRECTION === 'forward' ? 1 : -1), true);
    }

    createClone (args, util) {
        this._createClone(args, util);
    }

    createWithId (args, util) {
        this._createClone(args, util, Cast.toString(args.ID));
    }

    _createClone (args, util, cloneId) {
        this.runtime.lastCloneId = '';
        this.runtime.lastContainerCloneId = '';
        const container = this._container(args.CONTAINER, util);
        if (!container) return;
        const context = {...this.runtime.logger.captureContext(util.thread),
            targetId: util.target.id,
            source: 'containers',
            subjectName: container.path};
        const clones = this.runtime.spriteContainers.createClone(container.path, {
            cloneId,
            startHats: false,
            logContext: context,
            onFailure: code => {
                // Capacity failures are already logged by the shared VM creation path.
                if (creationWarnings[code]) {
                    this.runtime.logger.warn(formatMessage(creationWarnings[code], {id: cloneId}), {...context, code});
                }
            }
        });
        // Preserve compiler execution context when a clone-start hat runs immediately.
        clones.forEach(target => (util.startHats ? util.startHats('control_start_as_clone', null, target) :
            this.runtime.startHats('control_start_as_clone', null, target)));
    }

    id (args, util) {
        const containers = this.runtime.spriteContainers;
        return containers.getPublicId(containers.resolveReference(args.CONTAINER, util.target));
    }

    originalId (args, util) {
        const containers = this.runtime.spriteContainers;
        return containers.getOriginalId(containers.resolveReference(args.CONTAINER, util.target));
    }

    parentId (args, util) {
        const containers = this.runtime.spriteContainers;
        return containers.getParentId(containers.resolveReference(args.CONTAINER, util.target));
    }

    cloneId (args) {
        return ContainerOption.CLONE_PREFIX + Cast.toString(args.ID);
    }

    exists (args) {
        const id = Cast.toString(args.ID);
        return ContainerOption.isReference(id) && this.runtime.spriteContainers.resolveReference(id) !== null;
    }

    lastId () {
        return this.runtime.lastContainerCloneId;
    }

    deleteById (args) {
        const id = Cast.toString(args.ID);
        const containers = this.runtime.spriteContainers;
        if (id.startsWith(ContainerOption.CLONE_PREFIX)) containers.deleteClone(containers.resolveReference(id));
    }

    deleteClone (args, util) {
        const value = Cast.toString(args.CONTAINER);
        // Deletion only addresses a clone on the executing member's own ancestry.
        // Named paths must never resolve to originals or independent instances.
        const container = this.runtime.spriteContainers.getTargetContainers(util.target).reverse()
            .find(member => member.isClone && (value === ContainerOption.SELF || member.path === value));
        if (container) this.runtime.spriteContainers.deleteClone(container.id);
    }
}

module.exports = Containers;
