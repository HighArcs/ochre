import {
  Argument,
  Command,
  Context,
  FilledStruct,
  Json,
  Struct,
  Usage,
  Validation,
} from "./types";

export class CommandManager {
  public readonly name: string;
  public readonly endian: Symbol;
  constructor(name: string) {
    this.endian = Symbol("endian");
    process.on("uncaughtException", (e: any) => {
      if (e === this.endian) {
        return;
      }

      console.error(e);
    });

    this.name = name;
  }
  public commands: Command<any, any>[] = [];

  public add<T extends Json = {}, U extends Json = {}>(
    command: Command<T, U>
  ): this {
    const validate = this.validate(command);
    if (!validate.state) {
      console.error("command validation failed");
      for (const [name, error] of Object.entries(validate.errors)) {
        for (const [key, value] of Object.entries(error)) {
          console.error(`${name}.${key}: ${value}`);
        }
      }

      throw this.endian;
    }

    console.log("ok!");

    this.commands.push(command);
    return this;
  }

  public validate<T extends Json = {}, U extends Json = {}>(
    command: Command<T, U>
  ): Validation<T, U> {
    const errors = { flags: {}, args: {} } as Validation<T, U>["errors"];

    const args = this.expandArgs(command.args || ({} as Struct<T>));
    const flags = this.expandArgs(command.flags || ({} as Struct<U>));

    const eArgs = Object.entries(args);
    const eFlags = Object.entries(flags);

    // check if all required args dont have defaults
    eArgs.forEach(([name, arg]) => {
      if (arg.required && arg.default) {
        errors.args[name as never] = `required arguments cannot have defaults`;
      }
    });

    // check if all required flags dont have defaults

    eFlags.forEach(([name, arg]) => {
      if (arg.required && arg.default) {
        errors.flags[name as never] = `required flags cannot have defaults`;
      }
    });

    // check if required args are not after optional args/args with defaults
    let hit = false;
    eArgs.forEach(([name, arg]) => {
      if (arg.required) {
        hit = true;
      } else if (hit) {
        errors.args[
          name as never
        ] = `required arguments must be before optional arguments`;
      }
    });

    // check if args have duplicates

    const dupes = new Set();
    eArgs.forEach(([name, arg]) => {
      if (dupes.has(name)) {
        if (arg.label) {
          if (dupes.has(arg.label)) {
            errors.args[name as never] = `duplicate argument name`;
          }

          dupes.add(arg.label);
        }
      } else {
        if (dupes.has(arg.label)) {
          errors.args[name as never] = `duplicate argument label`;
        }

        dupes.add(name);
      }
    });

    // check if flags have duplicates

    const fdupes = new Set();
    eFlags.forEach(([name, arg]) => {
      const n = arg.prefix;
      if (fdupes.has(n + name)) {
        if (n + arg.label) {
          if (fdupes.has(n + arg.label)) {
            errors.flags[name as never] = `duplicate flag name`;
          }

          fdupes.add(n + arg.label);
        }
      } else {
        if (fdupes.has(n + arg.label)) {
          errors.flags[name as never] = `duplicate flag label`;
        }
        fdupes.add(n + name);
      }
    });

    return {
      state:
        Object.keys(errors.args).concat(Object.keys(errors.flags)).length === 0,
      errors,
    };
  }

  public get<T extends Json = {}, U extends Json = {}>(
    name: string
  ): Command<T, U> | undefined {
    return this.commands.find((c) => c.name === name);
  }

  public execute(name: string, args: string[]): any {
    // parse the positional args first

    const command = this.get(name);

    if (!command) {
      console.error(`Command ${name} not found`);
      return;
    }

    const positional = this.expandArgs(command.args || {});
    const flags = this.expandArgs(command.flags || {});

    const context = this.parse(args, positional, flags);

    return command.execute(context);
  }

  public parse<T extends Json, U extends Json>(
    args: Array<string>,
    positional: FilledStruct<T>,
    flags: FilledStruct<U>
  ): Context<T, U> {
    const r1 = {} as T;
    const rf = {} as U;

    for (const [name, flag] of Object.entries<Argument<any>>(flags)) {
      const matcher = new RegExp(
        `^\(${flag.prefix}\)\(${flag.label || name}\)\=\(\.\+\)${
          flag.required ? "" : "?"
        }$`
      );
      const idx = args.findIndex((arg) => matcher.test(arg));
      const match = args[idx];

      if (match === undefined || idx === -1) {
        if (flag.default) {
          rf[name as keyof U] = flag.default;
        }

        if (flag.required) {
          console.error(`| An argument for flag '${name}' was not provided.`);
          throw this.endian;
        }

        continue;
      }

      const [, , , v] = matcher.exec(match)!;

      rf[name as keyof U] = flag.parser?.(v!);
      args.splice(idx, 1);
    }

    const p = Object.entries(positional);

    for (let i = 0; i < p.length; i++) {
      const [name, arg] = p[i]!;
      const value = args[i];

      if (value === undefined) {
        if (arg.default) {
          r1[name as keyof T] = arg.default;
        }

        if (arg.required) {
          console.error(
            `| Expected ${p.length} arguments, but got ${args.length}.\n| An argument for '${name}' was not provided.`
          );
          throw this.endian;
        }

        continue;
      }

      r1[name as keyof T] = arg.parser?.(value);
    }

    return {
      args: r1,
      flags: rf,
    };
  }

  public usage<T extends Json = {}, U extends Json = {}>(
    positional: FilledStruct<T>,
    flags: FilledStruct<U>,
    footnotes: boolean = false
  ): Usage {
    const pos = Object.entries(positional);
    const flag = Object.entries(flags);
    const footnote: Array<string> = [];

    const usage: Array<string> = [];

    function iter(
      values: Array<[string, Argument<T[keyof T]>]>,
      flags: boolean = false
    ) {
      for (const [name, arg] of values) {
        const q = arg.required ? "" : "?";
        const n = arg.label || name;
        const t = arg.type || "string";
        const f =
          (arg.default || arg.description) && footnotes
            ? `*`.repeat(footnote.length + 1)
            : "";
        usage.push(`${q}<${flags ? arg.prefix : ""}${n}: ${t}>${f}`);

        if (f !== "") {
          const d = arg.default ? `default=${arg.default}; ` : "";
          footnote.push(`${"*"}${n}: ${d}${arg.description || ""}`);
        }
      }
    }

    iter(pos);
    iter(flag, true);

    return {
      usage: usage.join(" "),
      footnotes: footnotes ? footnote : [],
    };
  }

  private expandArgs<T extends Json = {}>(
    args: Struct<T>,
    prefix: string = "--"
  ): FilledStruct<T> {
    const out = {} as FilledStruct<T>;
    Object.entries(args).forEach(([name, arg]) => {
      if (typeof arg === "function") {
        out[name as keyof T] = {
          label: name,
          description: "",
          parser: arg,
          prefix,
          required: true,
        };
      } else {
        out[name as keyof T] = Object.assign(
          {},
          {
            required: true,
            label: name,
            description: "",
            prefix,
            type: "string",
            parser: (v: string) => v,
          },
          arg
        );
      }
    });

    return out;
  }

  public async test(): Promise<void> {
    process
      .openStdin()
      .on("data", (data) => {
        const args = data.toString().trim().split(" ");
        if (args[0] !== this.name) {
          return;
        }
        // console.log(args);
        this.execute(args[1], args.slice(2));
      })
      .on("end", () => {
        process.exit(0);
      })
      .on("error", (err) => {
        console.error(err);
        process.exit(1);
      })
      .resume();
  }

  public run(on: Array<string> = process.argv): Promise<void> {
    const name = on[0];
    if (name !== this.name) {
      process.exit(1);
    }

    return this.execute(on[1]!, on.slice(2));
  }
}
