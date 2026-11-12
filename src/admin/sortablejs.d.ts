// Minimal typings for the subset of sortablejs the admin uses (avoids an extra @types dependency).
declare module "sortablejs" {
  interface SortableEvent {
    oldIndex?: number;
    newIndex?: number;
    item: HTMLElement;
  }
  interface Options {
    animation?: number;
    handle?: string;
    draggable?: string;
    filter?: string;
    ghostClass?: string;
    chosenClass?: string;
    delay?: number;
    delayOnTouchOnly?: boolean;
    forceFallback?: boolean;
    direction?: "horizontal" | "vertical";
    onEnd?: (evt: SortableEvent) => void;
  }
  export default class Sortable {
    constructor(el: HTMLElement, options?: Options);
    static create(el: HTMLElement, options?: Options): Sortable;
    destroy(): void;
    toArray(): string[];
    sort(order: string[], useAnimation?: boolean): void;
  }
}
