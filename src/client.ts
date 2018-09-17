import { deepstream } from 'deepstream.io-client-js'
import RecordUtils from './record'
import RpcUtils from './rpc'


class DeepstreamUtils {
  public options: any
  public client: any
  public record: RecordUtils
  public rpc: RpcUtils

  private _loginPromise: Promise<any> | null
  private _hasInitialized: boolean

  /**
   * Constructor for the deepstream utils
   * @param {Object} options
   * @param {String} options.host Url for the client
   * @param {Object} options.clientOptions Options for the client
   * @param {Object} options.authParams Authentication parameters for the client on login
   * @param {Object} options.disableHasCheck Dont check if record exists in getRecord
   */
  constructor(options: any) {
    this.options = options
    this.client = null
    this._hasInitialized = false
    this._loginPromise = null

    this.record = new RecordUtils(this.client, options)
    this.rpc = new RpcUtils(this.client, options)
  }

  /**
   * Initiate the client and login
   * @returns {Promise} Resolves when the client has logged in
   */
  public initClient() {
    this.client = deepstream(this.options.host, this.options.clientOptions);
    this.record.client = this.client;
    this.rpc.client = this.client;

    this.client.on('error', (error, event, topic) => {
      console.error('Deepstream client error:', { error, event, topic });
    });

    return this.client;
  }

  /**
   * The first time this function is called it runs login on
   * the client and after that it returns the same Promise.
   * @returns {Promise}
   */
  public async login() {
    if (this._loginPromise) {
      return this._loginPromise
    }

    try {
      this._loginPromise = this.client.login(this.options.authParams)
      const loginData = await this._loginPromise
      this._hasInitialized = true
      return loginData
    } catch (err) {
      this._loginPromise = null
      throw err
    }
  }

  public get hasInitialized() {
    return this._hasInitialized
  }

  /**
   * Close (logout) the client
   * @returns {Promise}
   */
  public async close() {
    if (!this._loginPromise) {
      return
    }

    try {
      // Make sure that if we have the login promise we are logged in, because
      // we might throw an error with it.
      await this._loginPromise
      this.client.close()
      this._loginPromise = null
    } catch (err) {
      console.error('Error with loginPromise on close', err)
    }
  }

}

export default DeepstreamUtils
