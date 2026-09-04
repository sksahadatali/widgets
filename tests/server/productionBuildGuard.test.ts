import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertProductionSameOriginApi } from '../../app/vite.config.js';

describe('production same-origin API build guard', () => {
  it('accepts empty production and development overrides', () => {
    assert.doesNotThrow(() => assertProductionSameOriginApi('production', ''));
    assert.doesNotThrow(() => assertProductionSameOriginApi('production', '  '));
    assert.doesNotThrow(() => assertProductionSameOriginApi('development', 'http://localhost:3001'));
  });

  it('fails every nonempty production API base closed', () => {
    for (const value of ['http://localhost:3001', 'https://192.168.1.10:3001', '/other']) {
      assert.throws(() => assertProductionSameOriginApi('production', value), /same-origin/);
    }
  });
});
