const FakeRenderer = require('./fake-renderer');

class ComponentRenderer extends FakeRenderer {
    constructor () {
        super();
        this._allDrawables = [];
        this._drawableGroups = new Map();
        this.nextGroup = 0;
    }
    createDrawable () {
        const id = this._allDrawables.length;
        this._allDrawables.push({_position: [0, 0], _uniforms: {}, _visible: true});
        return id;
    }
    destroyDrawable (id) {
        this._allDrawables[id] = null;
    }
    createDrawableGroup (layer, count) {
        const id = this.nextGroup++;
        this._drawableGroups.set(id, Array.from({length: count}, () => this.createDrawable()));
        return id;
    }
    getDrawableGroupMembers (id) {
        return this._drawableGroups.get(id).slice();
    }
    destroyDrawableGroup (id) {
        this.getDrawableGroupMembers(id).forEach(part => this.destroyDrawable(part));
        this._drawableGroups.delete(id);
    }
    setDrawableGroupOrder () {}
    getDrawableOrder () {
        return 1;
    }
    getSkinSize () {
        return [168, 12];
    }
    updateDrawablePosition (id, position) {
        this._allDrawables[id]._position = position;
    }
    updateDrawableDirectionScale (id, direction, scale) {
        Object.assign(this._allDrawables[id], {direction, scale});
    }
    updateDrawableEffect (id, effect, value) {
        this._allDrawables[id]._uniforms[effect] = value;
    }
    updateDrawableClipPlane (id, plane) {
        this._allDrawables[id].clipPlane = plane;
    }
    updateDrawableVisible (id, visible) {
        this._allDrawables[id]._visible = visible;
    }
}
module.exports = ComponentRenderer;
