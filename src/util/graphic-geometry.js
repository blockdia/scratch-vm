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
module.exports = {margins, dimensions, stretch, validClip, copyClip};
