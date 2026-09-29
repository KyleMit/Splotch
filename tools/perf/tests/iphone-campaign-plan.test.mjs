import { describe, expect, it } from 'vitest';
import { ALL_ITEMS, CAMPAIGN_MODES, planCampaign } from '../lib/campaign-plan.mjs';

describe('physical iPhone campaign', () => {
  it.each(['iphone-device-web', 'iphone-device-native'])(
    '%s covers every handset mode and item',
    (targetId) => {
      const cells = planCampaign(targetId, {
        outputRoot: 'out',
        host: { deviceId: 'iphone-udid', url: 'http://host/' },
      });

      expect(cells).toHaveLength(CAMPAIGN_MODES.length * ALL_ITEMS.length);
      const actions = cells.find((cell) => cell.id === 'portrait-light/actions');
      expect(actions.args).toContain('--device-class=handset');
      expect(actions.args).toContain('--device-id=iphone-udid');
      const drawing = cells.find((cell) => cell.id === 'portrait-light/pen-undo');
      expect(drawing.command).toBe('perf:ios:xcuitest:screen');
      expect(drawing.args.includes('--native-app')).toBe(targetId.endsWith('native'));
    }
  );
});
