import { IAsyncData, TArrayElement, TAsync, TAsyncArguments, TAsyncReturn } from '../types/types.AsyncData';
import { IAsyncItem, IAsyncItemConstructor } from '../types/types.AsyncItem';

export class AsyncItem<
  Api extends TAsync,
  Req extends TAsyncArguments<Api>,
  Res extends TAsyncReturn<Api>,
  Item extends TArrayElement<Res>,
  Ctor extends IAsyncItemConstructor<Item>
> {
  public list: IAsyncItem<Item>[] = [];
  constructor(public ctor: Ctor, public asyncData: IAsyncData<Api, Req, Res>) {
    if (asyncData.data) {
      if (Array.isArray(asyncData.data)) this.list = asyncData.data.map((item: Item) => new ctor(item));
      else this.list.push(new ctor(asyncData.data));
    }
  }
}
