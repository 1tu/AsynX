/* eslint-disable @typescript-eslint/no-misused-promises */
import { action, computed, observable } from 'mobx';

import { pageSizeEdged } from '../helpers/helper.mobx';
import { IApiDataPagedTimedOpts, IAsyncDataPagedTimed, TAsyncArguments, TAsyncPaged, TAsyncReturn } from '../types/types.AsyncData';
import { AsyncDataExtendable } from './class.AsyncDataExtendable';

export class AsyncDataPagedTimed<
  Api extends TAsyncPaged,
  Req extends TAsyncArguments<Api> = TAsyncArguments<Api>,
  Res extends TAsyncReturn<Api> = TAsyncReturn<Api>
> extends AsyncDataExtendable<Api, Req, Res> implements IAsyncDataPagedTimed<Api, Req, Res> {
  @computed public get canLoadMore() {
    return !!this._data && !this.isLoadedAll;
  }
  @observable public isReloading = false; // как isLoading только когда обновились зависимости
  @observable public isLoadedAll = false;
  @observable public isLoadingMore = false;

  private _isTicking = false;
  private _tickerWatcher?: NodeJS.Timeout;
  private _onErrorRetryCount = 0;

  private get _pageSize() {
    return this.req ? this.req[this._opts.pageSizeKey] : 0;
  }
  private get _pageSizeAll() {
    return this._opts.silent && !this._isLoaded ? this._pageSize : pageSizeEdged(this._pageSize, this.data);
  }

  constructor(_apiFn: Api, protected _opts: IApiDataPagedTimedOpts<Api>) {
    super(_apiFn, _opts, {
      onGetData: () => {
        if (!this.isLoaded) return;
        if (this._tickerWatcher) clearTimeout(this._tickerWatcher);
        if (!this._tickerLoad) this._tickerLoadStart(this._opts.interval);
      },
      onSetData: (value) => {
        this._nextTick();
        this.isLoadingMore = false;
        this.isReloading = false;
        return value;
      },
      onReset: () => {
        this._onErrorRetryCount = 0;
        this.isReloading = false;

        this.isLoadedAll = false;
        this.isLoadingMore = false;
        if (this._req) this._req = { ...this._req, [this._opts.offsetKey]: 0 };
      },
      onRefresh: () => {
        this._isTicking = true;
      },
      onClear: () => this.stop(),
      onGet: (req, res) => {
        this.isLoadedAll = !res || res.length === 0 || res.length % req[this._opts.pageSizeKey] !== 0;
        return res;
      },
      onLoad: (req) => {
        this._isTicking = true;
        if (this._isReqChanged) this.isReloading = true;
        return { ...req, [this._opts.pageSizeKey]: this._pageSizeAll };
      },
      onError: (err) => {
        this.isLoadingMore = false;

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

  @action.bound
  public loadMore() {
    if (!this.req || !this.canLoadMore || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this._loadMore({ ...this.req, [this._opts.offsetKey]: this._pageSizeAll });
  }
  private async _loadMore(req?: Req) {
    this._clearTicker();
    const [res] = await this._getFromApi(req);
    if (this._opts.sort && !!res) res.sort(this._opts.sort);
    const data = this._data && res ? ([...this._data, ...res] as Res) : res;
    this._setFromApi([data]);
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
    this._tickerLoadClear();
    if (this._tickerWatcher) {
      clearTimeout(this._tickerWatcher);
      this._tickerWatcher = undefined;
    }
  }
}
