const copy = value => JSON.parse(JSON.stringify(value));
const definitions = {
    slider: {parts: ['track', 'fill', 'thumb'],
        properties: {
            min: 0, max: 100, value: 50, step: 1, clickTrackToJump: true
        }},
    button: {parts: ['body'], properties: {disabled: false}},
    toggle: {parts: ['body', 'mark'], properties: {checked: false, disabled: false}},
    progress: {parts: ['track', 'fill'], properties: {min: 0, max: 100, value: 50}}
};

const normalizeValue = (properties, value) => {
    value = Math.max(properties.min, Math.min(properties.max, value));
    if (properties.step > 0) {
        value = properties.min + (Math.round((value - properties.min) / properties.step) * properties.step);
        value = Number(value.toPrecision(15));
    }
    return Math.max(properties.min, Math.min(properties.max, value));
};

const normalize = (input, costumeCount) => {
    const config = copy(input);
    const definition = config && Object.prototype.hasOwnProperty.call(definitions, config.type) &&
        definitions[config.type];
    if (!definition || config.version !== 1) throw new Error('Unsupported component type or version');
    const properties = config.properties;
    if (!properties || Object.keys(properties).some(key => !(key in definition.properties))) {
        throw new Error('Invalid component properties');
    }
    for (const [key, value] of Object.entries(definition.properties)) {
        if (typeof properties[key] !== typeof value ||
            (typeof value === 'number' && !Number.isFinite(properties[key]))) {
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
            !Number.isInteger(part.costumeIndex) || part.costumeIndex < 0 || part.costumeIndex >= costumeCount ||
            typeof part.collision !== 'boolean')) {
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
    if (!Object.prototype.hasOwnProperty.call(definitions, type)) throw new Error('Unknown component type');
    return {
        version: 1,
        type,
        properties: copy(definitions[type].properties),
        parts: definitions[type].parts.map((name, costumeIndex) => ({name, costumeIndex, collision: true})),
        metadata: type === 'slider' || type === 'progress' ?
            {sliderTrack: {start: [-84, 0], end: [84, 0]}} : {}
    };
};

module.exports = {copy, normalize, normalizeValue, create};
