const formatMessage = require('format-message');

// One diagnostic for the operation that cannot fit, including an entire container subtree.
module.exports = (runtime, subjectName, context = {}) => {
    const limit = runtime.runtimeOptions.maxClones;
    runtime.logger.warn(formatMessage({
        id: 'clones.limit',
        default: 'Failed to create clone of "{sprite}", cannot create over {limit} clones.'
    }, {sprite: subjectName, limit}), {
        ...runtime.logger.captureContext(runtime.sequencer.activeThread),
        source: 'clones',
        ...context,
        code: 'CLONE_LIMIT',
        subjectName,
        limit
    });
};
