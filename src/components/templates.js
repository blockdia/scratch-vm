const Model = require('./model');
const svg = (width, height, body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
const track = svg(180, 12, '<rect width="180" height="12" rx="6" fill="#d6deea"/>');
const fill = svg(180, 12, '<rect width="180" height="12" rx="6" fill="#4c97ff"/>');
const thumb = svg(28, 28, '<circle cx="14" cy="14" r="12" fill="#ffffff" stroke="#4c97ff" stroke-width="3"/>');
const body = svg(104, 40, '<rect width="104" height="40" rx="9" fill="#4c97ff"/>');
const off = svg(48, 32,
    '<rect width="48" height="32" rx="16" fill="#a8b4c5"/><circle cx="16" cy="16" r="12" fill="white"/>');
const on = svg(48, 32,
    '<rect width="48" height="32" rx="16" fill="#4c97ff"/><circle cx="32" cy="16" r="12" fill="white"/>');

const templates = {
    slider: [[track, 90, 6], [fill, 90, 6], [thumb, 14, 14]],
    button: [[body, 52, 20]],
    toggle: [[off, 24, 16], [on, 24, 16]],
    progress: [[track, 90, 6], [fill, 90, 6]]
};

module.exports = (type, storage, name) => {
    const component = Model.create(type);
    const assets = [];
    const costumes = templates[type].map(([image, rotationCenterX, rotationCenterY], index) => {
        const asset = storage.createAsset(storage.AssetType.ImageVector, storage.DataFormat.SVG,
            new TextEncoder().encode(image), null, true);
        assets.push(asset);
        return {name: component.parts[index].name,
            assetId: asset.assetId,
            dataFormat: 'svg',
            md5ext: `${asset.assetId}.svg`,
            bitmapResolution: 1,
            rotationCenterX,
            rotationCenterY};
    });
    const sprite = {isStage: false,
        name: name || type,
        variables: {},
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        costumes,
        sounds: [],
        currentCostume: 0,
        volume: 100,
        visible: true,
        x: 0,
        y: 0,
        size: 100,
        direction: 90,
        draggable: false,
        rotationStyle: 'all around',
        component};
    return {sprite, assets};
};
