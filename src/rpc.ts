const DEFAULT_RETRYINTERVAL = 500;
const DEFAULT_RETRYTIMEOUT = 60000;

function sleep(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms))
}

interface AuditLog {
  rpc: string
  data: any
  result: any
  error: boolean
  options: object
}

class RpcUtils {
  public options: any
  public client: any

  private audit?: (logObject: AuditLog) => void
  private retryRPCTimeout: number
  private retryRPCInterval: number

  /**
   * Constructor for the rpc utils
   * @param {Object} client A deepstream client to be used for the requests
   * @param {Object} [options] Additional options
   * @param {Function} [options.audit]
   * @param {Number} [options.retryRPCTimeout]
   * @param {Number} [options.retryRPCInterval]
   */
  constructor(client: any, options: any = {}) {
    this.options = options
    this.audit = options.audit
    this.client = client

    this.retryRPCTimeout = (options.retryRPCTimeout || DEFAULT_RETRYTIMEOUT) as number
    this.retryRPCInterval = (options.retryRPCInterval || DEFAULT_RETRYINTERVAL) as number
  }

  /**
   * Makes an rpc call
   * @param {String} rpc
   * @param {*} data
   * @returns {Promise} Resolves with rpc data
   */
  public async make(rpc: string, data: any = {}) {
    const callStart = Date.now()
    while (callStart + this.retryRPCTimeout > Date.now()) {
      try {
        await this.preprocessRpcData(data)
        return await this.client.rpc.make(rpc, data)
      } catch (error) {
        if (error !== 'NO_RPC_PROVIDER' || this.retryRPCTimeout === 0) {
          throw error
        }
      }
      await sleep(this.retryRPCInterval)
    }

    throw 'NO_RPC_PROVIDER'
  }

  private async preprocessRpcData(data: any) {
    if (this.options.preprocessRpcData) {
      await this.options.preprocessRpcData(data)
    }
  }

  private async upgradeRpcData(data: any) {
    if (this.options.upgradeRpcData) {
      await this.options.upgradeRpcData(data)
    }
  }

  /**
   * Provide a rpc
   * @param {String} rpc RPC name
   * @param {function} cb
   * @param {Object} [options] If options and an audit function are specified,
   *                           the audit function will be called with options and rpc data.
   */
  public provide(rpc, cb, options) {
    if (options && this.audit) {
      const self = this
      this.client.rpc.provide(rpc, async (data, response) => {
        await this.upgradeRpcData(data);
        const send = response.send.bind(response);
        const error = response.error.bind(response);
        response.send = result => {
          send(result);
          self.audit!({ rpc, data, result, error: false, options });
        };
        response.error = result => {
          error(result);
          self.audit!({ rpc, data, result, error: true, options });
        };
        cb(data, response);
      });
    } else {
      this.client.rpc.provide(rpc, async (data, response) => {
        await this.upgradeRpcData(data);
        cb(data, response);
      });
    }
  }

  /**
   * Unprovide the given rpc
   * @param {String} rpc
   */
  public unprovide(rpc) {
    this.client.rpc.unprovide(rpc);
  }

  /**
   * Unprovide all rpcs currently provided by the client
   */
  public unprovideAll() {
    const rpcs = this.client.rpc.providers.keys();
    for (const rpc of rpcs) {
      this.unprovide(rpc);
    }
  }

}

export default RpcUtils
