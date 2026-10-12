import { onMount } from 'svelte';

// The one way a component tells "rendered on the server, or on the client
// before hydration" from "live": false through SSR and the hydration pass,
// true once this component has mounted. Call during component init. The
// progressive-enhancement shells key their JS-only affordances off it, and a
// form gates its submit on it so a pre-hydration press cannot become a native
// GET (issue #615).
export function createHydratedFlag(): { readonly hydrated: boolean } {
  let hydrated = $state(false);
  onMount(() => {
    hydrated = true;
  });
  return {
    get hydrated() {
      return hydrated;
    },
  };
}
