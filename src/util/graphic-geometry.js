const LIMIT = 100000;
const bounded = (n, min, max = LIMIT) => Math.max(min, Math.min(max, n));
const margins = value => (value && ['left', 'right', 'top', 'bottom'].every(k => Number.isFinite(value[k])) ?
    Object.fromEntries(['left', 'right', 'top', 'bottom'].map(k => [k, bounded(value[k], 0)])) : null);
const dimensions = value => (value && Number.isFinite(value.width) && Number.isFinite(value.height) ?
    {width: bounded(value.width, 0.01), height: bounded(value.height, 0.01)} : null);
const stretch = value => (value && Number.isFinite(value.x) && Number.isFinite(value.y) ?
    {x: bounded(value.x, -10000, 10000), y: bounded(value.y, -10000, 10000)} : {x: 100, y: 100});
const validClip = value => value && ['left', 'right', 'bottom', 'top'].every(key => Number.isFinite(value[key])) &&
    value.left <= value.right && value.bottom <= value.top &&
    (typeof value.type === 'undefined' || ['rect', 'roundedRect', 'circle', 'ellipse'].includes(value.type)) &&
    (typeof value.space === 'undefined' || ['local', 'stage'].includes(value.space)) &&
    (typeof value.radius === 'undefined' || (Number.isFinite(value.radius) && value.radius >= 0)) &&
    (typeof value.inverted === 'undefined' || typeof value.inverted === 'boolean');
const copyClip = value => {
    if (!validClip(value)) return null;
    const result = {left: value.left, right: value.right, bottom: value.bottom, top: value.top};
    if (value.type && value.type !== 'rect') result.type = value.type;
    if (value.space === 'stage') result.space = 'stage';
    if (value.inverted) result.inverted = true;
    if (value.type === 'roundedRect') {
        result.radius = Math.min(value.radius || 0, (value.right - value.left) / 2, (value.top - value.bottom) / 2);
    }
    return result;
};
const perspective = value => {
    if (!Array.isArray(value) || value.length !== 4 ||
        !value.every(p => Array.isArray(p) && p.length === 2 &&
            p.every(n => Number.isFinite(n) && Math.abs(n) <= 1000))) return null;
    const base = [[0, 1], [1, 1], [1, 0], [0, 0]];
    const points = base.map((p, i) => p.map((n, axis) => n + (value[i][axis] / 100)));
    // Keep a strictly convex clockwise quad: crossed corners and collapsed edges are rejected atomically.
    if (!points.every((a, i) => {
        const b = points[(i + 1) % 4];
        const c = points[(i + 2) % 4];
        return ((b[0] - a[0]) * (c[1] - b[1])) - ((b[1] - a[1]) * (c[0] - b[0])) < -1e-5;
    })) return null;
    return value.map(p => p.slice());
};
const costumeMask = value => {
    if (!value || typeof value.costume !== 'string' || !['alpha', 'luminance'].includes(value.mode) ||
        !['local', 'stage'].includes(value.space) || typeof value.inverted !== 'boolean' ||
        !['x', 'y', 'width', 'height'].every(k => Number.isFinite(value[k])) ||
        value.width <= 0 || value.height <= 0) return null;
    return {costume: value.costume,
        mode: value.mode,
        space: value.space,
        inverted: value.inverted,
        x: bounded(value.x, -LIMIT),
        y: bounded(value.y, -LIMIT),
        width: bounded(value.width, 0.01),
        height: bounded(value.height, 0.01)};
};
const container = value => {
    if (!value || !value.frame || !['x', 'y', 'width', 'height'].every(k => Number.isFinite(value.frame[k])) ||
        value.frame.width <= 0 || value.frame.height <= 0) return null;
    return {frame: {x: bounded(value.frame.x, -LIMIT),
        y: bounded(value.frame.y, -LIMIT),
        ...dimensions(value.frame)},
    borders: margins(value.borders),
    nineSlice: dimensions(value.nineSlice),
    perspective: perspective(value.perspective)};
};
module.exports = {margins, dimensions, stretch, validClip, copyClip, perspective, costumeMask, container};
