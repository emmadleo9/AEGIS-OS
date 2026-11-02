// Type declarations for rxjs to suppress TS2709 namespace-as-type errors
// when using Observable as a type without @ts-nocheck
declare module 'rxjs' {
  export interface Observable<T> {
    subscribe(
      observerOrNext?: Partial<Observer<T>> | ((value: T) => void),
      error?: (err: unknown) => void,
      complete?: () => void,
    ): Subscription;
  }
  export interface Observer<T> {}
  export interface Subscriber<T> {}
  export interface Subscription {}
  export interface Subject<T> extends Observable<T>, Observer<T> {}
  export interface Observer<T> {
    next(value: T): void;
    error(err: any): void;
    complete(): void;
  }
  export interface Subscriber<T> extends Subscription {
    next(value: T): void;
    error(err: any): void;
    complete(): void;
  }
  export interface Subscription {
    unsubscribe(): void;
    readonly closed: boolean;
  }
  export interface OperatorFunction<T, R> {
    (source: Observable<T>): Observable<R>;
  }
  export function of<T>(...values: T[]): Observable<T>;
  export function from<T>(input: T | Promise<T> | Iterable<T>): Observable<T>;
  export function merge<T>(...observables: Observable<T>[]): Observable<T>;
  export function concat<T>(...observables: Observable<T>[]): Observable<T>;
  export function throwError<T>(error: any): Observable<T>;
  export function timer(dueTime: number, period?: number): Observable<number>;
  export function interval(period: number): Observable<number>;
  export function combineLatest<T>(...observables: Observable<T>[]): Observable<T[]>;
  export function zip<T>(...observables: Observable<T>[]): Observable<T[]>;
  export function race<T>(...observables: Observable<T>[]): Observable<T>;
  export function defer<T>(observableFactory: () => Observable<T>): Observable<T>;
  export function empty<T>(): Observable<T>;
  export function never<T>(): Observable<T>;
  export function bindCallback<T>(callback: (callback: (result: T) => void) => any): () => Observable<T>;
  export function bindNodeCallback<T>(callback: (callback: (error: any, result: T) => void) => any): () => Observable<T>;
}

declare module 'rxjs/operators' {
  export interface OperatorFunction<T, R> {
    (source: Observable<T>): Observable<R>;
  }
  export function map<T, R>(project: (value: T, index: number) => R): OperatorFunction<T, R>;
  export function filter<T>(predicate: (value: T, index: number) => boolean): OperatorFunction<T, T>;
  export function mergeMap<T, R>(project: (value: T, index: number) => Observable<R>): OperatorFunction<T, R>;
  export function switchMap<T, R>(project: (value: T, index: number) => Observable<R>): OperatorFunction<T, R>;
  export function concatMap<T, R>(project: (value: T, index: number) => Observable<R>): OperatorFunction<T, R>;
  export function exhaustMap<T, R>(project: (value: T, index: number) => Observable<R>): OperatorFunction<T, R>;
  export function catchError<T, R>(selector: (error: any, caught: Observable<T>) => Observable<R>): OperatorFunction<T, T>;
  export function tap<T>(observer: Partial<Observer<T>>): OperatorFunction<T, T>;
  export function tap<T>(next: (value: T) => void): OperatorFunction<T, T>;
  export function first<T>(predicate?: (value: T, index: number) => boolean): OperatorFunction<T, T>;
  export function take<T>(count: number): OperatorFunction<T, T>;
  export function takeUntil<T>(notifier: Observable<any>): OperatorFunction<T, T>;
  export function debounceTime<T>(dueTime: number): OperatorFunction<T, T>;
  export function distinctUntilChanged<T>(compare?: (a: T, b: T) => boolean): OperatorFunction<T, T>;
  export function pairwise<T>(): OperatorFunction<T, [T, T]>;
  export function share<T>(): OperatorFunction<T, T>;
  export function shareReplay<T>(bufferSize?: number, windowTime?: number): OperatorFunction<T, T>;
  export function delay<T>(duration: number): OperatorFunction<T, T>;
  export function timeout<T>(due: number): OperatorFunction<T, T>;
  export function retry<T>(count?: number): OperatorFunction<T, T>;
  export function retryWhen<T>(notifier: (errors: Observable<any>) => Observable<any>): OperatorFunction<T, T>;
  export function finalize<T>(callback: () => void): OperatorFunction<T, T>;
  export function toArray<T>(): OperatorFunction<T, T[]>;
  export function reduce<T, R>(accumulator: (acc: R, value: T) => R, seed?: R): OperatorFunction<T, R>;
  export function scan<T, R>(accumulator: (acc: R, value: T) => R, seed?: R): OperatorFunction<T, R>;
  export function buffer<T>(closingNotifier: Observable<any>): OperatorFunction<T, T[]>;
  export function bufferCount<T>(bufferSize: number, startBufferEvery?: number): OperatorFunction<T, T[]>;
  export function bufferTime<T>(bufferTimeSpan: number, bufferCreationInterval?: number): OperatorFunction<T, T[]>;
  export function window<T>(windowBoundaries: Observable<any>): OperatorFunction<T, Observable<T>>;
  export function windowCount<T>(windowSize: number, startWindowEvery?: number): OperatorFunction<T, Observable<T>>;
  export function windowTime<T>(windowTimeSpan: number, windowCreationInterval?: number): OperatorFunction<T, Observable<T>>;
  export function groupBy<T, K>(keySelector: (value: T) => K): OperatorFunction<T, Observable<T>>;
  export function partition<T>(predicate: (value: T, index: number) => boolean): [Observable<T>, Observable<T>];
  export function pluck<T, K extends keyof T>(...properties: K[]): OperatorFunction<T, T[K]>;
  export function elementAt<T>(index: number): OperatorFunction<T, T>;
  export function ignoreElements<T>(): OperatorFunction<T, never>;
  export function defaultIfEmpty<T>(defaultValue: T): OperatorFunction<T, T>;
  export function every<T>(predicate: (value: T, index: number) => boolean): OperatorFunction<T, boolean>;
  export function find<T>(predicate: (value: T, index: number) => boolean): OperatorFunction<T, T | undefined>;
  export function findIndex<T>(predicate: (value: T, index: number) => boolean): OperatorFunction<T, number>;
  export function isEmpty<T>(): OperatorFunction<T, boolean>;
  export function count<T>(predicate?: (value: T, index: number) => boolean): OperatorFunction<T, number>;
  export function min<T>(comparer?: (a: T, b: T) => number): OperatorFunction<T, T>;
  export function max<T>(comparer?: (a: T, b: T) => number): OperatorFunction<T, T>;
  export function sum<T>(): OperatorFunction<T, number>;
  export function average<T>(): OperatorFunction<T, number>;
  export function skip<T>(count: number): OperatorFunction<T, T>;
  export function skipLast<T>(count: number): OperatorFunction<T, T>;
  export function skipUntil<T>(notifier: Observable<any>): OperatorFunction<T, T>;
  export function skipWhile<T>(predicate: (value: T, index: number) => boolean): OperatorFunction<T, T>;
  export function takeLast<T>(count: number): OperatorFunction<T, T>;
  export function takeWhile<T>(predicate: (value: T, index: number) => boolean, inclusive?: boolean): OperatorFunction<T, T>;
  export function audit<T>(durationSelector: (value: T) => Observable<any>): OperatorFunction<T, T>;
  export function auditTime<T>(duration: number): OperatorFunction<T, T>;
  export function debounce<T>(durationSelector: (value: T) => Observable<any>): OperatorFunction<T, T>;
  export function throttle<T>(durationSelector: (value: T) => Observable<any>): OperatorFunction<T, T>;
  export function throttleTime<T>(duration: number, config?: { leading?: boolean; trailing?: boolean }): OperatorFunction<T, T>;
  export function sample<T>(notifier: Observable<any>): OperatorFunction<T, T>;
  export function sampleTime<T>(period: number): OperatorFunction<T, T>;
  export function scan<T, R>(accumulator: (acc: R, value: T) => R, seed?: R): OperatorFunction<T, R>;
  export function expand<T>(project: (value: T, index: number) => Observable<T>): OperatorFunction<T, T>;
  export function repeat<T>(count?: number): OperatorFunction<T, T>;
  export function repeatWhen<T>(notifier: (source: Observable<T>) => Observable<any>): OperatorFunction<T, T>;
  export function retryWhen<T>(notifier: (errors: Observable<any>) => Observable<any>): OperatorFunction<T, T>;
  export function materialize<T>(): OperatorFunction<T, any>;
  export function dematerialize<T>(): OperatorFunction<T, T>;
  export function observeOn<T>(scheduler: any): OperatorFunction<T, T>;
  export function subscribeOn<T>(scheduler: any): OperatorFunction<T, T>;
  export function timeInterval<T>(): OperatorFunction<T, { value: T; interval: number }>;
  export function timestamp<T>(scheduler?: any): OperatorFunction<T, { value: T; timestamp: number }>;
  export function windowWhen<T>(closingSelector: () => Observable<any>): OperatorFunction<T, Observable<T>>;
  export function withLatestFrom<T, R>(...observables: Observable<any>[]): OperatorFunction<T, R>;
  export function zipAll<R>(): OperatorFunction<Observable<R>, R[]>;
  export function combineAll<R>(): OperatorFunction<Observable<R>, R[]>;
  export function mergeAll<R>(): OperatorFunction<Observable<R>, R>;
  export function concatAll<R>(): OperatorFunction<Observable<R>, R>;
  export function switchAll<R>(): OperatorFunction<Observable<R>, R>;
  export function exhaust<R>(): OperatorFunction<Observable<R>, R>;
  export function mergeMapTo<R>(innerObservable: Observable<R>): OperatorFunction<any, R>;
  export function concatMapTo<R>(innerObservable: Observable<R>): OperatorFunction<any, R>;
  export function switchMapTo<R>(innerObservable: Observable<R>): OperatorFunction<any, R>;
  export function exhaustMapTo<R>(innerObservable: Observable<R>): OperatorFunction<any, R>;
  export function startWith<T>(...values: T[]): OperatorFunction<T, T>;
  export function endWith<T>(...values: T[]): OperatorFunction<T, T>;
  export function pairwise<T>(): OperatorFunction<T, [T, T]>;
  export function partition<T>(predicate: (value: T, index: number) => boolean): [Observable<T>, Observable<T>];
  export function groupBy<T, K>(keySelector: (value: T) => K): OperatorFunction<T, Observable<T>>;
}