import { IAsyncData, IAsyncDataOpts, TAsync, TAsyncArguments, TAsyncReturn } from '../types/types.AsyncData';
import { AsyncDataExtendable } from './class.AsyncDataExtendable';

export class AsyncData<Api extends TAsync, Req extends TAsyncArguments<Api> = TAsyncArguments<Api>, Res extends TAsyncReturn<Api> = TAsyncReturn<Api>>
  extends AsyncDataExtendable<Api, Req, Res>
  implements IAsyncData<Api, Req, Res> {
  constructor(_apiFn: Api, _opts: IAsyncDataOpts<Api> = {}) {
    super(_apiFn, _opts);
  }
}
