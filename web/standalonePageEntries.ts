import { fileURLToPath } from 'node:url';

export function standalonePageEntries(native: boolean) {
  const pageDirectory = './src/lib/components/page/';
  const component = (name: string) => fileURLToPath(new URL(pageDirectory + name, import.meta.url));
  return {
    $notFoundPage: component(native ? 'NativeNotFoundPage.svelte' : 'NotFoundPage.svelte'),
    $pageIcon: component(native ? 'NativePageIcon.svelte' : 'WebPageIcon.svelte'),
    $nativePageParentCenter: component(
      native ? 'pageParentCenter.svelte.ts' : 'webPageParentCenter.ts'
    ),
  };
}
