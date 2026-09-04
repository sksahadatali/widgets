import { resolve } from 'node:path';
import { validateProductionRelease } from '../deployment/productionRelease.js';

const index = process.argv.indexOf('--release');
const candidate = index >= 0 ? process.argv[index + 1] : undefined;
if (!candidate) throw new Error('Usage: --release <absolute release directory>');

const manifest = await validateProductionRelease(resolve(candidate));
console.log(`Validated eY OS release ${manifest.commit}.`);
