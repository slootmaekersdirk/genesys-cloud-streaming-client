'use strict';

import { Client } from './client';
import { NamedAgent } from './types/named-agent';

const DEFAULT_PING_INTERVAL = 14 * 1000;
const DEFAULT_MAXIMUM_FAILED_PINGS_BEFORE_DISCONNECT = 1;

export interface PingOptions {
  pingInterval?: number;
  failedPingsBeforeDisconnect?: number;
  jid?: string;
}

export class Ping {
  private pingInterval: number;
  private failedPingsBeforeDisconnect: number;
  private numberOfFailedPings: number;
  private nextPingTimeoutId: any;

  constructor (private client: Client, private stanzaInstance: NamedAgent, private options: PingOptions = {}) {
    this.pingInterval = options.pingInterval || DEFAULT_PING_INTERVAL;
    this.failedPingsBeforeDisconnect = options.failedPingsBeforeDisconnect || DEFAULT_MAXIMUM_FAILED_PINGS_BEFORE_DISCONNECT;
    this.numberOfFailedPings = 0;
    this.nextPingTimeoutId = null;

    this.start();
  }

  start () {
    if (!this.nextPingTimeoutId) {
      this.queueNextPing();
    }
  }

  stop () {
    clearTimeout(this.nextPingTimeoutId);
    this.nextPingTimeoutId = null;
    this.numberOfFailedPings = 0;
  }

  private async performPing (): Promise<void> {
    try {
      await this.stanzaInstance.ping(this.options.jid);
      this.numberOfFailedPings = 0;
      this.queueNextPing();
    } catch (err) {
      const info = {
        channelId: this.client.config.channelId,
        jid: this.stanzaInstance.jid
      };
      this.client.logger.warn('Missed a ping.', Object.assign({ error: err }, info));

      /* if we have reached max number of missed pings, disconnect */
      if (++this.numberOfFailedPings > this.failedPingsBeforeDisconnect) {
        this.client.logger.error('Missed too many pings, disconnecting', Object.assign({ numberOfFailedPings: this.numberOfFailedPings }, info));
        this.stanzaInstance.sendStreamError({ text: 'too many missed pongs', condition: 'connection-timeout' });
        this.stop();
      } else {
        this.queueNextPing();
      }
    }
  }

  private queueNextPing () {
    this.nextPingTimeoutId = setTimeout(this.performPing.bind(this), this.pingInterval);
  }
}
