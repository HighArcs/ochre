export interface Json extends Record<string, unknown> {}
export interface Context<T extends Json, U extends Json> {
  args: T;
  flags: U;
}

export type ArgParser<T> = (arg: string) => T;
export interface Argument<T> {
  label?: string;
  description?: string;
  parser?: ArgParser<T>;
  prefix?: string;
  default?: T;
  required?: boolean;
  type?: string;
}

export type Arg<T> = ArgParser<T> | Argument<T>;

export type Struct<T extends Json> = {
  [K in keyof T]: Arg<T[K]>;
};

export type FilledStruct<T> = {
  [K in keyof T]: Argument<T[K]>;
};

export interface Command<T extends Json, U extends Json> {
  name: string;
  description?: string;
  execute(context: Context<T, U>): any;
  args?: Struct<T>;
  flags?: Struct<U>;
}

export interface Usage {
  usage: string;
  footnotes: Array<string>;
}

export interface Validation<T extends Json, U extends Json> {
  state: boolean;
  errors: Context<Record<keyof T, string>, Record<keyof U, string>>;
}
