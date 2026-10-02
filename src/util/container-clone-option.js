// Keep container selections distinct from sprite names in the existing clone menu.
const PREFIX = '_container_:';
const SELF = '_mycontainer_';
const encode = path => PREFIX + path;
const decode = value => (typeof value === 'string' && value.startsWith(PREFIX) ? value.slice(PREFIX.length) : null);

module.exports = {SELF, encode, decode};
