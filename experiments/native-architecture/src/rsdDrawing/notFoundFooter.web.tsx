import { RsdInformationFooter } from './RsdInformationFooter';
import type { OpenAppPage } from './pageDocumentState';

function openExternal(href: string) {
  location.assign(href);
}

export function RsdNotFoundFooter({ openAppPage }: { openAppPage: OpenAppPage }) {
  return <RsdInformationFooter page={null} onExternal={openExternal} openAppPage={openAppPage} />;
}
