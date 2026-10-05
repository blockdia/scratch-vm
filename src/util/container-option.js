// Relative selection used by the containers extension; named values are plain paths.
const SELF = '_mycontainer_';
// Empty path segments are invalid container names: this root marker cannot mask a named container.
const STAGE = '//';

module.exports = {SELF, STAGE};
