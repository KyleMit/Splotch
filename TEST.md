# Running Common npm Commands

Run these commands from the repository root.

## List available scripts

```sh
npm run info
```

This prints every npm script together with a short description.

## Start the API-enabled development server

```sh
npm run dev
```

This starts the Netlify-backed app at `http://localhost:8888`, including the `/api/*` functions.

## Type-check the project

```sh
npm run check
```

This runs the one-shot Svelte and TypeScript checks, treating Svelte warnings as failures.

## Build the deployable website

```sh
npm run build:cap
```

This creates the Netlify web build used to deploy `splotch.art`.
