// Relative selection used by the containers extension; named values are plain paths.
const SELF = '_mycontainer_';
// Empty path segments are invalid container names: this root marker cannot mask a named container.
const STAGE = '//';
const ORIGINAL_PREFIX = '@container:';
const CLONE_PREFIX = '@container-clone:';
const isReference = value => typeof value === 'string' &&
    (value.startsWith(ORIGINAL_PREFIX) || value.startsWith(CLONE_PREFIX));

module.exports = {SELF, STAGE, ORIGINAL_PREFIX, CLONE_PREFIX, isReference};
