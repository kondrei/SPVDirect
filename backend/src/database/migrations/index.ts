// Migrations are listed explicitly (not globbed) so they load reliably under ESM
// on every OS. Add each new migration class here.
import { InitialSchema1790200000000 } from './1790200000000-InitialSchema.js';

export const migrations = [InitialSchema1790200000000];
