/* eslint-disable @typescript-eslint/no-misused-promises */
import { action, observable } from 'mobx';
import { IApiDataTimedOpts, IAsyncDataTimed, TAsync, TAsyncArguments, TAsyncReturn } from '../types/types.AsyncData';
import { AsyncDataExtendable } from './class.AsyncDataExtendable';

export class AsyncDataTimed<Api extends TAsync, Req extends TAsyncArguments<Api> = TAsyncArguments<Api>, Res extends TAsyncReturn<Api> = TAsyncReturn<Api>>
  extends AsyncDataExtendable<Api, Req, Res>
  implements IAsyncDataTimed<Api, Req, Res> {
  @observable public isReloading = false; // как isLoading только когда обновились зависимости

  private _isTicking = true;
  private _tickerWatcher?: NodeJS.Timeout;
  private _onErrorRetryCount = 0;

  constructor(_apiFn: Api, protected _opts: IApiDataTimedOpts<Api>) {
    super(_apiFn, _opts, {
      onGetData: () => {
        if (!this.isLoaded) return;
        if (this._tickerWatcher) clearTimeout(this._tickerWatcher);
        if (!this._tickerLoad) this._tickerLoadStart(this._opts.interval);
      },
      onSetData: (value) => {
        this._nextTick();
        this.isReloading = false;
        return value;
      },
      onReset: () => {
        this._onErrorRetryCount = 0;
        this.isReloading = false;
      },
      onRefresh: () => {
        this._isTicking = true;
      },
      onClear: () => this.stop(),
      onLoad: (req) => {
        this._isTicking = true;
        if (this._isReqChanged) this.isReloading = true;
        return req;
      },
      onError: (err) => {
        this.isReloading = false;
        if (this._opts.retryOnError) {
          this._onErrorRetryCount++;
          if ((typeof this._opts.retryOnError === 'number' && this._opts.retryOnError >= this._onErrorRetryCount) || this._opts.retryOnError === true) {
            if (this._opts.name) {
              console.log('RETRY ON ERROR', this._opts.name);
            }
            this._nextTick(true);
          }
        }
        return err;
      },
    });
  }

  @action.bound
  public stop() {
    if (this._opts.name) {
      console.log('STOP', this._opts.name);
    }
    this._isTicking = false;
    this._clearTicker();
  }

  // nowatcher - в случае ошибки, data обновляться не будет, поэтому и get data не будет срабатывать.
  // нужно отключать вотчер на отписку для перезапроса в случае ошибки
  private _nextTick(noWatcher?: boolean) {
    if (this._opts.name) {
      console.log('NEXT TICK', this._opts.name, this._isTicking);
    }
    this._clearTicker();
    if (this._isTicking) {
      if (!noWatcher) this._tickerWatcher = setTimeout(() => (this._opts.clearOnUnobserve ? this.clear() : this.stop()), this._opts.interval / 2);
      this._tickerLoadStart(this._opts.interval);
    }
  }

  private _clearTicker() {
    if (this._tickerLoad) {
      clearTimeout(this._tickerLoad);
      this._tickerLoad = undefined;
    }
    if (this._tickerWatcher) {
      clearTimeout(this._tickerWatcher);
      this._tickerWatcher = undefined;
    }
  }
}
