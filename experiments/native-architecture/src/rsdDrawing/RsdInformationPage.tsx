import { Fragment, useEffect, useRef, useState } from 'react';
import { Linking, Platform, type ScrollView } from 'react-native';
import { css, html } from 'react-strict-dom';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawingAppearanceProvider } from '../drawing/DrawingAppearance';
import { bootAppearance } from '../platform/bootAppearance';
import { openAppPage, setDocumentTitle } from '../platform/appPath';
import { useDialogBack } from '../platform/BrowserBack';
import { soundSettingsStorage } from '../platform/soundSettings';
import { createDrawingProduct } from '../product/createDrawingProduct';
import { createNativeFeedback } from '../feedback/feedback';
import { feedbackDevice, feedbackPolicyStorage, feedbackTransport } from '../platform/feedback';
import type { AppPage } from '../information/appPages';
import privacy from '../information/privacy.generated.json';
import { RELEASE_NOTES } from '../settings/whatsNew';
import { useParentGateCard } from '../parentCenter/useParentGateCard';
import { RsdPageSheet } from './RsdNotFoundPage';
import { RsdPrivacyContent } from './RsdPrivacyContent';
import { RsdInformationFooter } from './RsdInformationFooter';
import { RsdReleaseBlocks } from './RsdWhatsNewSection';
import { RsdFeedbackSection } from './RsdFeedbackSection';
import { RsdParentGateSheet } from './RsdParentGateSheet';
import { RsdParentCenterSection } from './RsdParentCenterSection';
import { useModalPresence } from './useModalPresence';
import { ModalShell } from './ModalShell';
import { DialogHeader } from './DialogHeader';
import { styles as controlStyles } from './controls';
import { colors, dimensions } from './tokens.css';

type Page = Exclude<AppPage, 'drawing'>;
const PAGE_LINE_HEIGHT = 1.6;
const PAGE_FONT_PX = 16;
const styles = css.create({
  section: { marginTop: dimensions.space6 },
  heading: {
    marginTop: 0,
    marginBottom: dimensions.space2,
    color: colors.textStrong,
    fontSize: dimensions.fontSizeLg,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: dimensions.space3,
    fontSize: dimensions.fontSizeMd,
    color: colors.text,
    lineHeight: PAGE_LINE_HEIGHT,
  },
  muted: { color: colors.textSoft },
});
const PAGE_TITLES: Record<Page, string> = {
  privacy: 'Privacy policy',
  changelog: 'Changelog',
  feedback: 'Send Feedback',
};
const PAGE_LEDES: Record<Page, string> = {
  privacy: privacy.native.lede,
  changelog:
    'Every public Splotch release, newest first, with the notes that shipped alongside it.',
  feedback: 'Report a bug or suggest a feature — privately, with no account needed.',
};

function Changelog() {
  return RELEASE_NOTES.map((release) => (
    <html.section key={release.version} style={styles.section}>
      <html.h2
        style={[controlStyles.boldText, styles.heading]}
      >{`Version ${release.version}`}</html.h2>
      <html.p style={[styles.paragraph, styles.muted]}>{release.dateLabel}</html.p>
      {release.sections.map((section) => (
        <Fragment key={section.title}>
          <html.h3 style={[controlStyles.boldText, styles.heading]}>{section.title}</html.h3>
          <html.div style={styles.paragraph}>
            <RsdReleaseBlocks
              blocks={section.blocks}
              fontSizePx={PAGE_FONT_PX}
              lineHeight={PAGE_LINE_HEIGHT}
            />
          </html.div>
        </Fragment>
      ))}
    </html.section>
  ));
}

function usePageProduct() {
  const [, publish] = useState(0);
  const [owner] = useState(() =>
    createDrawingProduct(soundSettingsStorage, () => publish((value) => value + 1))
  );
  const [feedback] = useState(() =>
    createNativeFeedback({
      transport: feedbackTransport,
      device: feedbackDevice,
      policyStorage: feedbackPolicyStorage,
      parent: owner.port,
    })
  );
  useEffect(() => {
    void owner.settings.load();
    void feedback.loadPolicy();
    return () => {
      feedback.dispose();
      owner.dispose();
    };
  }, [owner, feedback]);
  return { owner, feedback };
}

function PageContent({ page }: { page: Page }) {
  const { owner, feedback } = usePageProduct();
  const state = owner.getState();
  const gate = useParentGateCard(state.gate);
  const card = useModalPresence(gate?.open ? gate : null);
  const parentCenter = useModalPresence(state.parentCenterOpen ? true : null);
  const scroll = useRef<ScrollView>(null);
  const bodyOffset = useRef(0);
  const sections = useRef<Record<string, number>>({});
  useDialogBack(true, () => openAppPage('drawing'));
  const onLink = (href: string) => {
    if (href.startsWith('#')) {
      scroll.current?.scrollTo({
        y: bodyOffset.current + (sections.current[href.slice(1)] ?? 0),
        animated: false,
      });
      return;
    }
    if (href === '/feedback') {
      openAppPage('feedback');
      return;
    }
    owner.port.request(
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
        lede={PAGE_LEDES[page]}
        scrollRef={scroll}
        onBodyOffset={(offset) => {
          bodyOffset.current = offset;
        }}
      >
        {page === 'privacy' ? (
          <RsdPrivacyContent
            policy={policy}
            onLink={onLink}
            onSectionLayout={(id, y) => {
              sections.current[id] = y;
            }}
          />
        ) : page === 'changelog' ? (
          <Changelog />
        ) : (
          <RsdFeedbackSection owner={feedback} />
        )}
        <RsdInformationFooter page={page} onExternal={onLink} />
      </RsdPageSheet>
      {card.shown ? (
        <RsdParentGateSheet
          owner={owner}
          state={card.shown.state}
          unlocked={card.shown.unlocked}
          visible={card.visible}
          onDismiss={card.dismissed}
        />
      ) : null}
      {parentCenter.shown ? (
        <ModalShell
          label="Parent Center"
          visible={parentCenter.visible}
          onDismiss={parentCenter.dismissed}
          onClose={owner.closeParentCenter}
          header={<DialogHeader title="Parent Center" onClose={owner.closeParentCenter} />}
        >
          <RsdParentCenterSection owner={owner} />
        </ModalShell>
      ) : null}
    </>
  );
}

export function RsdInformationPage({ page }: { page: Page }) {
  useEffect(() => setDocumentTitle(`${PAGE_TITLES[page]} · Splotch`), [page]);
  return (
    <DrawingAppearanceProvider preference={bootAppearance()}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <PageContent page={page} />
      </SafeAreaProvider>
    </DrawingAppearanceProvider>
  );
}
