/* eslint-disable @typescript-eslint/no-misused-promises */
import _ from 'lodash';
import { action, computed, observable, trace } from 'mobx';
import { actionAsync } from 'mobx-utils';

import {
  IAsyncData,
  IAsyncDataExtension,
  IAsyncDataOpts,
  TAsync,
  TAsyncAnswer,
  TAsyncArguments,
  TAsyncError,
  TAsyncRequestId,
  TAsyncReturn,
} from '../types/types.AsyncData';

export abstract class AsyncDataExtendable<
  Api extends TAsync,
  Req extends TAsyncArguments<Api> = TAsyncArguments<Api>,
  Res extends TAsyncReturn<Api> = TAsyncReturn<Api>
> implements IAsyncData<Api, Req, Res> {
  @observable protected _isTracked = true;
  protected _reqId: TAsyncRequestId = 0;
  protected _reqLast?: Req;
  protected _tickerLoad?: NodeJS.Timeout; // таймер асинхронного лоада (для lazyloading)

  @observable private _needRequest = false; // триггер для насильного перезапроса
  @computed protected get _isReqChanged() {
    // после установки одного из этих значений гарантированно знаем что запрос выполнился,
    // поэтому надо перерасчитать чтоб при следующем data get этот параметр тоже перерасчитался, а не брался из memo
    this._data;
    this._error;

    const req = this.req;
    let result: Req | undefined;
    if (!_.isEqual(req, this._reqLast)) {
      this._reqLast = _.cloneDeep(req);
      result = req; // возвращаем сам объект запроса, для того чтоб наблюдатели могли реагировать на изменения в запросе
    } else result = undefined;

    if (this._opts.name) {
      console.log(`[${this._opts.name}] REQ CHANGED: ${!!result} ; NEED REQ: ${this._needRequest}`);
    }
    // если запроса нет, мы никак не можем запросить, поэтому возвращаем без участия _needRequest
    return !req ? result : this._needRequest || result;
  }

  @observable protected _data?: Res;
  @computed public get data() {
    if (this._opts.name) {
      console.log(`[${this._opts.name}] GETTED`);
      trace();
    }
    if (this._isReqChanged && this._isTracked) this._tickerLoadStart();
    else {
      if (this._opts.name) {
        console.log(`[${this._opts.name}] LOAD NOT STARTED: ${!!this._isReqChanged} && ${this._isTracked}`);
      }
    }
    if (this._e.onGetData) this._e.onGetData();
    return this._data;
  }
  public set data(value) {
    if (value) this._error = undefined;
    if (this._opts.name) {
      console.log(`[${this._opts.name}] SETTED`);
    }
    if (this._e.onSetData) value = this._e.onSetData(value);
    this._isLoaded = true;
    this._isLoading = false;
    this._needRequest = false;
    const data: Res | undefined = this._opts.filter && Array.isArray(value) ? value.filter(this._opts.filter) : value;
    this._data = data;
  }

  @observable protected _error?: TAsyncError;
  @computed public get error() {
    return this._error;
  }
  public set error(value) {
    this._isLoaded = true;
    this._isLoading = false;
    this._needRequest = false;
    if (value) {
      if (this._e.onError) value = this._e.onError(value);
      if (this._opts.onError) value = this._opts.onError(value);
    }
    this._error = value;
  }

  @computed.struct private get _reqComputed0() {
    return this._opts.reqComputed ? this._opts.reqComputed.get() : null;
  }

  // из-за computed.struct свойства _reqComputed0 - этот геттер не будет вычесляться лишний раз, при равнозначном объекте запроса, и refresh лишний раз не выполнится
  @computed private get _reqComputed() {
    if (this._opts.name) {
      console.log(`[${this._opts.name}] REQ COMPUTED`);
    }
    return this._reqComputed0;
  }

  @observable protected _req?: Req;
  @computed public get req() {
    if (this._opts.name) {
      console.log(`[${this._opts.name}] REQ`);
    }
    return this._reqComputed || this._req ? ({ ...this._reqComputed, ...this._req } as Req) : undefined;
  }
  public set req(value) {
    this._req = value;
  }

  @observable protected _isLoaded = false;
  @computed public get isLoaded() {
    return this._isLoaded;
  }

  @observable protected _isLoading = false;
  @computed public get isLoading() {
    return this._isLoading;
  }

  @computed public get isError() {
    return !!this.error;
  }

  constructor(protected _apiFn: Api, protected _opts: IAsyncDataOpts<Api> = {}, private _e: IAsyncDataExtension<Api, Req, Res> = {}) {
    if (this._opts.req) this._req = this._opts.req;
  }

  // очистить полностью
  // untrack? - возможность остановить загрузку при изменении объекта запроса (this.req)
  @action.bound
  public clear(untrack?: boolean) {
    if (this._opts.name) {
      console.log(`[${this._opts.name}] CLEAR`);
    }
    if (untrack) this._isTracked = false;
    this._needRequest = false;
    this._data = undefined;
    this._reqLast = undefined;
    this._tickerLoadClear();
    this._reset();
    if (this._e.onClear) this._e.onClear();
  }

  // обновить данные
  @action.bound
  public refresh() {
    if (this._opts.name) {
      console.log(`[${this._opts.name}] REFRESH`, this._isTracked);
    }
    // если не тракался или сейчас не идет запрос - триггерим насильно перезапрос данных
    if (!this._isTracked || !this._tickerLoad) this._needRequest = true;
    this._isTracked = true;
    this._reset();
    if (this._e.onRefresh) this._e.onRefresh();
  }

  // сброс базовых свойств в начальное состояние
  private _reset() {
    if (!this._opts.silent) this._data = undefined;
    this._error = undefined;
    this._isLoaded = false;
    this._isLoading = false;
    if (this._e.onReset) this._e.onReset();
  }

  protected _tickerLoadStart(interval?: number) {
    this._tickerLoadClear();
    this._tickerLoad = (setTimeout(() => this._loadFromApi(), interval) as any) as NodeJS.Timeout;
  }

  @actionAsync
  protected async _loadFromApi() {
    this._tickerLoadClear();
    if (!this.req) return;
    if (this._opts.name) {
      console.log(`[${this._opts.name}] LOAD`);
    }
    const req = this._e.onLoad ? this._e.onLoad(this.req) : this.req;
    this._setFromApi(await this._getFromApi(req));
  }

  @actionAsync
  protected async _getFromApi(req?: Req): Promise<TAsyncAnswer<Res>> {
    if (!req) return [null];
    const reqId = ++this._reqId;
    this._isLoading = true;
    try {
      let res = (await this._apiFn(req)) as Res | undefined;
      if (this._e.onGet) res = this._e.onGet(req, res);
      if (this._opts.onLoaded) this._opts.onLoaded(req, res);
      return [res, reqId];
    } catch (error) {
      this.error = error;
      return [null, reqId];
    }
  }

  protected _setFromApi(answer: TAsyncAnswer<Res>) {
    // eslint-disable-next-line prefer-const
    let [data, reqId] = answer;
    if (reqId && reqId !== this._reqId) return;
    if (data === null) {
      if (this._opts.silent) return;
      else data = undefined;
    }
    this.data = data;
  }

  protected _tickerLoadClear() {
    if (!this._tickerLoad) return;
    clearTimeout(this._tickerLoad);
    this._tickerLoad = undefined;
  }
}
