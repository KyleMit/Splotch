import type { ReactNode } from 'react';
import { css, html } from 'react-strict-dom';
import { colors, dimensions } from './tokens.css';

const styles = css.create({
  // The groups of one section body stand apart by SettingsModal's `.setting-group` margin.
  body: { display: 'flex', flexDirection: 'column', gap: dimensions.space6 },
  // --setting-gap, the one gap between stacked setting cards, is --space-2.
  group: { display: 'flex', flexDirection: 'column', gap: dimensions.space2 },
  card: {
    display: 'flex',
    flexDirection: 'column',
    paddingTop: dimensions.space3,
    paddingBottom: dimensions.space3,
    paddingLeft: dimensions.space4,
    paddingRight: dimensions.space4,
    borderRadius: dimensions.radiusLg,
    backgroundColor: colors.surface2,
  },
});

// A settings section's body (SectionBody.svelte inside SettingsModal), a stack of setting groups.
export function RsdSettingSectionBody({ children }: { children: ReactNode }) {
  return (
    <html.div data-testid="setting-section-body" style={styles.body}>
      {children}
    </html.div>
  );
}

// SettingsModal's `.setting-group`: the cards that belong together.
export function RsdSettingGroup({ children }: { children: ReactNode }) {
  return (
    <html.section data-testid="setting-group" style={styles.group}>
      {children}
    </html.section>
  );
}

// SettingsModal's `.setting`: one card on the raised surface, holding a row or a picker.
export function RsdSettingCard({ children }: { children: ReactNode }) {
  return (
    <html.div data-testid="setting-card" style={styles.card}>
      {children}
    </html.div>
  );
}
