// Affine matrices [a, b, c, d, x, y], with Scratch's +Y up coordinates.
const MathUtil = require('./math-util');
const defaults = Object.freeze({x: 0, y: 0, size: 100, direction: 90, rotationStyle: 'all around'});
const identity = Object.freeze([1, 0, 0, 1, 0, 0]);
const valid = (key, value) => (key === 'rotationStyle' ?
    ['all around', 'left-right', "don't rotate"].includes(value) :
    Number.isFinite(value) && (key !== 'size' || (value >= 0.01 && value <= 10000)));
const normalize = value => {
    const result = {};
    for (const key of Object.keys(defaults)) {
        result[key] = value && valid(key, value[key]) ? value[key] : defaults[key];
    }
    result.direction = MathUtil.wrapClamp(result.direction, -179, 180);
    return Object.keys(defaults).every(key => result[key] === defaults[key]) ? null : result;
};
const matrix = value => {
    if (!value) return identity;
    const angle = value.rotationStyle === 'all around' ? (90 - value.direction) * Math.PI / 180 : 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const scale = value.size / 100;
    const flip = value.rotationStyle === 'left-right' && value.direction < 0 ? -1 : 1;
    return [c * scale * flip, s * scale * flip, -s * scale, c * scale, value.x, value.y];
};
const multiply = (p, m) => [
    (p[0] * m[0]) + (p[2] * m[1]), (p[1] * m[0]) + (p[3] * m[1]),
    (p[0] * m[2]) + (p[2] * m[3]), (p[1] * m[2]) + (p[3] * m[3]),
    (p[0] * m[4]) + (p[2] * m[5]) + p[4], (p[1] * m[4]) + (p[3] * m[5]) + p[5]
];
const point = (m, x, y) => [(m[0] * x) + (m[2] * y) + m[4], (m[1] * x) + (m[3] * y) + m[5]];
const inversePoint = (m, x, y) => {
    const det = (m[0] * m[3]) - (m[1] * m[2]);
    const dx = x - m[4];
    const dy = y - m[5];
    return [((m[3] * dx) - (m[2] * dy)) / det, ((m[0] * dy) - (m[1] * dx)) / det];
};
module.exports = {defaults, identity, valid, normalize, matrix, multiply, point, inversePoint};
