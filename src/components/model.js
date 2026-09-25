const copy = value => JSON.parse(JSON.stringify(value));
const property = (defaultValue, scriptType = null) => ({defaultValue, scriptType});
const definitions = {
    slider: {parts: ['track', 'fill', 'thumb'],
        properties: {
            value: property(50, 'number'),
            min: property(0, 'number'),
            max: property(100, 'number'),
            step: property(1, 'number'),
            clickTrackToJump: property(true)
        }},
    button: {parts: ['body'], properties: {disabled: property(false)}},
    toggle: {
        parts: ['off', 'on'],
        properties: {
            checked: property(false, 'boolean'),
            disabled: property(false)
        }
    },
    progress: {
        parts: ['track', 'fill'],
        properties: {
            value: property(50, 'number'),
            min: property(0, 'number'),
            max: property(100, 'number')
        }
    }
};

const definitionFor = type => Object.prototype.hasOwnProperty.call(definitions, type) && definitions[type];

const getScriptableProperties = (type, scriptType) => {
    const definition = definitionFor(type);
    if (!definition) return [];
    return Object.keys(definition.properties).filter(name => definition.properties[name].scriptType === scriptType);
};

const getTypesWithScriptableProperties = scriptType => Object.keys(definitions)
    .filter(type => getScriptableProperties(type, scriptType).length > 0);

const hasScriptableProperty = (type, name, scriptType) =>
    getScriptableProperties(type, scriptType).includes(name);

const normalizeValue = (properties, value) => {
    value = Math.max(properties.min, Math.min(properties.max, value));
    if (properties.step > 0) {
        value = properties.min + (Math.round((value - properties.min) / properties.step) * properties.step);
        value = Number(value.toPrecision(15));
    }
    return Math.max(properties.min, Math.min(properties.max, value));
};

const normalize = (input, costumes) => {
    const config = copy(input);
    const definition = config && definitionFor(config.type);
    if (!definition || config.version !== 1) throw new Error('Unsupported component type or version');
    if (!Array.isArray(costumes)) throw new Error('Costumes are required to resolve component references');
    const properties = config.properties;
    if (!properties || Object.keys(properties).some(key =>
        !Object.prototype.hasOwnProperty.call(definition.properties, key))) {
        throw new Error('Invalid component properties');
    }
    for (const [key, descriptor] of Object.entries(definition.properties)) {
        if (typeof properties[key] !== typeof descriptor.defaultValue ||
            (typeof descriptor.defaultValue === 'number' && !Number.isFinite(properties[key]))) {
            throw new Error(`Invalid component property: ${key}`);
        }
    }
    if ('min' in properties) {
        if (properties.max <= properties.min || !Number.isFinite(properties.max - properties.min)) {
            throw new Error('Maximum must exceed minimum within a finite range');
        }
        if ('step' in properties && properties.step < 0) throw new Error('Step cannot be negative');
        properties.value = normalizeValue(properties, properties.value);
    }
    if (!Array.isArray(config.parts) || config.parts.length !== definition.parts.length ||
        config.parts.some((part, index) => !part || part.name !== definition.parts[index] ||
            typeof part.costume !== 'string' ||
            costumes.filter(costume => costume.name === part.costume).length !== 1 ||
            Object.keys(part).some(key => key !== 'name' && key !== 'costume'))) {
        throw new Error('Invalid component parts or costume references');
    }
    if (config.type === 'slider' || config.type === 'progress') {
        const track = config.metadata && config.metadata.sliderTrack;
        if (!track || ![track.start, track.end].every(point => Array.isArray(point) && point.length === 2 &&
            point.every(Number.isFinite)) ||
            (track.start[0] === track.end[0] && track.start[1] === track.end[1]) ||
            !Number.isFinite(Math.hypot(track.end[0] - track.start[0], track.end[1] - track.start[1]))) {
            throw new Error('Track endpoints must be finite and distinct');
        }
    }
    return config;
};

const create = type => {
    const definition = definitionFor(type);
    if (!definition) throw new Error('Unknown component type');
    return {
        version: 1,
        type,
        properties: Object.keys(definition.properties).reduce((result, name) => {
            result[name] = copy(definition.properties[name].defaultValue);
            return result;
        }, {}),
        parts: definition.parts.map(name => ({name, costume: name})),
        metadata: type === 'slider' || type === 'progress' ?
            {sliderTrack: {start: [-84, 0], end: [84, 0]}} : {}
    };
};

module.exports = {
    copy,
    normalize,
    normalizeValue,
    create,
    getScriptableProperties,
    getTypesWithScriptableProperties,
    hasScriptableProperty
};
