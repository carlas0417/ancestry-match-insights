/* A scan-scoped Chrome power request. 'system' allows the display to turn off. */
globalThis.ScanPower = class ScanPower {
  constructor(power, lifecycle = globalThis) {
    this.power = power;
    this.active = false;
    lifecycle.addEventListener('pagehide', () => this.release());
  }
  release() {
    if (!this.active) return;
    this.power.releaseKeepAwake();
    this.active = false;
  }
  async run(work) {
    if (this.active) throw new Error('A scanning power request is already active.');
    this.power.requestKeepAwake('system');
    this.active = true;
    try {
      return await work();
    } finally {
      // Also runs on pause, navigation errors, and failed note verification.
      this.release();
    }
  }
};
