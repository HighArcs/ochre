# ochre

example:
```ts
import { CommandManager } from '@rqft/ochre';

const manager = new CommandManager('cli')

manager.add({
    name: 'add',
    args: {
        a: Number,
        b: Number
    },
});

manager.run();

// or, if you want to test
manager.test();
```
