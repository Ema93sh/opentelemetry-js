/*!
 * Copyright 2019, OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import 'zone.js';
import * as sinon from 'sinon';
import * as assert from 'assert';
import { ZoneScopeManager } from '../src';

let clock: any;

describe('ZoneScopeManager', () => {
  let scopeManager: ZoneScopeManager;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    scopeManager = new ZoneScopeManager();
    scopeManager.enable();
  });

  afterEach(() => {
    clock.restore();
    scopeManager.disable();
  });

  describe('.enable()', () => {
    it('should work', () => {
      assert.doesNotThrow(() => {
        assert(scopeManager.enable() === scopeManager, 'should return this');
        assert(scopeManager.active() === window, 'should has root scope');
      });
    });
  });

  describe('.disable()', () => {
    it('should work', () => {
      assert.doesNotThrow(() => {
        assert(scopeManager.disable() === scopeManager, 'should return this');
        assert(scopeManager.active() === undefined, 'should has no scope');
      });
    });
  });

  describe('.with()', () => {
    it('should run the callback (null as target)', done => {
      scopeManager.with(null, done);
    });

    it('should run the callback (object as target)', done => {
      const test = { a: 1 };
      scopeManager.with(test, () => {
        assert.strictEqual(scopeManager.active(), test, 'should have scope');
        return done();
      });
    });

    it('should run the callback (when disabled)', done => {
      scopeManager.disable();
      scopeManager.with(null, () => {
        scopeManager.enable();
        return done();
      });
    });

    it('should rethrow errors', done => {
      assert.throws(() => {
        scopeManager.with(null, () => {
          throw new Error('This should be rethrown');
        });
      });
      return done();
    });

    it('should finally restore an old scope, including the async task', done => {
      const scope1 = 'scope1';
      const scope2 = 'scope2';
      const scope3 = 'scope3';

      scopeManager.with(scope1, () => {
        assert.strictEqual(scopeManager.active(), 'scope1');
        scopeManager.with(scope2, () => {
          assert.strictEqual(scopeManager.active(), 'scope2');
          scopeManager.with(scope3, () => {
            assert.strictEqual(scopeManager.active(), 'scope3');
          });
          assert.strictEqual(scopeManager.active(), 'scope2');
        });
        assert.strictEqual(scopeManager.active(), 'scope1');
        setTimeout(() => {
          assert.strictEqual(scopeManager.active(), 'scope1');
          done();
        }, 500);
        clock.tick(500);
      });
      assert.strictEqual(scopeManager.active(), window);
    });

    it('should finally restore an old scope when scope is an object, including the async task', done => {
      const scope1 = { a: 1 };
      const scope2 = { a: 2 };
      const scope3 = { a: 3 };
      scopeManager.with(scope1, () => {
        assert.strictEqual(scopeManager.active(), scope1);
        scopeManager.with(scope2, () => {
          assert.strictEqual(scopeManager.active(), scope2);
          scopeManager.with(scope3, () => {
            assert.strictEqual(scopeManager.active(), scope3);
          });
          assert.strictEqual(scopeManager.active(), scope2);
        });
        assert.strictEqual(scopeManager.active(), scope1);
        setTimeout(() => {
          assert.strictEqual(scopeManager.active(), scope1);
          done();
        }, 500);
        clock.tick(500);
      });
      assert.strictEqual(scopeManager.active(), window);
    });
    it('should correctly return the scopes for 3 parallel actions', () => {
      const rootSpan = { name: 'rootSpan' };
      scopeManager.with(rootSpan, () => {
        assert.ok(
          scopeManager.active() === rootSpan,
          'Current span is rootSpan'
        );
        const concurrentSpan1 = { name: 'concurrentSpan1' };
        const concurrentSpan2 = { name: 'concurrentSpan2' };
        const concurrentSpan3 = { name: 'concurrentSpan3' };

        scopeManager.with(concurrentSpan1, () => {
          setTimeout(() => {
            assert.ok(
              scopeManager.active() === concurrentSpan1,
              'Current span is concurrentSpan1'
            );
          }, 10);
        });

        scopeManager.with(concurrentSpan2, () => {
          setTimeout(() => {
            assert.ok(
              scopeManager.active() === concurrentSpan2,
              'Current span is concurrentSpan2'
            );
          }, 20);
        });

        scopeManager.with(concurrentSpan3, () => {
          setTimeout(() => {
            assert.ok(
              scopeManager.active() === concurrentSpan3,
              'Current span is concurrentSpan3'
            );
          }, 30);
        });
      });
    });
  });

  describe('.bind(function)', () => {
    it('should call the function with previously assigned scope', () => {
      class Obj {
        title: string;

        constructor(title: string) {
          this.title = title;
        }

        getTitle() {
          return this.title;
        }
      }

      const obj1 = new Obj('a1');
      obj1.title = 'a2';
      const obj2 = new Obj('b1');
      const wrapper: any = scopeManager.bind(obj2.getTitle, obj1);
      assert.ok(wrapper(), 'a2');
    });

    it('should return the same target (when enabled)', () => {
      const test = { a: 1 };
      assert.deepStrictEqual(scopeManager.bind(test), test);
    });

    it('should return the same target (when disabled)', () => {
      scopeManager.disable();
      const test = { a: 1 };
      assert.deepStrictEqual(scopeManager.bind(test), test);
      scopeManager.enable();
    });

    it('should return current scope (when enabled)', done => {
      const scope = { a: 1 };
      const fn: any = scopeManager.bind(() => {
        assert.strictEqual(scopeManager.active(), scope, 'should have scope');
        return done();
      }, scope);
      fn();
    });

    it('should return current scope (when disabled)', done => {
      scopeManager.disable();
      const scope = { a: 1 };
      const fn: any = scopeManager.bind(() => {
        assert.strictEqual(scopeManager.active(), scope, 'should have scope');
        return done();
      }, scope);
      fn();
    });

    it('should bind the the certain scope to the target "addEventListener" function', done => {
      const scope1 = { a: 1 };
      const element = document.createElement('div');

      scopeManager.bind(element, scope1);

      element.addEventListener('click', () => {
        assert.strictEqual(scopeManager.active(), scope1);
        setTimeout(() => {
          assert.strictEqual(scopeManager.active(), scope1);
          done();
        }, 500);
        clock.tick(500);
      });

      element.dispatchEvent(
        new CustomEvent('click', {
          bubbles: true,
          cancelable: false,
          composed: true,
        })
      );
    });

    it('should preserve zone when creating new click event inside zone', done => {
      const scope1 = { a: 1 };
      const element = document.createElement('div');

      scopeManager.bind(element, scope1);

      element.addEventListener('click', () => {
        assert.strictEqual(scopeManager.active(), scope1);
        setTimeout(() => {
          assert.strictEqual(scopeManager.active(), scope1);
          const element2 = document.createElement('div');

          element2.addEventListener('click', () => {
            assert.strictEqual(scopeManager.active(), scope1);
            setTimeout(() => {
              assert.strictEqual(scopeManager.active(), scope1);
              done();
            }, 500);
            clock.tick(500);
          });

          element2.dispatchEvent(
            new CustomEvent('click', {
              bubbles: true,
              cancelable: false,
              composed: true,
            })
          );
        }, 500);
        clock.tick(500);
      });

      element.dispatchEvent(
        new CustomEvent('click', {
          bubbles: true,
          cancelable: false,
          composed: true,
        })
      );
    });
  });
});
