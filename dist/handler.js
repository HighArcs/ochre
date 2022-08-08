"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandManager = void 0;
class CommandManager {
    name;
    endian;
    constructor(name) {
        this.endian = Symbol("endian");
        process.on("uncaughtException", (e) => {
            if (e === this.endian) {
                return;
            }
            console.error(e);
        });
        this.name = name;
    }
    commands = [];
    add(command) {
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
    validate(command) {
        const errors = { flags: {}, args: {} };
        const args = this.expandArgs(command.args || {});
        const flags = this.expandArgs(command.flags || {});
        const eArgs = Object.entries(args);
        const eFlags = Object.entries(flags);
        eArgs.forEach(([name, arg]) => {
            if (arg.required && arg.default) {
                errors.args[name] = `required arguments cannot have defaults`;
            }
        });
        eFlags.forEach(([name, arg]) => {
            if (arg.required && arg.default) {
                errors.flags[name] = `required flags cannot have defaults`;
            }
        });
        let hit = false;
        eArgs.forEach(([name, arg]) => {
            if (arg.required) {
                hit = true;
            }
            else if (hit) {
                errors.args[name] = `required arguments must be before optional arguments`;
            }
        });
        const dupes = new Set();
        eArgs.forEach(([name, arg]) => {
            if (dupes.has(name)) {
                if (arg.label) {
                    if (dupes.has(arg.label)) {
                        errors.args[name] = `duplicate argument name`;
                    }
                    dupes.add(arg.label);
                }
            }
            else {
                if (dupes.has(arg.label)) {
                    errors.args[name] = `duplicate argument label`;
                }
                dupes.add(name);
            }
        });
        const fdupes = new Set();
        eFlags.forEach(([name, arg]) => {
            const n = arg.prefix;
            if (fdupes.has(n + name)) {
                if (n + arg.label) {
                    if (fdupes.has(n + arg.label)) {
                        errors.flags[name] = `duplicate flag name`;
                    }
                    fdupes.add(n + arg.label);
                }
            }
            else {
                if (fdupes.has(n + arg.label)) {
                    errors.flags[name] = `duplicate flag label`;
                }
                fdupes.add(n + name);
            }
        });
        return {
            state: Object.keys(errors.args).concat(Object.keys(errors.flags)).length === 0,
            errors,
        };
    }
    get(name) {
        return this.commands.find((c) => c.name === name);
    }
    execute(name, args) {
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
    parse(args, positional, flags) {
        const r1 = {};
        const rf = {};
        for (const [name, flag] of Object.entries(flags)) {
            const matcher = new RegExp(`^\(${flag.prefix}\)\(${flag.label || name}\)\=\(\.\+\)${flag.required ? "" : "?"}$`);
            const idx = args.findIndex((arg) => matcher.test(arg));
            const match = args[idx];
            if (match === undefined || idx === -1) {
                if (flag.default) {
                    rf[name] = flag.default;
                }
                if (flag.required) {
                    console.error(`| An argument for flag '${name}' was not provided.`);
                    throw this.endian;
                }
                continue;
            }
            const [, , , v] = matcher.exec(match);
            rf[name] = flag.parser?.(v);
            args.splice(idx, 1);
        }
        const p = Object.entries(positional);
        for (let i = 0; i < p.length; i++) {
            const [name, arg] = p[i];
            const value = args[i];
            if (value === undefined) {
                if (arg.default) {
                    r1[name] = arg.default;
                }
                if (arg.required) {
                    console.error(`| Expected ${p.length} arguments, but got ${args.length}.\n| An argument for '${name}' was not provided.`);
                    throw this.endian;
                }
                continue;
            }
            r1[name] = arg.parser?.(value);
        }
        return {
            args: r1,
            flags: rf,
        };
    }
    usage(positional, flags, footnotes = false) {
        const pos = Object.entries(positional);
        const flag = Object.entries(flags);
        const footnote = [];
        const usage = [];
        function iter(values, flags = false) {
            for (const [name, arg] of values) {
                const q = arg.required ? "" : "?";
                const n = arg.label || name;
                const t = arg.type || "string";
                const f = (arg.default || arg.description) && footnotes
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
    expandArgs(args, prefix = "--") {
        const out = {};
        Object.entries(args).forEach(([name, arg]) => {
            if (typeof arg === "function") {
                out[name] = {
                    label: name,
                    description: "",
                    parser: arg,
                    prefix,
                    required: true,
                };
            }
            else {
                out[name] = Object.assign({}, {
                    required: true,
                    label: name,
                    description: "",
                    prefix,
                    type: "string",
                    parser: (v) => v,
                }, arg);
            }
        });
        return out;
    }
    async test() {
        process
            .openStdin()
            .on("data", (data) => {
            const args = data.toString().trim().split(" ");
            if (args[0] !== this.name) {
                return;
            }
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
    run(on = process.argv) {
        const name = on[0];
        if (name !== this.name) {
            process.exit(1);
        }
        return this.execute(on[1], on.slice(2));
    }
}
exports.CommandManager = CommandManager;
