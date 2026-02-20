// Socket event input validation helpers
// Prevents oversized payloads and malformed data from reaching handlers

const MAX_STRING_LENGTH = 50000; // 50KB per string field
const MAX_PAYLOAD_SIZE = 1048576; // 1MB total payload

/**
 * Validate that a value is a non-empty string within size limits.
 * @param {*} value
 * @param {string} fieldName
 * @param {number} [maxLength]
 * @returns {{ valid: boolean, error?: string }}
 */
function validateString(value, fieldName, maxLength = MAX_STRING_LENGTH) {
  if (typeof value !== 'string') {
    return { valid: false, error: `${fieldName} must be a string` };
  }
  if (value.length === 0) {
    return { valid: false, error: `${fieldName} is required` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `${fieldName} exceeds maximum length of ${maxLength}` };
  }
  return { valid: true };
}

/**
 * Validate that a value is a string if present (optional field).
 * @param {*} value
 * @param {string} fieldName
 * @param {number} [maxLength]
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOptionalString(value, fieldName, maxLength = MAX_STRING_LENGTH) {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  return validateString(value, fieldName, maxLength);
}

/**
 * Validate that a value is a plain object (not null, not array).
 * @param {*} value
 * @param {string} fieldName
 * @returns {{ valid: boolean, error?: string }}
 */
function validateObject(value, fieldName) {
  if (value === undefined || value === null) {
    return { valid: true };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: `${fieldName} must be an object` };
  }
  // Check serialized size
  const size = JSON.stringify(value).length;
  if (size > MAX_PAYLOAD_SIZE) {
    return { valid: false, error: `${fieldName} exceeds maximum payload size` };
  }
  return { valid: true };
}

/**
 * Validate the overall payload size of a socket event.
 * @param {*} data
 * @returns {{ valid: boolean, error?: string }}
 */
function validatePayloadSize(data) {
  if (data === undefined || data === null) {
    return { valid: false, error: 'Event data is required' };
  }
  try {
    const size = JSON.stringify(data).length;
    if (size > MAX_PAYLOAD_SIZE) {
      return { valid: false, error: `Payload exceeds maximum size of ${MAX_PAYLOAD_SIZE} bytes` };
    }
  } catch {
    return { valid: false, error: 'Payload is not serializable' };
  }
  return { valid: true };
}

/**
 * Simple per-socket rate limiter.
 * Returns a middleware function for Socket.IO that tracks event counts per socket.
 * @param {number} [maxEvents] - Max events per window (default: 100)
 * @param {number} [windowMs] - Window in ms (default: 60000)
 * @returns {function} - Rate limit checker: (socket) => { allowed: boolean }
 */
function createSocketRateLimiter(maxEvents, windowMs) {
  const max = maxEvents || parseInt(process.env.SOCKET_RATE_LIMIT) || 100;
  const window = windowMs || parseInt(process.env.SOCKET_RATE_WINDOW_MS) || 60000;
  const counters = new Map(); // socketId -> { count, resetAt }

  return function checkRate(socket) {
    const now = Date.now();
    let entry = counters.get(socket.id);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + window };
      counters.set(socket.id, entry);
    }

    entry.count++;

    if (entry.count > max) {
      return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    return { allowed: true };
  };
}

/**
 * Clean up rate limiter entries for disconnected sockets.
 * @param {Map} counters - The counters map from createSocketRateLimiter
 * @param {string} socketId
 */
function cleanupRateLimiter(rateLimiter, socketId) {
  // The counters map is internal — we rely on the window TTL to clean up
  // This is a no-op placeholder for future direct cleanup
}

module.exports = {
  validateString,
  validateOptionalString,
  validateObject,
  validatePayloadSize,
  createSocketRateLimiter,
  MAX_STRING_LENGTH,
  MAX_PAYLOAD_SIZE
};
