// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ADMIN_ACTIONS } from '$lib/adminForm';
import { actions } from './+page.server';

// +page.svelte posts to `?/<name>` for each declared action. A name the route
// does not export compiles on both sides and fails only at runtime, as
// SvelteKit's "No action with name" 404.
describe('/admin form actions', () => {
  it('exports exactly the actions the page posts to', () => {
    expect(Object.keys(actions).sort()).toEqual([...ADMIN_ACTIONS].sort());
  });
});
