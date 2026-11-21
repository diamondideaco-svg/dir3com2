import * as nodeModule from 'node:module';

// Next's server-only webpack layer aliases next/navigation to this same server
// implementation. The standalone Node/tsx integration runner has no webpack
// aliases, so reproduce that resolution without mocking auth, RPC or redirects.
const serverNavigation = 'next/dist/client/components/navigation.react-server.js';
if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      return nextResolve(specifier === 'next/navigation' ? serverNavigation : specifier, context);
    },
  });
} else {
  // Node 20 has no synchronous module hooks. Use Next's own server-side
  // require hook to apply the same one-entry alias in this test process.
  const require = nodeModule.createRequire(import.meta.url);
  const { addHookAliases } = require('next/dist/server/require-hook');
  addHookAliases([['next/navigation', require.resolve(serverNavigation)]]);
}
