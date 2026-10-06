const formatMessage = require('format-message');

// Called by commands, not by coordinate queries or rendering.
module.exports = (runtime, target, thread = runtime.sequencer.activeThread, blockId) => {
    runtime.logger.warn(formatMessage({
        id: 'motion.coordinateTransformFailed',
        default: 'Cannot move or turn: the position cannot be converted through the container transform. ' +
            'Check for zero stretch or a position outside the perspective projection. ' +
            'The current position and direction have been kept.'
    }), {
        ...runtime.logger.captureContext(thread),
        ...(blockId ? {blockId} : {}),
        targetId: target.id,
        source: 'motion',
        code: 'COORDINATE_TRANSFORM_FAILED',
        subjectName: target.getName()
    });
};
