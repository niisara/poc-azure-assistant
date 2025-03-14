const ResultValSymbol = Symbol('ResultValSymbol');

export type Ok<T> = { ok: true; [ResultValSymbol]: T };
export type Err<E> = { ok: false; [ResultValSymbol]: E };
export type Result<T, E> = Ok<T> | Err<E>;
export const ok = <T>(val: T): Ok<T> => ({ ok: true, [ResultValSymbol]: val });
export const err = <E>(val: E): Err<E> => ({ ok: false, [ResultValSymbol]: val });

export const unwrap = <T>(result: Ok<T>): T => result[ResultValSymbol];
export const unwrapErr = <E>(result: Err<E>): E => result[ResultValSymbol];

export interface AzureSearchResults {
  value: any[]; //NOSONAR
  '@search.score'?: number;
  id?: string;
  metadata?: string;
  content?: string;
  title?: string;
  product?: string;
  modified_time?: string;
  heading?: string;
}

const chunk = {
  question: 'The question that was asked.',
  content: 'The content of the excerpt that was chosen.',
  title: 'The title of the excerpt that was chosen.',
  heading: 'The heading of the excerpt that was chosen.',
  score: 'The @search.score of the excerpt that was chosen.',
  products: ['The products associated with the excerpt that was chosen.'],
  modified_time: 'The last modified date of the excerpt that was chosen.',
  url: 'The url of the excerpt that was chosen.',
};

export type Chunk = Partial<typeof chunk> & { question: string };

const FMT_EXCERPT = {
  title: 'The title of the excerpt that was chosen.',
  heading: 'The heading of the excerpt that was chosen.',
  url: 'The url of the excerpt that was chosen.',
};

export type SearchExcerptPayload = typeof FMT_EXCERPT;

const FMT_ONE_OF_CHUNKS = {
  answer: 'The answer to the question that used the excerpt.',
};

export type OneOfChunksPayload = typeof FMT_ONE_OF_CHUNKS & {
  chosenExcerpt?: typeof FMT_EXCERPT;
} & { omittedExcerpts?: (typeof FMT_EXCERPT)[] };

export class Marked {
  private options: {
    gfm: boolean;
    breaks: boolean;
  };

  constructor() {
    this.options = {
      gfm: false,
      breaks: false,
    };
  }

  setOptions(options: { gfm?: boolean; breaks?: boolean }): void {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  parse(markdown: string): string {
    const marked = require('marked');
    marked.setOptions(this.options);
    return marked.parse(markdown);
  }
}

export interface ContextEntry {
  input: string;
  response: string;
  timestamp: string;
}

export interface ContextError {
  message: string;
  code: 'CACHE_ERROR' | 'INVALID_DATA' | 'INVALID_AGENT';
}