import { action, computed, observable } from 'mobx';

import { IApiDataPagedOpts, IAsyncDataPaged, TAsyncArguments, TAsyncPaged, TAsyncReturn } from '../types/types.AsyncData';
import { AsyncDataExtendable } from './class.AsyncDataExtendable';
import { pageSizeEdged } from '../helpers/helper.mobx';

export class AsyncDataPaged<Api extends TAsyncPaged, Req extends TAsyncArguments<Api> = TAsyncArguments<Api>, Res extends TAsyncReturn<Api> = TAsyncReturn<Api>>
  extends AsyncDataExtendable<Api, Req, Res>
  implements IAsyncDataPaged<Api, Req, Res> {
  @observable public isLoadedAll = false;
  @observable public isLoadingMore = false;

  private get _pageSize() {
    return this.req ? this.req[this._opts.pageSizeKey] : 0;
  }
  private get _pageSizeAll() {
    return this._opts.silent && !this._isLoaded ? this._pageSize : pageSizeEdged(this._pageSize, this.data);
  }

  @computed public get canLoadMore() {
    return !!this._data && !this.isLoadedAll && !this.isError;
  }

  constructor(_apiFn: Api, protected _opts: IApiDataPagedOpts<Api>) {
    super(_apiFn, _opts, {
      onSetData: (res) => {
        this.isLoadingMore = false;
        return res;
      },
      onReset: () => {
        this.isLoadedAll = false;
        this.isLoadingMore = false;
        if (this._req) this._req = { ...this._req, [this._opts.offsetKey]: 0 };
      },
      onGet: (req, res) => {
        this.isLoadedAll = !res || res.length === 0 || res.length % req[this._opts.pageSizeKey] !== 0;
        return res;
      },
      onError: (err) => {
        this.isLoadingMore = false;
        return err;
      },
    });
  }

  @action.bound
  public loadMore() {
    if (!this.req || !this.canLoadMore || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this._loadMore({ ...this.req, [this._opts.offsetKey]: this._pageSizeAll });
  }
  private async _loadMore(req?: Req) {
    const [res] = await this._getFromApi(req);
    if (this._opts.sort && !!res) res.sort(this._opts.sort);
    const data = this._data && res ? ([...this._data, ...res] as Res) : res;
    this._setFromApi([data]);
  }
}
