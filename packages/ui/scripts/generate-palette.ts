import { writeFileSync } from 'node:fs';
import { render } from './derive-dark.ts';

writeFileSync(new URL('../src/palette.generated.css', import.meta.url), render());
console.log('Escrito src/palette.generated.css');
