import { useSyncExternalStore } from 'react';
import {
  BETA_OPT_IN_URL,
  MIN_ANDROID_RELEASE,
  PLAY_STORE_LISTING_URL,
  TESTERS_GROUP_URL,
} from '../lib/components/beta/androidBeta';
import {
  MIN_IOS_RELEASE,
  TESTFLIGHT_APP_URL,
  TESTFLIGHT_INVITE_URL,
} from '../lib/components/beta/iosBeta';
import { FEEDBACK_URL } from '../lib/siteUrl';
import { supportEmail } from '../lib/supportEmail';
import { RsdRuleLabel } from '../rsdDrawing/RsdRuleLabel';
import { dimensions } from '../rsdDrawing/tokens.css';
import { BETA_COPY } from './betaCopy';
import {
  BetaStep,
  Ledger,
  OutsideLink,
  Strong,
  TextLink,
  TroubleRow,
  Troubleshooting,
} from './BetaSteps';

// /beta's two panels: shipping's AndroidBetaPanel.svelte and IosBetaPanel.svelte.

const NO_SUBSCRIPTION = () => () => {};

// The support address is composed after hydration, so no harvester finds it in the document;
// without a script the email card stays away and the feedback form stays available.
function useSupportAddress() {
  return useSyncExternalStore(NO_SUBSCRIPTION, supportEmail, () => '');
}

export function AndroidPanel({ phone, width }: { phone: boolean; width: number }) {
  const support = useSupportAddress();
  return (
    <>
      <div style={{ paddingBottom: dimensions.space5 }}>
        <RsdRuleLabel>{BETA_COPY.android}</RsdRuleLabel>
      </div>
      <Ledger phone={phone}>
        <BetaStep
          number={1}
          title="Join the testers group"
          action={{ href: TESTERS_GROUP_URL, label: 'Join the testers group' }}
          phone={phone}
        >
          Press <Strong>Join group</Strong> at the top — Google Play checks this group to decide who
          can see the beta. Use the <Strong>same Google account</Strong> that's signed in to the
          Play Store on your phone or tablet.
        </BetaStep>
        <BetaStep
          number={2}
          title="Opt in on Google Play"
          action={{ href: BETA_OPT_IN_URL, label: 'Become a tester' }}
          phone={phone}
        >
          Press <Strong>Become a tester</Strong>, signed in with the same account you used in step
          1. This enrolls you; it doesn't install anything yet.
        </BetaStep>
        <BetaStep
          number={3}
          title="Install Splotch"
          action={{ href: PLAY_STORE_LISTING_URL, label: 'Open Splotch on Google Play' }}
          card={{
            label: 'Please stay for 14 days',
            body: (
              <>
                Google requires a stretch of continuously enrolled testers before Splotch can apply
                for a public listing, so please{' '}
                <Strong>stay opted in for at least 14 days in a row</Strong>. You don't have to keep
                drawing — just stay enrolled.
              </>
            ),
          }}
          phone={phone}
        >
          The listing unlocks once step 2 is done. Install it like any other app — beta updates
          arrive automatically from here.
        </BetaStep>
        <BetaStep
          number={4}
          title="Tell us what you think"
          action={{ href: '/feedback', label: 'Send feedback', external: false }}
          optional
          card={
            support
              ? {
                  label: 'Or just email me',
                  body: (
                    <>
                      Anything at all — broken, confusing, an idea, or just to say your kid liked it
                      — reach me at <TextLink href={`mailto:${support}`}>{support}</TextLink>. Good
                      and bad are both worth hearing.
                    </>
                  ),
                }
              : null
          }
          last
          phone={phone}
        >
          Found a bug, or thought of something Splotch should do? The form lives at{' '}
          <TextLink href="/feedback">{FEEDBACK_URL}</TextLink> — odd crashes, confusing buttons, and
          “my toddler did <em>what</em>?” stories are all genuinely useful.
        </BetaStep>
      </Ledger>
      <Troubleshooting
        summary={['Beta not showing up, ', 'or stuck on step 2?']}
        clause="“item not found”,"
        width={width}
      >
        <TroubleRow title="“Item not found” on the store link">
          You aren't opted in yet, or the browser is signed in to a different Google account. Go
          back to <OutsideLink href={BETA_OPT_IN_URL}>the tester page</OutsideLink>, check the
          account shown in the top-right corner, and opt in there first.
        </TroubleRow>
        <TroubleRow title="The tester page says you're not a member">
          Joining is instant and there's no approval to wait on, so either the join never went
          through or it went through on a different Google account. Open{' '}
          <OutsideLink href={TESTERS_GROUP_URL}>the group page</OutsideLink> again, check the
          account in the top-right corner, and join from there.
        </TroubleRow>
        <TroubleRow title="The phone can't find the app but your computer can">
          The two are signed in to different accounts. In the Play Store app, tap your profile
          picture in the top-right to see which account is active.
        </TroubleRow>
        <TroubleRow title="Play says the device isn't compatible">
          {`Splotch needs Android ${MIN_ANDROID_RELEASE} or newer. On a device older than that the store offers no Install button, and none of the account checks above will change it.`}
        </TroubleRow>
        <TroubleRow title="You just joined and the links haven't caught up">
          None of this is instant — Google Play doesn't always recognize a new group membership
          straight away. Check that both pages are signed in to the same Google account, then make a
          cup of tea and try again a little later before assuming something is broken.
        </TroubleRow>
        <TroubleRow title="Everything looks right and Play still disagrees">
          Close and reopen the Play Store, check the active account, and try the store link again.
          As a last resort, open Android Settings → Apps → Google Play Store → Storage and clear its
          cache; the exact menu names vary by device.
        </TroubleRow>
        <TroubleRow title="Leaving the beta">
          Open <OutsideLink href={BETA_OPT_IN_URL}>the tester page</OutsideLink> again and press
          “Leave the program”, which stops the beta updates. If a public Android version is out by
          then, you may need to uninstall Splotch and reinstall it from Google Play to switch over;
          until there is one, leaving the beta also means you won't be able to reinstall the Android
          app. No hard feelings.
        </TroubleRow>
      </Troubleshooting>
    </>
  );
}

export function IosPanel({ phone, width }: { phone: boolean; width: number }) {
  const support = useSupportAddress();
  return (
    <>
      <div style={{ paddingBottom: dimensions.space5 }}>
        <RsdRuleLabel>{BETA_COPY.ios}</RsdRuleLabel>
      </div>
      <Ledger phone={phone}>
        <BetaStep
          number={1}
          title="Install TestFlight"
          action={{ href: TESTFLIGHT_APP_URL, label: 'Get TestFlight from Apple' }}
          phone={phone}
        >
          TestFlight is Apple's app for trying prerelease apps. Install it from the App Store on the
          iPhone or iPad you'll draw on — or skip straight to step 2 if you already have it.
        </BetaStep>
        <BetaStep
          number={2}
          title="Accept the invitation"
          action={{ href: TESTFLIGHT_INVITE_URL, label: 'Open the Splotch invitation' }}
          phone={phone}
        >
          Open Splotch's public invitation — it opens in TestFlight — and follow Apple's prompt to
          start testing. You may be asked to sign in with your Apple Account first.
        </BetaStep>
        <BetaStep
          number={3}
          title="Install Splotch"
          action={{ href: TESTFLIGHT_INVITE_URL, label: 'Open Splotch in TestFlight' }}
          phone={phone}
        >
          Splotch now appears inside TestFlight. Tap <Strong>Install</Strong>, then open it like any
          other app — new beta builds arrive there automatically.
        </BetaStep>
        <BetaStep
          number={4}
          title="Tell us what you think"
          action={{ href: '/feedback', label: 'Send feedback', external: false }}
          optional
          card={
            support
              ? {
                  label: 'Or just email me',
                  body: (
                    <>
                      Reach out to me at <TextLink href={`mailto:${support}`}>{support}</TextLink>{' '}
                      if something is broken, confusing, or unexpectedly delightful. Good and bad
                      are both worth hearing.
                    </>
                  ),
                }
              : null
          }
          last
          phone={phone}
        >
          TestFlight can send feedback and screenshots directly, or use the form at{' '}
          <TextLink href="/feedback">{FEEDBACK_URL}</TextLink> — bugs, confusing buttons, and “my
          toddler did <em>what</em>?” stories are all genuinely useful.
        </BetaStep>
      </Ledger>
      <Troubleshooting
        summary={['Invitation not opening, ', 'or no Install button?']}
        clause="beta unavailable,"
        width={width}
      >
        <TroubleRow title="The invitation opens in Safari instead of TestFlight">
          Install <OutsideLink href={TESTFLIGHT_APP_URL}>TestFlight from the App Store</OutsideLink>{' '}
          first, then reopen the invitation on the same iPhone or iPad.
        </TroubleRow>
        <TroubleRow title="The beta isn't accepting new testers">
          The current build may still be waiting for Apple's review, enrollment may be paused, or
          the group may be full. Try the{' '}
          <OutsideLink href={TESTFLIGHT_INVITE_URL}>invitation</OutsideLink> again later.
        </TroubleRow>
        <TroubleRow title="Splotch appears, but there is no Install button">
          {`Check that the device runs iOS or iPadOS ${MIN_IOS_RELEASE} or newer and has enough free storage, then close and reopen TestFlight.`}
        </TroubleRow>
        <TroubleRow title="A new beta build isn't showing up">
          Open TestFlight, select Splotch, and look for an Update button. TestFlight may take a
          little while to show a newly released build. Beta builds also expire after 90 days, so an
          install that stopped opening usually just needs that update.
        </TroubleRow>
        <TroubleRow title="Leaving the beta">
          Open Splotch in TestFlight, scroll to the bottom, and tap “Stop Testing”. This stops beta
          updates and removes you from the testing group. No hard feelings.
        </TroubleRow>
      </Troubleshooting>
    </>
  );
}
