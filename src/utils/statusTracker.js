class StatusTracker {
  constructor() {
    this.status = new Map();
  }

  updateStatus(source, { success = true, error = null, timestamp = Date.now() }) {
    this.status.set(source, {
      success,
      error: error ? error.message || String(error) : null,
      timestamp,
      lastAttempt: timestamp,
      consecutiveFailures: success ? 0 : ((this.status.get(source)?.consecutiveFailures || 0) + 1)
    });
  }

  getStatus() {
    return Object.fromEntries(this.status);
  }

  getSourceStatus(source) {
    return this.status.get(source) || null;
  }

  isHealthy(source) {
    const sourceStatus = this.status.get(source);
    if (!sourceStatus) return false;
    return sourceStatus.success && sourceStatus.consecutiveFailures < 3;
  }
}

module.exports = new StatusTracker();
