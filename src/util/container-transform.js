// Affine matrices [a, b, c, d, x, y], with Scratch's +Y up coordinates.
const MathUtil = require('./math-util');
const Geometry = require('./container-geometry');
const defaults = Object.freeze({x: 0, y: 0, size: 100, direction: 90, rotationStyle: 'all around'});
const identity = Object.freeze([1, 0, 0, 1, 0, 0]);
const valid = (key, value) => (key === 'rotationStyle' ?
    ['all around', 'left-right', "don't rotate"].includes(value) :
    Number.isFinite(value));
const normalize = value => {
    const result = {};
    for (const key of Object.keys(defaults)) {
        result[key] = value && valid(key, value[key]) ? value[key] : defaults[key];
    }
    // Keep matrices invertible while saturating relative size changes at the boundary.
    result.size = MathUtil.clamp(result.size, 0.01, 10000);
    result.direction = MathUtil.wrapClamp(result.direction, -179, 180);
    return Object.keys(defaults).every(key => result[key] === defaults[key]) ? null : result;
};
const matrix = (value, stretch, geometry) => {
    value = value || defaults;
    stretch = stretch || {x: 100, y: 100};
    const angle = value.rotationStyle === 'all around' ? ((90 - value.direction) * Math.PI) / 180 : 0;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const scale = value.size / 100;
    const flip = value.rotationStyle === 'left-right' && value.direction < 0 ? -1 : 1;
    const result = [(c * scale * flip * stretch.x) / 100, (s * scale * flip * stretch.x) / 100,
        (-s * scale * stretch.y) / 100, (c * scale * stretch.y) / 100, value.x, value.y];
    Object.defineProperty(result, 'sizeScale', {value: scale});
    const warp = Geometry.prepare(geometry);
    if (warp && warp.active) Object.defineProperty(result, 'steps', {value: [{matrix: result.slice(), warp}]});
    return result;
};
const multiply = (p, m) => {
    const result = [
        (p[0] * m[0]) + (p[2] * m[1]), (p[1] * m[0]) + (p[3] * m[1]),
        (p[0] * m[2]) + (p[2] * m[3]), (p[1] * m[2]) + (p[3] * m[3]),
        (p[0] * m[4]) + (p[2] * m[5]) + p[4], (p[1] * m[4]) + (p[3] * m[5]) + p[5]
    ];
    Object.defineProperty(result, 'sizeScale', {value: (p.sizeScale || 1) * (m.sizeScale || 1)});
    if (p.steps || m.steps) {
        Object.defineProperty(result, 'steps', {value:
        (p.steps || [{matrix: p}]).concat(m.steps || [{matrix: m}])});
    }
    return result;
};
const point = (m, x, y) => {
    if (m.steps) {
        return m.steps.reduceRight((p, step) => {
            const q = Geometry.forward(step.warp, p);
            return point(step.matrix, q[0], q[1]);
        }, [x, y]);
    }
    return [(m[0] * x) + (m[2] * y) + m[4], (m[1] * x) + (m[3] * y) + m[5]];
};
const inversePoint = (m, x, y) => {
    if (m.steps) {
        return m.steps.reduce((p, step) =>
            Geometry.backward(step.warp, inversePoint(step.matrix, p[0], p[1])), [x, y]);
    }
    const det = (m[0] * m[3]) - (m[1] * m[2]);
    const dx = x - m[4];
    const dy = y - m[5];
    return [((m[3] * dx) - (m[2] * dy)) / det, ((m[0] * dy) - (m[1] * dx)) / det];
};
const directionAt = (m, x, y, direction, backwards = false) => {
    const convert = backwards ? inversePoint : point;
    const angle = ((90 - direction) * Math.PI) / 180;
    const a = convert(m, x, y);
    const b = convert(m, x + (Math.cos(angle) * 0.001), y + (Math.sin(angle) * 0.001));
    return MathUtil.wrapClamp(90 - ((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI), -179, 180);
};
const inverseDirection = (m, direction, px = 0, py = 0) => {
    if (m.steps) return directionAt(m, px, py, direction, true);
    const angle = ((90 - direction) * Math.PI) / 180;
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    const det = (m[0] * m[3]) - (m[1] * m[2]);
    const localX = ((m[3] * x) - (m[2] * y)) / det;
    const localY = ((m[0] * y) - (m[1] * x)) / det;
    return MathUtil.wrapClamp(90 - ((Math.atan2(localY, localX) * 180) / Math.PI), -179, 180);
};
module.exports = {defaults,
    identity,
    valid,
    normalize,
    matrix,
    multiply,
    point,
    inversePoint,
    inverseDirection,
    directionAt};
