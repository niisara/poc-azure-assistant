/**
 * Define the Result type with correct interface
 */
export interface Ok<T> {
    type: 'ok';
    data: T;
}

export interface Err<E> {
    type: 'error';
    error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(data: T): Ok<T> {
    return { type: 'ok', data };
}

export function err<E>(error: E): Err<E> {
    return { type: 'error', error };
}
