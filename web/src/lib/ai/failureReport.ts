import { APP_VERSION } from '$lib/appVersion';
import { getPlatform } from '$lib/platform';
import type { AiFailureDetails } from '$lib/state/aiGeneration.svelte';
import { truncateCodeUnits } from '$lib/truncate';
import type { StyleName } from './styles';

const MAX_ERROR_MESSAGE_LENGTH = 1000;

export function failureReportRows(
  failure: AiFailureDetails | null,
  attempts: number,
  style: StyleName | null
): { label: string; value: string }[] {
  return [
    {
      label: 'Error',
      value: failure
        ? `${failure.status ?? 'No response'} · ${failure.endpoint}`
        : 'Picture generation failed',
    },
    {
      label: 'Message',
      value:
        (failure &&
          truncateCodeUnits(
            failure.message.replace(/\s+/g, ' ').trim(),
            MAX_ERROR_MESSAGE_LENGTH
          )) ||
        'No error details available.',
    },
    { label: 'Attempts', value: `${attempts} in a row` },
    { label: 'App version', value: `${APP_VERSION} (${getPlatform()})` },
    { label: 'Art style', value: style ?? 'Default' },
  ];
}
