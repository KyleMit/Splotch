import { useEffect } from 'react';
import { Linking, Modal, Platform } from 'react-native';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawingAppearanceProvider } from '../drawing/DrawingAppearance';
import { bootAppearance } from '../platform/bootAppearance';
import { openAppPage, setDocumentTitle } from '../platform/appPath';
import { useDialogBack } from '../platform/BrowserBack';
import type { useDrawingProduct } from '../product/useDrawingProduct';
import type { AppPage } from '../information/appPages';
import privacy from '../information/privacy.generated.json';
import { useParentGateCard } from '../parentCenter/useParentGateCard';
import { RsdPageSheet } from './RsdNotFoundPage';
import { useInformationPageScroll } from './useInformationPageScroll';
import { RsdPrivacyContent } from './RsdPrivacyContent';
import { RsdInformationFooter } from './RsdInformationFooter';
import { RsdReleaseHistory } from './releaseHistorySurface';
import { RsdFeedbackSection } from './RsdFeedbackSection';
import { RsdParentGateSheet } from './RsdParentGateSheet';
import { RsdParentCenterSection } from './RsdParentCenterSection';
import { useModalPresence } from './useModalPresence';
import { FOLLOW_APP_ORIENTATION, ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { resolveBackLabel } from '../../../../web/src/lib/components/page/backLabel';
import { DRAWING_ROUTE } from '../../../../web/src/lib/boot/appSurfaceRoute';

type Page = Exclude<AppPage, 'drawing'>;
const PAGE_TITLES: Record<Page, string> = {
  privacy: privacy.native.title,
  changelog: 'Changelog',
  feedback: 'Send Feedback',
};
const PAGE_LEDES: Record<Page, string> = {
  privacy: privacy.native.lede,
  changelog:
    'Every public Splotch release, newest first, with the notes that shipped alongside it.',
  feedback: 'Report a bug or suggest a feature — privately, with no account needed.',
};

type InformationProduct = Pick<
  ReturnType<typeof useDrawingProduct>,
  'owner' | 'state' | 'feedback'
>;
type InformationPageProps = {
  page: Page;
  product: InformationProduct;
  drawingVisited: boolean;
  standalone: boolean;
};

function PageContent({ page, product, drawingVisited }: InformationPageProps) {
  const { owner, state, feedback } = product;
  useEffect(
    () => () => {
      if (owner?.getState().gate.open) owner.gate.dismiss();
      if (owner?.getState().parentCenterOpen) owner.closeParentCenter();
    },
    [owner, page]
  );
  useEffect(() => () => feedback.owner?.close(), [feedback.owner, page]);
  const gate = useParentGateCard(state?.gate ?? null);
  const card = useModalPresence(gate?.open ? gate : null);
  const parentCenter = useModalPresence(state?.parentCenterOpen ? true : null);
  const reading = useInformationPageScroll(page);
  useDialogBack(true, () => openAppPage('drawing'));
  const onLink = (href: string) => {
    if (href.startsWith('#')) {
      reading.jump(href.slice(1));
      return;
    }
    if (href === '/feedback') {
      openAppPage('feedback');
      return;
    }
    owner?.port.request(
      'externalLinks',
      (proof) => {
        if (proof.valid()) void Linking.openURL(href);
      },
      { immediate: true }
    );
  };
  const policy = Platform.OS === 'web' ? privacy.web : privacy.native;
  return (
    <>
      <RsdPageSheet
        title={PAGE_TITLES[page]}
        backLabel={resolveBackLabel({
          fromPath: drawingVisited ? DRAWING_ROUTE : null,
          sessionFlag: null,
          referrer: '',
          origin: '',
        })}
        lede={PAGE_LEDES[page]}
        scrollRef={reading.scroll}
        onBodyOffset={reading.onBodyOffset}
        onScroll={reading.onScroll}
      >
        {page === 'privacy' ? (
          <RsdPrivacyContent
            policy={policy}
            onLink={onLink}
            onSectionLayout={reading.onSectionLayout}
            scrollY={reading.offset}
          />
        ) : page === 'changelog' ? (
          <RsdReleaseHistory />
        ) : (
          <RsdFeedbackSection owner={feedback.owner} />
        )}
        <RsdInformationFooter page={page} onExternal={onLink} />
      </RsdPageSheet>
      {owner && card.shown ? (
        <RsdParentGateSheet
          owner={owner}
          state={card.shown.state}
          unlocked={card.shown.unlocked}
          visible={card.visible}
          onDismiss={card.dismissed}
        />
      ) : null}
      {owner && parentCenter.shown ? (
        <ModalShell
          label="Parent Center"
          size="settings"
          visible={parentCenter.visible}
          onDismiss={parentCenter.dismissed}
          onClose={owner.closeParentCenter}
          header={
            <DialogHeader title="Parent Center" titleSize="lg" onClose={owner.closeParentCenter} />
          }
        >
          <RsdParentCenterSection owner={owner} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function RsdInformationPage({
  page,
  product,
  drawingVisited,
  standalone,
}: InformationPageProps) {
  useEffect(() => {
    const previous = setDocumentTitle(`${PAGE_TITLES[page]} · Splotch`);
    return () => {
      setDocumentTitle(previous);
    };
  }, [page]);
  const content = (
    <DrawingAppearanceProvider preference={product.state?.settings?.appearance ?? bootAppearance()}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <PageContent
          page={page}
          product={product}
          drawingVisited={drawingVisited}
          standalone={standalone}
        />
      </SafeAreaProvider>
    </DrawingAppearanceProvider>
  );
  return standalone ? (
    <Modal
      visible
      animationType="none"
      accessibilityLabel="Information page"
      supportedOrientations={FOLLOW_APP_ORIENTATION}
      onRequestClose={() => openAppPage('drawing')}
    >
      {content}
    </Modal>
  ) : (
    content
  );
}
