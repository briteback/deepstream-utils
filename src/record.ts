const LIST_DISCARD_TIMEOUT = 10000

/**
 * Callback handler for promiseSet. Rejects if there was an error, else resolves.
 * @param {Function} resolve
 * @param {Function} reject
 */
function rejectOnError(resolve, reject) {
  return error => {
    if (error) reject(error);
    else resolve();
  };
}

/**
 * A Promise-wrapped record.set() which resolves after write acknowledgement.
 * @param {String} [path] A path for the value to be set on the record.
 * @param {*} value The value to be set at the path, or an object containing the entire record data to set.
 * @param {Boolean} [discard] Whether or not to discard the record.
 * @returns {Promise}
 */
function promiseSet(path, value, discard) {
  return new Promise((resolve, reject) => {
    if (typeof path === 'object') {
      discard = value;
      this.setWithAck(path, rejectOnError(resolve, reject));
    } else {
      this.setWithAck(path, value, rejectOnError(resolve, reject));
    }
  }).then(() => {
    if (discard) {
      this.discard();
    }
    return this;
  });
}

/**
 * Adds a Promise-wrapped record.set() to a Deepstream record, for easy write acknowledgement.
 * @param {Record} record A Deepstream record to add pSet to (modifies record)
 * @returns {Record}
 */
function addPromiseSet(record) {
  record.pSet = promiseSet.bind(record);
  return record;
}


interface SetDataCallback {
  resolve: (value?: {} | PromiseLike<{}> | undefined) => void
  reject: (reason?: any) => void
}
type SetDataType = Map<string, Set<SetDataCallback>>
class RecordUtils {
  public options: any
  public client: any
  private setDataCallbacks: SetDataType

  /**
   * Constructor for the record utils
   * @param {Object} client A deepstream client to be used for the requests
   */
  constructor(client, options) {
    this.options = options;
    this.client = client;
    this.setDataCallbacks = new Map();
  }

  /**
   * Set data on a existing or new record without subscribing.
   * @param {Array} args - First element will contain the record name,
   * second element is a key or object, and if the second element is a
   * key the third element must be the value.
   * @param {Boolean} create - If the given recor name should be created
   * @returns {Promise}
   */
  private _setData(args, create) {
    const [recordName] = args;

    return new Promise((resolve, reject) => {
      if (!this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.set(recordName, new Set([{ resolve, reject }]));
      } else {
        this.setDataCallbacks.get(recordName)!.add({ resolve, reject });
      }

      this.client.record.has(recordName, (error, hasRecord) => {
        if (error) {
          return reject(error);
        } else if (!create && !hasRecord) {
          return reject(`Trying to setData on nonexistent record: ${recordName}`);
        } else if (create && hasRecord) {
          return reject(`Trying to create and setData on existing record: ${recordName}`);
        }

        if (args.length === 2) {
          return this.client.record.setData(recordName, args[1], rejectOnError(resolve, reject))
        } else if (args.length === 3) {
          return this.client.record.setData(recordName, args[1], args[2], rejectOnError(resolve, reject))
        }
        return reject(`Incorrect arguments given to setData: ${args}`);
      });
    }).then(res => {
      if (this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.get(recordName)!.forEach(({ resolve }) => resolve(res));
        this.setDataCallbacks.delete(recordName);
      }
      return res;
    }).catch(error => {
      if (this.setDataCallbacks.has(recordName)) {
        this.setDataCallbacks.get(recordName)!.forEach(({ reject }) => reject(error));
        this.setDataCallbacks.delete(recordName);
      }
      throw error;
    });
  }

  /**
   * Set data; will NOT create create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  public setData(...args) {
    return this._setData(args, false);
  }

  /**
   * Set data; WILL create record!
   * @param {String} recordName
   * @param {Object | String}  data or key
   * @param {Object} [data]
   * @returns {Promise}
   */
  public createAndSetData(...args) {
    return this._setData(args, true);
  }

  /**
   * Delete a record
   * @param {String} recordName
   * @returns {Promise}
   */
  public async delete(recordName) {
    const record = await this.getRecord(recordName) as { delete: () => Promise<any> }
    return record.delete()
  }

  /**
   * Checks if a record exists
   * @param {String} recordName
   * @returns {Promise} Resolves a boolean or rejects a error
   */
  public async has(recordName) {
    return this.client.record.has(recordName)
  }

  /**
   * Get a record, if the record didn't exist it will NOT
   * be created and the promise will be rejected.
   * Option disableHasCheck will disable this behavior and omit the check.
   * @param {String} recordName
   * @returns {Promise} Resolves the record
   * @throws {exception} Throws if record doesn't exist
   */
  public async getRecord(recordName) {
    if (this.options.disableHasCheck) {
      return this.dsGetRecord(recordName);
    }

    const hasRecord = await this.has(recordName)
    if (!hasRecord) {
      throw `No record by that name${recordName}`
    }
    return this.dsGetRecord(recordName)
  }

  /**
   * Create a record. Will throw if a record with that name already exists.
   * @param {String} recordName name of the record to be created
   * @returns {Promise} Resolves the created record
   * @throws {exception} Throws if a record with that name already exists
   */
  public async createRecord(recordName) {
    const hasRecord = await this.has(recordName)
    if (hasRecord) {
      throw `Record already exists ${recordName}`
    }
    return this.dsGetRecord(recordName)
  }

  /**
   * Get the data from a record.
   * @param {String} recordName Name of the record to get a snapshot of
   * @returns {Promise} Resolves the record data or rejects with an error
   */
  public async snapshot(recordName) {
    try {
      return await this.client.record.snapshot(recordName)
    } catch (error) {
      throw { error, recordName }
    }
  }


  /**
   * Create or get a record.
   * @param {String} recordName Name of the record to get or create
   * @returns {Promise} Resolves an object with a created boolean and the record
   */
  public async getOrCreate(recordName) {
    const hasRecord = await this.has(recordName)
    const record = await this.dsGetRecord(recordName)
    return { created: !hasRecord, record }
  }

  /**
   * Wraps deepstream getRecord in a promise.
   * @param {Object} client Deepstream client
   * @param {String} recordName Name of the record to get
   * @returns {Promise}
   */
  public dsGetRecord(recordName) {
    // [1] - This remains a traditional promise because I could not find a
    // suitable way to rewrite `record.on('error', ...)`
    return new Promise((resolve, reject) => {
      const record = this.client.record.getRecord(recordName);
      record.whenReady(() => addPromiseSet(record))
      record.on('error', err => reject(err));
    });
  }


  /**
   *
   * @param {String} recordName
   * @param {Boolean} ignoreWhenReady - If true; will return the list without waiting
   * for when ready else a promise will be returned that resolves when the whenReady
   * callback is called.
   */
  public getList(listName, ignoreWhenReady = false) {
    // See [1] as to why this "still" uses `Promise()`
    if (ignoreWhenReady) {
      return this.client.record.getList(listName);
    }
    return new Promise((resolve, reject) => {
      const list = this.client.record.getList(listName);
      list.whenReady(() => resolve(list));
      list.once('error', err => reject(err));
    });
  }

  /**
   * Get the entries of a list.
   * @param {String} listName
   * @returns {Promise.<Array>}
   */
  public async getEntries(listName) {
    const list = await this.snapshot(listName)
    return Array.isArray(list) ? list : []
  }


  /**
   * Add the entry to the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  public async addEntry(listName, entry, index) {
    const list = await this.getList(listName)
    list.addEntry(entry, index)
    const timeout = setTimeout(() => list.discard(), LIST_DISCARD_TIMEOUT)
    list.on('delete', () => clearTimeout(timeout))
  }

  /**
   * Remove the entry from the list and discard.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise}
   */
  public async removeEntry(listName, entry, index) {
    const list = await this.getList(listName)
    list.removeEntry(entry, index);
    const timeout = setTimeout(() => list.discard(), LIST_DISCARD_TIMEOUT);
    list.on('delete', () => clearTimeout(timeout));
  }

  /**
   * Delete the list
   * @param {String} listName
   * @returns {Promise}
   */
  public async deleteList(listName) {
    const list = await this.getList(listName)
    return list.delete()
  }

  /**
   * Check if the list includes the given entry.
   * @param {String} listName
   * @param {String} entry
   * @returns {Promise.<Boolean>}
   */
  public async listIncludes(listName, entry) {
    // so for some reason Array.includes is not part of the ES6 standard
    // according to typescript. As far as I can see it is
    // (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes)
    // Therefore we have to coerce this to a weird value...
    const entries = await this.getEntries(listName)
    return entries.includes!(entry)
  }
}

export default RecordUtils
