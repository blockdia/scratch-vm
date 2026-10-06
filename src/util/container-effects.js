// Container effects are independent of each member's own graphic effects.
const names = Object.freeze(['color', 'fisheye', 'whirl', 'pixelate', 'mosaic', 'brightness', 'ghost']);
const normalize = value => {
    const result = {};
    for (const name of names) {
        if (value && Number.isFinite(value[name]) && value[name] !== 0) {
            result[name] = name === 'ghost' ? Math.max(0, Math.min(100, value[name])) :
                name === 'brightness' ? Math.max(-100, Math.min(100, value[name])) : value[name];
            if (result[name] === 0) delete result[name];
        }
    }
    return Object.keys(result).length ? result : null;
};
const {validClip, copyClip} = require('./graphic-geometry');
module.exports = {names, normalize, validClip, copyClip};
