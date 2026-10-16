import { RsdInformationFooter } from './RsdInformationFooter';

function openExternal(href: string) {
  location.assign(href);
}

export function RsdNotFoundFooter() {
  return <RsdInformationFooter page={null} onExternal={openExternal} />;
}
